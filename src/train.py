"""Training loop for CheXpert multi-label classification."""

import argparse
import os
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim.lr_scheduler import CosineAnnealingLR, LinearLR, SequentialLR
from torch.utils.tensorboard import SummaryWriter
from tqdm import tqdm

from src.dataset import build_dataloaders, compute_pos_weights
from src.model import build_model
from src.utils import compute_aurocs, get_device, load_config, save_checkpoint


def masked_bce_loss(
    logits: torch.Tensor,
    labels: torch.Tensor,
    pos_weight: torch.Tensor | None = None,
) -> torch.Tensor:
    """BCE loss that ignores uncertain labels (stored as -1).

    Only positions where labels >= 0 (i.e. certain 0 or 1) contribute to the
    loss. This prevents the model from being trained on ambiguous signal.

    Args:
        logits: Raw model outputs, shape [B, C].
        labels: Ground-truth labels (0, 1, or -1 for uncertain), shape [B, C].
        pos_weight: Optional per-class weight vector of shape [C]. When
            provided each positive sample for class i is up-weighted by
            pos_weight[i]. Mitigates class imbalance without resampling.
    """
    mask = (labels >= 0).float()
    labels_clean = labels.clamp(min=0.0) # -1 → 0 at masked positions (won't count)

    if pos_weight is not None:
        # F.binary_cross_entropy_with_logits expects pos_weight broadcastable
        # to [B, C] — shape [C] works fine.
        per_elem = F.binary_cross_entropy_with_logits(
            logits, labels_clean, reduction="none",
            pos_weight=pos_weight.to(logits.device),
        )
    else:
        per_elem = F.binary_cross_entropy_with_logits(
            logits, labels_clean, reduction="none"
        )
    return (per_elem * mask).sum() / mask.sum().clamp(min=1.0)


def train_one_epoch(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    scaler: torch.amp.GradScaler,
    use_amp: bool,
) -> float:
    """Run one training epoch. Returns the mean loss."""
    model.train()
    running_loss = 0.0

    for images, labels in tqdm(loader, desc=" train", leave=False):
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad()
        with torch.autocast(device_type=device.type, enabled=use_amp):
            logits = model(images)
            loss = criterion(logits, labels)
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        scaler.step(optimizer)
        scaler.update()

        running_loss += loss.item() * images.size(0)

    return running_loss / len(loader.dataset)


@torch.no_grad()
def validate(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    device: torch.device,
    label_names: list[str],
    use_amp: bool = False,
) -> tuple[float, dict[str, float]]:
    """Run validation. Returns (mean_loss, per-label AUROCs)."""
    model.eval()
    running_loss = 0.0
    all_preds = []
    all_labels = []

    for images, labels in tqdm(loader, desc=" valid", leave=False):
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        with torch.autocast(device_type=device.type, enabled=use_amp):
            logits = model(images)
            loss = criterion(logits, labels)
        running_loss += loss.item() * images.size(0)

        probs = torch.sigmoid(logits)
        all_preds.append(probs.cpu().numpy())
        all_labels.append(labels.cpu().numpy())

    val_loss = running_loss / len(loader.dataset)
    all_preds = np.concatenate(all_preds)
    all_labels = np.concatenate(all_labels)

    aurocs = compute_aurocs(all_labels, all_preds, label_names)
    return val_loss, aurocs


def train(
    config_path: str = "configs/train_config.yaml",
    resume: bool = False,
) -> None:
    """Full training pipeline with automatic resume support."""
    cfg = load_config(config_path)
    device = get_device(cfg)
    print(f"Using device: {device}")

    # ── Data ──
    pin_memory = device.type == "cuda" # MPS doesn't support pin_memory
    train_loader, valid_loader = build_dataloaders(cfg, pin_memory=pin_memory)
    print(
        f"Train samples: {len(train_loader.dataset):,} | "
        f"Valid samples: {len(valid_loader.dataset):,}"
    )

    # ── Model ──
    model = build_model(cfg).to(device)
    if device.type == "cuda" and torch.cuda.device_count() > 1:
        print(f" Using DataParallel on {torch.cuda.device_count()} GPUs")
        model = nn.DataParallel(model)
    target_labels = cfg["labels"]["target_labels"]

    # ── Optimiser & scheduler ──
    train_cfg = cfg["training"]
    weight_decay = train_cfg["weight_decay"]

    # Bias terms, LayerNorm/BatchNorm weights must NOT get weight decay —
    # this is standard practice for all transformer (and CNN) models.
    no_decay = {"bias", "norm.weight", "norm1.weight", "norm2.weight",
                "LayerNorm.weight", "bn.weight"}
    decay_params = [p for n, p in model.named_parameters()
                    if not any(nd in n for nd in no_decay) and p.requires_grad]
    no_decay_params = [p for n, p in model.named_parameters()
                       if any(nd in n for nd in no_decay) and p.requires_grad]
    optimizer = torch.optim.AdamW(
        [
            {"params": decay_params, "weight_decay": weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ],
        lr=train_cfg["learning_rate"],
    )

    scheduler = None
    if train_cfg["scheduler"] == "cosine":
        warmup_epochs = train_cfg.get("warmup_epochs", 0)
        total_epochs = train_cfg["epochs"]
        if warmup_epochs > 0:
            warmup_sched = LinearLR(
                optimizer, start_factor=0.1, end_factor=1.0, total_iters=warmup_epochs
            )
            cosine_sched = CosineAnnealingLR(
                optimizer, T_max=max(1, total_epochs - warmup_epochs)
            )
            scheduler = SequentialLR(
                optimizer,
                schedulers=[warmup_sched, cosine_sched],
                milestones=[warmup_epochs],
            )
        else:
            scheduler = CosineAnnealingLR(optimizer, T_max=total_epochs)

    global_u_strat = cfg["data"].get("uncertainty_strategy", "u-zeros")
    per_label_strats = cfg["data"].get("per_label_strategies", {})
    # Use masked loss whenever ANY label may carry -1 (u-mask or nan-mask strategy)
    use_masked = (
        global_u_strat in ("u-mask", "nan-mask")
        or "u-mask" in per_label_strats.values()
        or "nan-mask" in per_label_strats.values()
    )
    use_pos_weight = cfg["training"].get("pos_weight", False)

    pos_weight_tensor = None
    if use_pos_weight:
        print("Computing pos_weight from training labels...")
        pos_weight_tensor = compute_pos_weights(
            csv_path=cfg["data"]["train_csv"],
            target_labels=target_labels,
            frontal_only=cfg["data"].get("frontal_only", True),
            per_label_strategies=cfg["data"].get("per_label_strategies", {}),
            global_strategy=cfg["data"].get("uncertainty_strategy", "u-zeros"),
        )

    if use_masked:
        criterion = lambda logits, labels: masked_bce_loss(
            logits, labels, pos_weight=pos_weight_tensor
        )
    elif use_pos_weight:
        criterion = nn.BCEWithLogitsLoss(
            pos_weight=pos_weight_tensor.to(device)
        )
    else:
        criterion = nn.BCEWithLogitsLoss()

    # ── Mixed precision (AMP) — only on CUDA ──
    use_amp = device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    # ── Logging ──
    log_cfg = cfg["logging"]
    exp = cfg.get("experiment_name", "default")
    checkpoint_dir = os.path.join(log_cfg["checkpoint_dir"], exp)
    log_dir = os.path.join(log_cfg["log_dir"], exp)
    os.makedirs(checkpoint_dir, exist_ok=True)
    os.makedirs(log_dir, exist_ok=True)

    writer = SummaryWriter(log_dir=log_dir)
    best_auroc = 0.0
    patience_counter = 0
    start_epoch = 1

    # ── Resume from last checkpoint ──
    raw_model = model.module if isinstance(model, nn.DataParallel) else model
    last_ckpt_path = os.path.join(checkpoint_dir, "last_checkpoint.pt")
    if resume and os.path.exists(last_ckpt_path):
        ckpt = torch.load(last_ckpt_path, map_location=device, weights_only=False)
        raw_model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        if scheduler and "scheduler_state_dict" in ckpt:
            scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        if use_amp and "scaler_state_dict" in ckpt:
            scaler.load_state_dict(ckpt["scaler_state_dict"])
        start_epoch = ckpt["epoch"] + 1
        best_auroc = ckpt.get("best_auroc", ckpt.get("auroc", 0.0))
        patience_counter = ckpt.get("patience_counter", 0)
        print(f" ↻ Resumed from epoch {ckpt['epoch']} "
              f"(best AUROC={best_auroc:.4f})")

    # ── Training loop ──
    for epoch in range(start_epoch, train_cfg["epochs"] + 1):
        t0 = time.time()
        print(f"\nEpoch {epoch}/{train_cfg['epochs']}")

        train_loss = train_one_epoch(
            model, train_loader, criterion, optimizer, device, scaler, use_amp
        )
        val_loss, aurocs = validate(
            model, valid_loader, criterion, device, target_labels, use_amp
        )

        if scheduler:
            scheduler.step()

        mean_auroc = np.nanmean(list(aurocs.values()))
        elapsed = time.time() - t0

        # ── Print & log ──
        print(f" train_loss={train_loss:.4f} val_loss={val_loss:.4f} "
              f"mean_AUROC={mean_auroc:.4f} ({elapsed:.1f}s)")
        for label, auc in aurocs.items():
            print(f" {label}: {auc:.4f}")

        writer.add_scalar("Loss/train", train_loss, epoch)
        writer.add_scalar("Loss/valid", val_loss, epoch)
        writer.add_scalar("AUROC/mean", mean_auroc, epoch)
        for label, auc in aurocs.items():
            writer.add_scalar(f"AUROC/{label}", auc, epoch)

        # ── Checkpointing ──
        if mean_auroc > best_auroc:
            best_auroc = mean_auroc
            patience_counter = 0
            best_ckpt_path = os.path.join(checkpoint_dir, "best_model.pt")
            save_checkpoint(
                raw_model, optimizer, epoch, mean_auroc,
                best_ckpt_path,
                scheduler=scheduler,
                scaler=scaler if use_amp else None,
                best_auroc=best_auroc,
                patience_counter=patience_counter,
            )
            # Mirror best checkpoint to /kaggle/working/ root so it survives
            # session interruptions and is always available in the Output tab.
            kaggle_output = os.path.join(
                "/kaggle/working",
                f"{exp}_best_model.pt",
            )
            if os.path.isdir("/kaggle/working") and os.path.abspath(best_ckpt_path) != os.path.abspath(kaggle_output):
                import shutil as _shutil
                _shutil.copy2(best_ckpt_path, kaggle_output)
            print(f" [OK] New best model (AUROC={mean_auroc:.4f})")
        else:
            patience_counter += 1
            if patience_counter >= train_cfg["early_stopping_patience"]:
                print(f" Early stopping after {epoch} epochs.")
                break

        # Always save latest state so we can resume after interruption
        save_checkpoint(
            raw_model, optimizer, epoch, mean_auroc,
            last_ckpt_path,
            scheduler=scheduler,
            scaler=scaler if use_amp else None,
            best_auroc=best_auroc,
            patience_counter=patience_counter,
        )

    writer.close()
    print(f"\nTraining complete. Best mean AUROC: {best_auroc:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train CheXpert classifier")
    parser.add_argument(
        "--config",
        type=str,
        default="configs/densenet121.yaml",
        help="Path to YAML config file",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume training from last_checkpoint.pt",
    )
    args = parser.parse_args()
    train(args.config, resume=args.resume)

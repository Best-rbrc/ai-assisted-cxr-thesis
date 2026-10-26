"""Evaluate a trained CheXpert model on the validation or test set."""

import argparse
import os

import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms
from tqdm import tqdm

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import compute_aurocs, compute_f1s, get_device, load_config


def _print_results(
    split_name: str,
    eval_loss: float,
    aurocs: dict[str, float],
    mean_auroc: float,
    tag: str = "",
    f1s: dict | None = None,
) -> None:
    label = f"{split_name} {tag}".strip()
    print(f"\n{'─' * 62}")
    print(f"  Split:      {label}")
    if eval_loss is not None:
        print(f"  Loss:       {eval_loss:.4f}")
    print(f"  Mean AUROC: {mean_auroc:.4f}")
    if f1s is not None:
        valid_f1 = [v["f1_05"] for v in f1s.values() if not np.isnan(v["f1_05"])]
        print(f"  Mean F1@0.5:{np.mean(valid_f1):.4f}" if valid_f1 else "  Mean F1@0.5: N/A")
        valid_opt = [v["f1_opt"] for v in f1s.values() if not np.isnan(v["f1_opt"])]
        print(f"  Mean F1-opt:{np.mean(valid_opt):.4f}" if valid_opt else "  Mean F1-opt: N/A")
    print(f"{'─' * 62}")
    if f1s is not None:
        print(f"  {'Label':30s}  {'AUROC':>6}  {'F1@0.5':>7}  {'F1-opt':>7}  {'T-opt':>6}")
        print(f"  {'─' * 30}  {'─' * 6}  {'─' * 7}  {'─' * 7}  {'─' * 6}")
        for name, auc in aurocs.items():
            fd = f1s.get(name, {})
            f05 = fd.get("f1_05", float("nan"))
            fop = fd.get("f1_opt", float("nan"))
            thr = fd.get("thresh_opt", float("nan"))
            print(f"  {name:30s}  {auc:6.4f}  {f05:7.4f}  {fop:7.4f}  {thr:6.2f}")
    else:
        for name, auc in aurocs.items():
            print(f"  {name:30s}  {auc:.4f}")
    print(f"{'─' * 62}")


def _run_evaluation(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    device: torch.device,
    target_labels: list[str],
    split_name: str,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Run inference on one DataLoader. Returns (preds, labels, loss)."""
    model.eval()
    running_loss = 0.0
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for images, labels in tqdm(loader, desc=f"Evaluating {split_name}"):
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            logits = model(images)
            loss = criterion(logits, labels)
            running_loss += loss.item() * images.size(0)

            probs = torch.sigmoid(logits)
            all_preds.append(probs.cpu().numpy())
            all_labels.append(labels.cpu().numpy())

    eval_loss = running_loss / len(loader.dataset)
    all_preds = np.concatenate(all_preds)
    all_labels = np.concatenate(all_labels)
    return all_preds, all_labels, eval_loss


def _run_tta(
    model: nn.Module,
    dataset: CheXpertDataset,
    device: torch.device,
    image_size: int,
    batch_size: int,
    num_workers: int,
    pin_memory: bool,
    use_cxr: bool = False,
) -> np.ndarray:
    """Test-time augmentation: average predictions over original + horizontal flip."""
    if use_cxr:
        flip_transform = transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=1.0),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5], std=[0.5]),
        ])
    else:
        flip_transform = transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(p=1.0),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

    orig_transform = dataset.transform
    dataset.transform = flip_transform

    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
        persistent_workers=num_workers > 0,
    )

    model.eval()
    flip_preds = []
    with torch.no_grad():
        for images, _ in tqdm(loader, desc="  TTA (flip)"):
            images = images.to(device, non_blocking=True)
            probs = torch.sigmoid(model(images))
            flip_preds.append(probs.cpu().numpy())

    dataset.transform = orig_transform
    return np.concatenate(flip_preds)


def evaluate(
    config_path: str,
    checkpoint_path: str,
    split: str = "valid",
    tta: bool = False,
) -> None:
    """Load a checkpoint and evaluate on the chosen split.

    Args:
        config_path: Path to YAML config.
        checkpoint_path: Path to a saved .pt checkpoint.
        split: "valid" or "test".
        tta: If True, also run test-time augmentation (horizontal flip average).
    """
    cfg = load_config(config_path)
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    pin_memory = device.type == "cuda"
    nw = cfg["training"]["num_workers"]
    image_size = data_cfg["image_size"]
    batch_size = cfg["training"]["batch_size"]

    if split == "test":
        if "test_csv" not in data_cfg:
            raise ValueError(
                "No 'test_csv' key in config. "
                "Run scripts/split_train_test.py first and add test_csv to the config."
            )
        csv_path = data_cfg["test_csv"]
        split_name = "TEST (held-out)"
    else:
        csv_path = data_cfg["valid_csv"]
        split_name = "Validation"

    use_cxr = data_cfg.get("cxr_pretrained", False)
    valid_tfm = get_cxr_valid_transforms(image_size) if use_cxr else get_valid_transforms(image_size)

    dataset = CheXpertDataset(
        csv_path=csv_path,
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=valid_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    dataset.grayscale = use_cxr
    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=nw,
        pin_memory=pin_memory,
        persistent_workers=nw > 0,
    )
    print(f"{split_name} samples: {len(dataset):,}")

    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded checkpoint: epoch {ckpt['epoch']}  "
          f"(saved AUROC={ckpt.get('auroc', float('nan')):.4f})")

    preds, labels, eval_loss = _run_evaluation(
        model, loader, nn.BCEWithLogitsLoss(), device, target_labels, split_name
    )

    aurocs = compute_aurocs(labels, preds, target_labels)
    mean_auroc = float(np.nanmean(list(aurocs.values())))
    f1s = compute_f1s(labels, preds, target_labels)
    _print_results(split_name, eval_loss, aurocs, mean_auroc, f1s=f1s)

    if tta:
        flip_preds = _run_tta(
            model, dataset, device, image_size, batch_size, nw, pin_memory,
            use_cxr=use_cxr,
        )
        tta_preds = (preds + flip_preds) / 2.0
        tta_aurocs = compute_aurocs(labels, tta_preds, target_labels)
        tta_mean = float(np.nanmean(list(tta_aurocs.values())))
        tta_f1s = compute_f1s(labels, tta_preds, target_labels)
        _print_results(split_name, None, tta_aurocs, tta_mean, tag="[TTA]", f1s=tta_f1s)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate CheXpert model")
    parser.add_argument("--config", default="configs/densenet121.yaml")
    parser.add_argument(
        "--checkpoint",
        default=None,
        help=(
            "Path to .pt checkpoint. Defaults to "
            "checkpoints/<experiment_name>/best_model.pt."
        ),
    )
    parser.add_argument(
        "--split",
        choices=["valid", "test"],
        default="valid",
        help="Which split to evaluate on. Use 'test' only for final reporting.",
    )
    parser.add_argument(
        "--tta",
        action="store_true",
        help="Enable test-time augmentation (horizontal flip average).",
    )
    args = parser.parse_args()

    if args.checkpoint is None:
        cfg_peek = load_config(args.config)
        exp = cfg_peek.get("experiment_name", "default")
        log_cfg = cfg_peek["logging"]
        args.checkpoint = os.path.join(log_cfg["checkpoint_dir"], exp, "best_model.pt")

    evaluate(args.config, args.checkpoint, split=args.split, tta=args.tta)

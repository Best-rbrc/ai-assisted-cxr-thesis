"""Post-hoc temperature scaling calibration for CheXpert models.

Fits a single temperature parameter T on the *validation* set so that
    calibrated_logit = raw_logit / T
then evaluates ECE and Brier score before and after calibration.

Usage::

    uv run python scripts/calibrate.py \\
        --config configs/densenet121_perclass.yaml \\
        --checkpoint checkpoints/densenet121/run010_densenet121_perclass_ep10_val0.7925_test0.8298.pt

The fitted temperature is saved as a JSON file next to the checkpoint, e.g.
``checkpoints/densenet121/run010_densenet121_perclass_ep10_val0.7925_test0.8298_temp.json``

A reliability diagram (before / after) is saved to
``outputs/calibration/<run_name>_reliability.png``.
"""

import argparse
import json
import os
import sys

import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from tqdm import tqdm

# Allow running from repo root without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import TemperatureScaler, compute_aurocs, get_device, load_config

OUTPUT_DIR = "outputs/calibration"


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def _collect_logits(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray]:
    """Run model in eval mode, return raw logits and ground-truth labels."""
    model.eval()
    all_logits, all_labels = [], []
    with torch.no_grad():
        for images, labels in tqdm(loader, desc="Collecting logits"):
            images = images.to(device, non_blocking=True)
            logits = model(images)
            all_logits.append(logits.cpu())
            all_labels.append(labels.cpu())
    return (
        torch.cat(all_logits).numpy(),
        torch.cat(all_labels).numpy(),
    )


# ---------------------------------------------------------------------------
# Reliability diagram
# ---------------------------------------------------------------------------

def _reliability_diagram(
    probs_before: np.ndarray,
    probs_after: np.ndarray,
    labels: np.ndarray,
    ece_before: float,
    ece_after: float,
    title: str,
    save_path: str,
    n_bins: int = 15,
) -> None:
    """Plot reliability diagrams for before/after calibration side by side."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle(title, fontsize=13)

    mask = labels >= 0
    for ax, probs, label_txt, ece in [
        (axes[0], probs_before, f"Before calibration  ECE={ece_before:.4f}", ece_before),
        (axes[1], probs_after,  f"After calibration   ECE={ece_after:.4f}",  ece_after),
    ]:
        p = probs[mask].ravel()
        y = labels[mask].ravel().astype(int)
        bins = np.linspace(0.0, 1.0, n_bins + 1)
        bin_accs, bin_confs, bin_sizes = [], [], []
        for lo, hi in zip(bins[:-1], bins[1:]):
            in_bin = (p >= lo) & (p < hi)
            if in_bin.sum() == 0:
                continue
            bin_accs.append(y[in_bin].mean())
            bin_confs.append(p[in_bin].mean())
            bin_sizes.append(in_bin.sum())

        ax.bar(bin_confs, bin_accs, width=0.05, alpha=0.7, label="Fraction positive", color="steelblue")
        ax.plot([0, 1], [0, 1], "k--", lw=1.5, label="Perfect calibration")
        ax.set_xlabel("Mean predicted probability")
        ax.set_ylabel("Fraction of positives")
        ax.set_title(label_txt)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Reliability diagram saved → {save_path}")


# ---------------------------------------------------------------------------
# Main calibration routine
# ---------------------------------------------------------------------------

def calibrate(config_path: str, checkpoint_path: str) -> None:
    cfg = load_config(config_path)
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    image_size = data_cfg["image_size"]
    batch_size = cfg["training"]["batch_size"]
    nw = cfg["training"]["num_workers"]
    pin_memory = device.type == "cuda"
    use_cxr = data_cfg.get("cxr_pretrained", False)

    # ---- Load validation set ------------------------------------------------
    valid_tfm = get_cxr_valid_transforms(image_size) if use_cxr else get_valid_transforms(image_size)
    val_dataset = CheXpertDataset(
        csv_path=data_cfg["valid_csv"],
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=valid_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    val_loader = torch.utils.data.DataLoader(
        val_dataset, batch_size=batch_size, shuffle=False,
        num_workers=nw, pin_memory=pin_memory, persistent_workers=nw > 0,
    )
    print(f"Validation samples: {len(val_dataset):,}")

    # ---- Load model ---------------------------------------------------------
    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded: {checkpoint_path}  (epoch {ckpt['epoch']})")

    # ---- Collect raw logits on val set -------------------------------------
    logits_np, labels_np = _collect_logits(model, val_loader, device)

    # ---- Metrics BEFORE calibration ----------------------------------------
    probs_before = torch.sigmoid(torch.tensor(logits_np)).numpy()
    ece_before = TemperatureScaler.compute_ece(probs_before, labels_np)
    brier_before = TemperatureScaler.compute_brier(probs_before, labels_np, target_labels)
    aurocs_before = compute_aurocs(labels_np, probs_before, target_labels)
    mean_auroc_before = float(np.nanmean(list(aurocs_before.values())))

    # ---- Fit temperature scaling -------------------------------------------
    scaler = TemperatureScaler(model).to(device)
    logits_t = torch.tensor(logits_np).to(device)
    labels_t = torch.tensor(labels_np).to(device)
    T = scaler.fit(logits_t, labels_t)

    # ---- Metrics AFTER calibration -----------------------------------------
    probs_after = torch.sigmoid(torch.tensor(logits_np) / T).numpy()
    ece_after = TemperatureScaler.compute_ece(probs_after, labels_np)
    brier_after = TemperatureScaler.compute_brier(probs_after, labels_np, target_labels)
    aurocs_after = compute_aurocs(labels_np, probs_after, target_labels)
    mean_auroc_after = float(np.nanmean(list(aurocs_after.values())))

    # ---- Print summary -------------------------------------------------------
    sep = "─" * 60
    print(f"\n{sep}")
    print(f"  Optimal temperature T = {T:.4f}")
    print(f"{sep}")
    print(f"  {'Metric':30s}  {'Before':>8}  {'After':>8}")
    print(f"  {'─' * 30}  {'─' * 8}  {'─' * 8}")
    print(f"  {'ECE (all labels)':30s}  {ece_before:8.4f}  {ece_after:8.4f}")
    print(f"  {'Mean AUROC':30s}  {mean_auroc_before:8.4f}  {mean_auroc_after:8.4f}")
    print(f"{sep}")
    print(f"  {'Label':30s}  {'Brier before':>12}  {'Brier after':>11}")
    print(f"  {'─' * 30}  {'─' * 12}  {'─' * 11}")
    for name in target_labels:
        bb = brier_before.get(name, float("nan"))
        ba = brier_after.get(name, float("nan"))
        print(f"  {name:30s}  {bb:12.4f}  {ba:11.4f}")
    print(f"{sep}\n")

    # ---- Save temperature JSON next to checkpoint ---------------------------
    base = os.path.splitext(checkpoint_path)[0]
    json_path = f"{base}_temp.json"
    with open(json_path, "w") as f:
        json.dump(
            {
                "temperature": T,
                "ece_before": ece_before,
                "ece_after": ece_after,
                "mean_auroc_before": mean_auroc_before,
                "mean_auroc_after": mean_auroc_after,
                "brier_before": brier_before,
                "brier_after": brier_after,
            },
            f,
            indent=2,
        )
    print(f"  Temperature saved → {json_path}")

    # ---- Reliability diagram -------------------------------------------------
    run_name = os.path.splitext(os.path.basename(checkpoint_path))[0]
    diagram_path = os.path.join(OUTPUT_DIR, f"{run_name}_reliability.png")
    _reliability_diagram(
        probs_before, probs_after, labels_np,
        ece_before, ece_after,
        title=f"Reliability Diagram — {run_name}",
        save_path=diagram_path,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Temperature scaling calibration")
    parser.add_argument("--config", required=True, help="Path to YAML config")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint")
    args = parser.parse_args()
    calibrate(args.config, args.checkpoint)

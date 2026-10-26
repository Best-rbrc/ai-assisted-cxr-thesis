"""Stratified AUROC + False Positive analysis for multi-label chest X-ray classification.

Run from project root (directory containing src/ and configs/):

  uv run python -m scripts.analyze_multilabel --config CONFIG --checkpoint CHECKPOINT

Examples:
  uv run python -m scripts.analyze_multilabel \
    --config configs/archive/run003_swin_tiny_v2_2026-02-26/swin_tiny.yaml \
    --checkpoint checkpoints/swin_tiny/run003_swin_tiny_v2_ep11_val0.7882_test0.8076.pt

  uv run python -m scripts.analyze_multilabel \
    --config configs/archive/run004_vit_base_2026-02-27/vit_base.yaml \
    --checkpoint checkpoints/vit_base/run004_vit_base_ep10_val0.7854_test0.8041.pt
"""

import argparse
import os

import numpy as np
import torch
from sklearn.metrics import roc_auc_score
from tqdm import tqdm

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import get_device, load_config


def _compute_aurocs_masked(y_true, y_pred, label_names, mask):
    """Per-label AUROC on rows where mask is True. Excludes uncertain (-1)."""
    aurocs = {}
    for i, name in enumerate(label_names):
        col_true = y_true[:, i]
        col_pred = y_pred[:, i]
        certain = (col_true >= 0) & mask
        try:
            aurocs[name] = roc_auc_score(col_true[certain], col_pred[certain])
        except ValueError:
            aurocs[name] = float("nan")
    return aurocs


def run_analysis(config_path: str, checkpoint_path: str) -> None:
    print("Loading config and dataset...", flush=True)
    cfg = load_config(config_path)
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    pin_memory = device.type == "cuda"
    nw = cfg["training"]["num_workers"]
    image_size = data_cfg["image_size"]
    batch_size = cfg["training"]["batch_size"]

    if "test_csv" not in data_cfg:
        raise ValueError("Config must have test_csv for this analysis.")

    use_cxr = data_cfg.get("cxr_pretrained", False)
    valid_tfm = get_cxr_valid_transforms(image_size) if use_cxr else get_valid_transforms(image_size)

    dataset = CheXpertDataset(
        csv_path=data_cfg["test_csv"],
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
    print(f"Test samples: {len(dataset):,}", flush=True)

    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded checkpoint: epoch {ckpt['epoch']}  (saved AUROC={ckpt.get('auroc', float('nan')):.4f})", flush=True)

    print("Running inference on test set...", flush=True)
    model.eval()
    all_preds = []
    all_labels = []
    with torch.no_grad():
        for images, labels in tqdm(loader, desc="Collecting predictions"):
            images = images.to(device, non_blocking=True)
            logits = model(images)
            probs = torch.sigmoid(logits)
            all_preds.append(probs.cpu().numpy())
            all_labels.append(labels.cpu().numpy())

    preds = np.concatenate(all_preds)
    labels = np.concatenate(all_labels)

    # ─── Stratified AUROC (0–1 vs 2+ diseases) ───
    n_positive = (labels == 1).sum(axis=1).astype(int)
    multi_mask = n_positive >= 2
    single_mask = n_positive <= 1

    n_single = single_mask.sum()
    n_multi = multi_mask.sum()

    aurocs_single = _compute_aurocs_masked(labels, preds, target_labels, single_mask)
    aurocs_multi  = _compute_aurocs_masked(labels, preds, target_labels, multi_mask)

    mean_single = float(np.nanmean(list(aurocs_single.values())))
    mean_multi  = float(np.nanmean(list(aurocs_multi.values())))

    model_name = cfg.get("experiment_name", os.path.basename(checkpoint_path))
    print(f"\n{'═' * 72}")
    print(f"  Stratified AUROC — {model_name}")
    print(f"  Checkpoint: {checkpoint_path}")
    print(f"  Test samples: {len(labels):,}  (0–1 diseases: {n_single:,}  |  2+ diseases: {n_multi:,})")
    print(f"{'═' * 72}")
    print(f"  {'Label':<28}  {'N(0-1)':>8}  {'AUROC(0-1)':>10}  {'N(2+)':>8}  {'AUROC(2+)':>10}  {'Δ':>8}")
    print(f"  {'-'*28}  {'-'*8}  {'-'*10}  {'-'*8}  {'-'*10}  {'-'*8}")
    for name in target_labels:
        s = aurocs_single[name]
        m = aurocs_multi[name]
        delta = (m - s) if not (np.isnan(s) or np.isnan(m)) else float("nan")
        idx = target_labels.index(name)
        n_s = int(((labels[:, idx] >= 0) & single_mask).sum())
        n_m = int(((labels[:, idx] >= 0) & multi_mask).sum())
        print(f"  {name:<28}  {n_s:>8,}  {s:>10.4f}  {n_m:>8,}  {m:>10.4f}  {delta:>+8.4f}")
    print(f"  {'-'*28}  {'-'*8}  {'-'*10}  {'-'*8}  {'-'*10}  {'-'*8}")
    print(f"  {'MEAN':<28}  {'':>8}  {mean_single:>10.4f}  {'':>8}  {mean_multi:>10.4f}  {mean_multi-mean_single:>+8.4f}")
    print(f"{'═' * 72}")
    if mean_multi < mean_single:
        print("  → Model performs worse on samples with 2+ diseases.")
    else:
        print("  → Model performs similarly or better on multi-disease samples.")

    # ─── False positive analysis (threshold 0.5) ───
    thresh = 0.5
    pred_pos = preds >= thresh
    n_samples = len(labels)
    any_fp_per_sample = np.zeros(n_samples, dtype=bool)

    print(f"\n  False positives (threshold={thresh})")
    print(f"  {'═' * 72}")
    print(f"  {'Label':<28}  {'Negatives':>10}  {'FP':>8}  {'FPR (%)':>10}  {'Samples w/ FP':>14}")
    print(f"  {'-'*28}  {'-'*10}  {'-'*8}  {'-'*10}  {'-'*14}")
    for i, name in enumerate(target_labels):
        col_true = labels[:, i]
        col_pred_pos = pred_pos[:, i]
        neg = int((col_true == 0).sum())
        fp  = int(((col_true == 0) & col_pred_pos).sum())
        fpr_pct = 100.0 * fp / neg if neg > 0 else float("nan")
        pct_s = 100.0 * fp / n_samples
        any_fp_per_sample |= ((col_true == 0) & col_pred_pos)
        print(f"  {name:<28}  {neg:>10,}  {fp:>8,}  {fpr_pct:>9.2f}%  {fp:>6,} ({pct_s:>5.1f}%)")
    total_neg = int((labels == 0).sum())
    total_fp  = int(((labels == 0) & pred_pos).sum())
    overall_fpr = 100.0 * total_fp / total_neg if total_neg else float("nan")
    n_any_fp = int(any_fp_per_sample.sum())
    pct_any_fp = 100.0 * n_any_fp / n_samples
    print(f"  {'-'*28}  {'-'*10}  {'-'*8}  {'-'*10}  {'-'*14}")
    print(f"  {'OVERALL':<28}  {total_neg:>10,}  {total_fp:>8,}  {overall_fpr:>9.2f}%  —")
    print(f"  Samples with ≥1 false positive (any label): {n_any_fp:,} / {n_samples:,} ({pct_any_fp:.1f}%)")
    print(f"  {'═' * 72}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stratified AUROC + False Positive analysis.")
    parser.add_argument("--config",     required=True, help="Path to YAML config (must have test_csv).")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint.")
    args = parser.parse_args()
    run_analysis(args.config, args.checkpoint)

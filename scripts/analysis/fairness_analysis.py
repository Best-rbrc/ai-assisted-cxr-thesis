"""Subgroup fairness analysis for CheXpert models.

Evaluates per-label AUROC and F1@0.5 broken down by:
  - Sex       (Male / Female)
  - Age bins  (18-40 / 41-60 / 61-80 / 80+)
  - View      (AP / PA)  — proxy for acquisition protocol

Usage::

    uv run python scripts/fairness_analysis.py \\
        --config configs/densenet121_perclass.yaml \\
        --checkpoint checkpoints/densenet121/run010_densenet121_perclass_ep10_val0.7925_test0.8298.pt

Outputs
-------
  outputs/fairness/<run_name>_fairness_sex.png
  outputs/fairness/<run_name>_fairness_age.png
  outputs/fairness/<run_name>_fairness_view.png
  outputs/fairness/<run_name>_fairness_summary.csv
"""

import argparse
import os
import sys

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, roc_auc_score
from tqdm import tqdm

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import get_device, load_config

OUTPUT_DIR = "outputs/fairness"

AGE_BINS = [0, 40, 60, 80, 200]
AGE_LABELS = ["≤40", "41–60", "61–80", "80+"]


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _run_inference(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in tqdm(loader, desc="Inference"):
            images = images.to(device, non_blocking=True)
            probs = torch.sigmoid(model(images))
            all_preds.append(probs.cpu().numpy())
            all_labels.append(labels.numpy())
    return np.concatenate(all_preds), np.concatenate(all_labels)


# ---------------------------------------------------------------------------
# Per-subgroup metrics
# ---------------------------------------------------------------------------

def _metrics_for_subset(
    preds: np.ndarray,
    labels: np.ndarray,
    target_labels: list[str],
    threshold: float = 0.5,
) -> dict[str, dict]:
    """Compute AUROC + F1@threshold for each label over the given subset."""
    results = {}
    for i, name in enumerate(target_labels):
        ct = labels[:, i]
        cp = preds[:, i]
        mask = ct >= 0
        ct_m = ct[mask].astype(int)
        cp_m = cp[mask]

        if len(np.unique(ct_m)) < 2 or len(ct_m) == 0:
            results[name] = {"auroc": float("nan"), "f1": float("nan"), "n": int(mask.sum())}
            continue

        try:
            auroc = roc_auc_score(ct_m, cp_m)
        except Exception:
            auroc = float("nan")

        try:
            f1 = f1_score(ct_m, (cp_m >= threshold).astype(int), zero_division=0)
        except Exception:
            f1 = float("nan")

        results[name] = {"auroc": auroc, "f1": f1, "n": int(mask.sum())}
    return results


def _mean_auroc(results: dict) -> float:
    vals = [v["auroc"] for v in results.values() if isinstance(v, dict) and not np.isnan(v["auroc"])]
    return float(np.mean(vals)) if vals else float("nan")


def _mean_f1(results: dict) -> float:
    vals = [v["f1"] for v in results.values() if isinstance(v, dict) and not np.isnan(v["f1"])]
    return float(np.mean(vals)) if vals else float("nan")


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------

def _print_subgroup_table(
    group_name: str,
    groups: dict[str, dict],
    target_labels: list[str],
) -> None:
    sep = "─" * 70
    print(f"\n{sep}")
    print(f"  Fairness: {group_name}")
    print(f"{sep}")
    group_keys = list(groups.keys())
    header = f"  {'Label':30s}" + "".join(f"  {g:>12}" for g in group_keys)
    print(header + "  (AUROC)")
    print(f"  {'─' * 30}" + "".join(f"  {'─' * 12}" for _ in group_keys))
    for label in target_labels:
        row = f"  {label:30s}"
        for g in group_keys:
            val = groups[g].get(label, {}).get("auroc", float("nan"))
            row += f"  {val:12.4f}" if not np.isnan(val) else f"  {'N/A':>12}"
        print(row)
    # Mean row
    row = f"  {'MEAN':30s}"
    for g in group_keys:
        row += f"  {_mean_auroc(groups[g]):12.4f}"
    print(f"  {'─' * 30}" + "".join(f"  {'─' * 12}" for _ in group_keys))
    print(row)
    print(sep)


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def _barplot_subgroups(
    groups: dict[str, dict],
    target_labels: list[str],
    title: str,
    save_path: str,
    metric: str = "auroc",
) -> None:
    """Grouped bar chart: labels on x-axis, bars = subgroups."""
    group_names = list(groups.keys())
    x = np.arange(len(target_labels))
    width = 0.8 / len(group_names)
    offsets = np.linspace(-(0.4 - width / 2), (0.4 - width / 2), len(group_names))

    fig, ax = plt.subplots(figsize=(max(10, len(target_labels) * 1.5), 5))
    colors = plt.cm.Set2(np.linspace(0, 1, len(group_names)))

    for idx, (gname, color) in enumerate(zip(group_names, colors)):
        vals = [groups[gname].get(lbl, {}).get(metric, float("nan")) for lbl in target_labels]
        ns = [groups[gname].get(lbl, {}).get("n", 0) for lbl in target_labels]
        bars = ax.bar(x + offsets[idx], vals, width, label=f"{gname} (n≈{min(ns)})", color=color, alpha=0.85)
        for bar, v in zip(bars, vals):
            if not np.isnan(v):
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.005,
                        f"{v:.3f}", ha="center", va="bottom", fontsize=7, rotation=45)

    ax.set_xticks(x)
    ax.set_xticklabels(target_labels, rotation=20, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel(metric.upper())
    ax.set_title(title)
    ax.axhline(0.5, color="red", linestyle="--", lw=0.8, alpha=0.5, label="Random baseline")
    ax.legend(fontsize=8)
    ax.grid(True, axis="y", alpha=0.3)
    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Plot saved → {save_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def fairness_analysis(config_path: str, checkpoint_path: str) -> None:
    cfg = load_config(config_path)
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    image_size = data_cfg["image_size"]
    batch_size = cfg["training"]["batch_size"]
    nw = cfg["training"]["num_workers"]
    pin_memory = device.type == "cuda"
    use_cxr = data_cfg.get("cxr_pretrained", False)

    # ---- Test dataset (keep full DataFrame for metadata) --------------------
    if "test_csv" not in data_cfg:
        raise ValueError("No 'test_csv' in config. Run scripts/split_train_test.py first.")

    valid_tfm = get_cxr_valid_transforms(image_size) if use_cxr else get_valid_transforms(image_size)
    dataset = CheXpertDataset(
        csv_path=data_cfg["test_csv"],
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=valid_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    loader = torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=False,
        num_workers=nw, pin_memory=pin_memory, persistent_workers=nw > 0,
    )
    print(f"Test samples: {len(dataset):,}")

    # Metadata aligned with the dataset (same row order as DataLoader)
    meta_df = dataset.df.reset_index(drop=True)

    # ---- Load model ---------------------------------------------------------
    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"Loaded: {checkpoint_path}  (epoch {ckpt['epoch']})")

    # ---- Inference ----------------------------------------------------------
    preds, labels = _run_inference(model, loader, device)
    assert len(preds) == len(meta_df), (
        f"Length mismatch: preds={len(preds)}, meta={len(meta_df)}"
    )

    run_name = os.path.splitext(os.path.basename(checkpoint_path))[0]

    # ========================================================================
    # 1) Sex subgroups
    # ========================================================================
    sex_groups = {}
    for sex_val in ["Male", "Female"]:
        idx = (meta_df["Sex"] == sex_val).values
        if idx.sum() < 10:
            print(f"  Skipping Sex={sex_val}: only {idx.sum()} samples")
            continue
        sex_groups[sex_val] = _metrics_for_subset(preds[idx], labels[idx], target_labels)
        sex_groups[sex_val]["_n_total"] = int(idx.sum())

    _print_subgroup_table("Sex", {k: v for k, v in sex_groups.items() if not k.startswith("_")}, target_labels)
    _barplot_subgroups(
        sex_groups, target_labels,
        title=f"AUROC by Sex — {run_name}",
        save_path=os.path.join(OUTPUT_DIR, f"{run_name}_fairness_sex.png"),
    )

    # ========================================================================
    # 2) Age bins
    # ========================================================================
    # Age column may have NaN or non-numeric values in some CheXpert editions
    age_col = pd.to_numeric(meta_df["Age"], errors="coerce")
    age_binned = pd.cut(age_col, bins=AGE_BINS, labels=AGE_LABELS, right=True)

    age_groups = {}
    for bin_label in AGE_LABELS:
        idx = (age_binned == bin_label).values
        if idx.sum() < 10:
            print(f"  Skipping Age={bin_label}: only {idx.sum()} samples")
            continue
        age_groups[bin_label] = _metrics_for_subset(preds[idx], labels[idx], target_labels)
        age_groups[bin_label]["_n_total"] = int(idx.sum())

    _print_subgroup_table("Age", {k: v for k, v in age_groups.items() if not k.startswith("_")}, target_labels)
    _barplot_subgroups(
        age_groups, target_labels,
        title=f"AUROC by Age Group — {run_name}",
        save_path=os.path.join(OUTPUT_DIR, f"{run_name}_fairness_age.png"),
    )

    # ========================================================================
    # 3) View (AP / PA) — proxy for acquisition protocol
    # ========================================================================
    view_groups = {}
    for view_val in ["AP", "PA"]:
        if "AP/PA" not in meta_df.columns:
            print("  Skipping View analysis: 'AP/PA' column not found in CSV.")
            break
        idx = (meta_df["AP/PA"] == view_val).values
        if idx.sum() < 10:
            print(f"  Skipping View={view_val}: only {idx.sum()} samples")
            continue
        view_groups[view_val] = _metrics_for_subset(preds[idx], labels[idx], target_labels)
        view_groups[view_val]["_n_total"] = int(idx.sum())

    if view_groups:
        _print_subgroup_table("View (AP/PA)", {k: v for k, v in view_groups.items() if not k.startswith("_")}, target_labels)
        _barplot_subgroups(
            view_groups, target_labels,
            title=f"AUROC by View (AP/PA) — {run_name}",
            save_path=os.path.join(OUTPUT_DIR, f"{run_name}_fairness_view.png"),
        )

    # ========================================================================
    # 4) CSV summary
    # ========================================================================
    rows = []
    for group_type, groups in [("Sex", sex_groups), ("Age", age_groups), ("View", view_groups)]:
        for gname, gres in groups.items():
            if gname.startswith("_"):
                continue
            for label in target_labels:
                m = gres.get(label, {})
                rows.append({
                    "group_type": group_type,
                    "group": gname,
                    "label": label,
                    "auroc": m.get("auroc", float("nan")),
                    "f1_05": m.get("f1", float("nan")),
                    "n": m.get("n", 0),
                })
            # mean row
            rows.append({
                "group_type": group_type,
                "group": gname,
                "label": "MEAN",
                "auroc": _mean_auroc({k: v for k, v in gres.items() if not k.startswith("_")}),
                "f1_05": _mean_f1({k: v for k, v in gres.items() if not k.startswith("_")}),
                "n": gres.get("_n_total", 0),
            })

    summary_df = pd.DataFrame(rows)
    csv_path = os.path.join(OUTPUT_DIR, f"{run_name}_fairness_summary.csv")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    summary_df.to_csv(csv_path, index=False)
    print(f"\n  Summary CSV saved → {csv_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Subgroup fairness analysis for CheXpert models")
    parser.add_argument("--config", required=True, help="Path to YAML config")
    parser.add_argument("--checkpoint", required=True, help="Path to .pt checkpoint")
    args = parser.parse_args()
    fairness_analysis(args.config, args.checkpoint)

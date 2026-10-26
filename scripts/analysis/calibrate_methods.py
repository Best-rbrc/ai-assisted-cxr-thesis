"""Sensitivity analysis of post-hoc calibration methods on the production model.

Extends ``calibrate.py`` (single-temperature scaling) with two more expressive
methods that operate per label:

* Per-label temperature scaling: one scalar per label, fit by BCE.
* Per-label isotonic regression: piecewise-constant monotonic map per label.

Outputs:
    * JSON next to checkpoint:  ``<ckpt>_calib_methods.json``
    * 4-panel reliability diagram in ``outputs/calibration/``
    * Logits cached to ``<ckpt>_val_logits.npz`` to skip inference on reruns.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.isotonic import IsotonicRegression
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.dataset import CheXpertDataset, get_cxr_valid_transforms, get_valid_transforms
from src.model import build_model
from src.utils import TemperatureScaler, compute_aurocs, get_device, load_config

OUTPUT_DIR = "outputs/calibration"


def _collect_logits(model, loader, device):
    model.eval()
    all_logits, all_labels = [], []
    with torch.no_grad():
        for images, labels in tqdm(loader, desc="Collecting logits"):
            images = images.to(device, non_blocking=True)
            all_logits.append(model(images).cpu())
            all_labels.append(labels.cpu())
    return torch.cat(all_logits).numpy(), torch.cat(all_labels).numpy()


def _fit_per_label_temperature(logits: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Fit one temperature scalar per label by minimising BCE on val."""
    C = logits.shape[1]
    T = np.ones(C)
    for c in range(C):
        mask = labels[:, c] >= 0
        if mask.sum() == 0:
            continue
        l_t = torch.tensor(logits[mask, c], dtype=torch.float32)
        y_t = torch.tensor(labels[mask, c], dtype=torch.float32)
        t_param = torch.nn.Parameter(torch.ones(1))
        opt = torch.optim.LBFGS([t_param], lr=0.01, max_iter=50)
        criterion = torch.nn.BCEWithLogitsLoss()

        def _step():
            opt.zero_grad()
            loss = criterion(l_t / t_param, y_t)
            loss.backward()
            return loss

        opt.step(_step)
        with torch.no_grad():
            t_param.clamp_(0.1, 10.0)
        T[c] = float(t_param.item())
    return T


def _apply_per_label_temperature(logits: np.ndarray, T: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-(logits / T[None, :])))


def _fit_per_label_isotonic(probs: np.ndarray, labels: np.ndarray):
    """Fit one isotonic regressor per label on (raw-probability, label) pairs."""
    C = probs.shape[1]
    iso = []
    for c in range(C):
        mask = labels[:, c] >= 0
        ir = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        ir.fit(probs[mask, c], labels[mask, c])
        iso.append(ir)
    return iso


def _apply_per_label_isotonic(probs: np.ndarray, iso) -> np.ndarray:
    out = np.empty_like(probs)
    for c, ir in enumerate(iso):
        out[:, c] = ir.transform(probs[:, c])
    return out


def _reliability_quadpanel(panels, save_path: str, n_bins: int = 15) -> None:
    """panels: list of (probs, labels, ece, title) tuples."""
    n = len(panels)
    fig, axes = plt.subplots(1, n, figsize=(4.2 * n, 4.4))
    if n == 1:
        axes = [axes]
    for ax, (probs, labels, ece, title) in zip(axes, panels):
        mask = labels >= 0
        p = probs[mask].ravel()
        y = labels[mask].ravel().astype(int)
        bins = np.linspace(0.0, 1.0, n_bins + 1)
        confs, accs = [], []
        for lo, hi in zip(bins[:-1], bins[1:]):
            in_bin = (p >= lo) & (p < hi)
            if in_bin.sum() == 0:
                continue
            confs.append(p[in_bin].mean())
            accs.append(y[in_bin].mean())
        ax.bar(confs, accs, width=0.05, alpha=0.75, color="steelblue", label="Fraction positive")
        ax.plot([0, 1], [0, 1], "k--", lw=1.3, label="Perfect calibration")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Mean predicted probability")
        ax.set_ylabel("Fraction of positives")
        ax.set_title(f"{title}\nECE = {ece:.4f}")
        ax.grid(True, alpha=0.3)
        ax.legend(fontsize=8, loc="upper left")
    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Reliability diagram saved → {save_path}")


def _logits_for_split(cfg, split_csv, device, cache_path):
    if os.path.exists(cache_path):
        print(f"Loading cached logits from {cache_path}")
        cache = np.load(cache_path)
        return cache["logits"], cache["labels"]

    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    image_size = data_cfg["image_size"]
    batch_size = cfg["training"]["batch_size"]
    nw = cfg["training"]["num_workers"]
    use_cxr = data_cfg.get("cxr_pretrained", False)
    valid_tfm = get_cxr_valid_transforms(image_size) if use_cxr else get_valid_transforms(image_size)
    ds = CheXpertDataset(
        csv_path=split_csv,
        data_dir=data_cfg["data_dir"],
        target_labels=target_labels,
        transform=valid_tfm,
        frontal_only=data_cfg["frontal_only"],
        uncertainty_strategy="u-ones",
    )
    loader = torch.utils.data.DataLoader(
        ds, batch_size=batch_size, shuffle=False,
        num_workers=nw, pin_memory=device.type == "cuda", persistent_workers=nw > 0,
    )
    print(f"  Samples: {len(ds):,}")

    cfg["model"]["pretrained"] = False
    model = build_model(cfg).to(device)
    ckpt = torch.load(cfg["_checkpoint_path"], map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])

    logits_np, labels_np = _collect_logits(model, loader, device)
    np.savez(cache_path, logits=logits_np, labels=labels_np)
    print(f"  Logits cached → {cache_path}")
    return logits_np, labels_np


def run(config_path: str, checkpoint_path: str) -> None:
    cfg = load_config(config_path)
    cfg["_checkpoint_path"] = checkpoint_path
    device = get_device(cfg)
    data_cfg = cfg["data"]
    target_labels = cfg["labels"]["target_labels"]
    base = os.path.splitext(checkpoint_path)[0]

    print("─── VAL split (for fitting) ───")
    logits_np, labels_np = _logits_for_split(cfg, data_cfg["valid_csv"], device, f"{base}_val_logits.npz")
    print("─── TEST split (for out-of-sample evaluation) ───")
    test_logits, test_labels = _logits_for_split(cfg, data_cfg["test_csv"], device, f"{base}_test_logits.npz")

    probs_val_raw = 1.0 / (1.0 + np.exp(-logits_np))
    probs_test_raw = 1.0 / (1.0 + np.exp(-test_logits))

    # ---- Fit all methods on VAL --------------------------------------------
    T_global = float(TemperatureScaler(torch.nn.Identity()).fit(
        torch.tensor(logits_np), torch.tensor(labels_np)))
    T_per = _fit_per_label_temperature(logits_np, labels_np)
    iso = _fit_per_label_isotonic(probs_val_raw, labels_np)

    # ---- Apply to TEST and evaluate ----------------------------------------
    def _eval(probs, labels):
        ece = TemperatureScaler.compute_ece(probs, labels)
        brier = TemperatureScaler.compute_brier(probs, labels, target_labels)
        return ece, brier

    probs_test = {
        "raw":             probs_test_raw,
        "global_temp":     1.0 / (1.0 + np.exp(-test_logits / T_global)),
        "per_label_temp":  _apply_per_label_temperature(test_logits, T_per),
        "isotonic":        _apply_per_label_isotonic(probs_test_raw, iso),
    }
    results = {k: _eval(v, test_labels) for k, v in probs_test.items()}

    # Also evaluate on val for the in-sample comparison
    probs_val = {
        "raw":             probs_val_raw,
        "global_temp":     1.0 / (1.0 + np.exp(-logits_np / T_global)),
        "per_label_temp":  _apply_per_label_temperature(logits_np, T_per),
        "isotonic":        _apply_per_label_isotonic(probs_val_raw, iso),
    }
    results_val = {k: _eval(v, labels_np) for k, v in probs_val.items()}

    aurocs = compute_aurocs(test_labels, probs_test_raw, target_labels)
    mean_auroc_test = float(np.nanmean(list(aurocs.values())))

    sep = "─" * 78
    print(f"\n{sep}")
    print(f"  Calibration method comparison  (fit on val n = {labels_np.shape[0]:,},")
    print(f"                                  evaluate on test n = {test_labels.shape[0]:,})")
    print(f"{sep}")
    print(f"  {'Method':<32}  {'ECE val':>8}  {'ECE test':>9}  {'Brier mean test':>16}")
    print(f"  {'-' * 32}  {'-' * 8}  {'-' * 9}  {'-' * 16}")
    label_map = {
        "raw":            "Raw (no calibration)",
        "global_temp":    f"Global T = {T_global:.4f}",
        "per_label_temp": "Per-label T",
        "isotonic":       "Per-label isotonic",
    }
    for key, name in label_map.items():
        ece_v = results_val[key][0]
        ece_t, brier_t = results[key]
        bm = float(np.mean(list(brier_t.values())))
        print(f"  {name:<32}  {ece_v:8.4f}  {ece_t:9.4f}  {bm:16.4f}")
    print(f"{sep}")
    print(f"  Per-label temperatures: " + ", ".join(
        f"{name}={t:.3f}" for name, t in zip(target_labels, T_per)
    ))
    print(f"  Test mean AUROC (unchanged by monotonic recal.): {mean_auroc_test:.4f}")
    print(f"{sep}\n")

    out_json = f"{base}_calib_methods.json"
    with open(out_json, "w") as f:
        json.dump({
            "n_val":                int(labels_np.shape[0]),
            "n_test":               int(test_labels.shape[0]),
            "global_temperature":   T_global,
            "per_label_temperature": dict(zip(target_labels, T_per.tolist())),
            "ece_val": {k: results_val[k][0] for k in label_map},
            "ece_test": {k: results[k][0] for k in label_map},
            "brier_mean_test": {k: float(np.mean(list(results[k][1].values()))) for k in label_map},
            "brier_per_label_test": {k: results[k][1] for k in label_map},
            "test_mean_auroc": mean_auroc_test,
        }, f, indent=2)
    print(f"  Wrote {out_json}")

    run_name = os.path.splitext(os.path.basename(checkpoint_path))[0]
    diag_path = os.path.join(OUTPUT_DIR, f"{run_name}_calib_methods.png")
    _reliability_quadpanel(
        [
            (probs_test["raw"],            test_labels, results["raw"][0],            "Raw"),
            (probs_test["global_temp"],    test_labels, results["global_temp"][0],    f"Global T = {T_global:.3f}"),
            (probs_test["per_label_temp"], test_labels, results["per_label_temp"][0], "Per-label T"),
            (probs_test["isotonic"],       test_labels, results["isotonic"][0],       "Per-label isotonic"),
        ],
        diag_path,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Post-hoc calibration method comparison")
    parser.add_argument("--config", required=True)
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()
    run(args.config, args.checkpoint)

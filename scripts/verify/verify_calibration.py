"""Reproduce calibration numbers in results.tex §4.1.2 and appendices/a.tex
(tab:brier-scores).

Reads pre-computed calibration JSON written by scripts/calibrate.py.

Inputs:  checkpoints/densenet121/run014_..._temp.json
         checkpoints/densenet121/run010_..._temp.json
Output:  text report on stdout; flags any mismatch vs. thesis claims.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RUN014 = ROOT / "checkpoints/densenet121/run014_densenet121_6labels_ep09_val0.8038_test0.8361_temp.json"
RUN010 = ROOT / "checkpoints/densenet121/run010_densenet121_perclass_ep10_val0.7925_test0.8298_temp.json"

# Thesis claims for Run 014 (production model, results.tex §4.1.2 + appendix B):
EXPECTED_RUN014 = {
    "temperature":            (1.007, 0.001),
    "ece_before":             (0.141, 0.001),
    "ece_after":              (0.141, 0.001),
    "brier_Cardiomegaly":     (0.126, 0.001),
    "brier_Edema":            (0.153, 0.001),
    "brier_Consolidation":    (0.204, 0.001),
    "brier_Atelectasis":      (0.206, 0.001),
    "brier_Pleural Effusion": (0.136, 0.001),
    "brier_Pneumothorax":     (0.106, 0.001),
    "brier_Mean":             (0.155, 0.001),
}


def check_run(json_path: Path, expected: dict | None = None) -> None:
    if not json_path.exists():
        print(f"  MISSING: {json_path.name}")
        return
    data = json.loads(json_path.read_text())
    print(f"\n=== {json_path.name} ===")
    print(f"  Temperature:          {data['temperature']:.4f}")
    print(f"  ECE (pre-scaling):    {data['ece_before']:.4f}")
    print(f"  ECE (post-scaling):   {data['ece_after']:.4f}")
    print(f"  Mean AUROC (pre):     {data['mean_auroc_before']:.4f}")
    print(f"  Mean AUROC (post):    {data['mean_auroc_after']:.4f}")
    print(f"  Brier (per label):")
    brier_pre = data["brier_before"]
    brier_post = data["brier_after"]
    for label, v in brier_pre.items():
        print(f"    {label:18s}  pre={v:.4f}  post={brier_post[label]:.4f}")
    brier_mean = sum(brier_pre.values()) / len(brier_pre)
    print(f"    {'MEAN':<18}  pre={brier_mean:.4f}")

    if expected is None:
        return
    print(f"  --- Comparison vs. thesis ---")
    flat = {
        "temperature": data["temperature"],
        "ece_before":  data["ece_before"],
        "ece_after":   data["ece_after"],
        "brier_Mean":  brier_mean,
    }
    for k, v in brier_pre.items():
        flat[f"brier_{k}"] = v
    for key, (exp, tol) in expected.items():
        actual = flat.get(key)
        if actual is None:
            continue
        ok = abs(actual - exp) <= tol
        mark = "✓" if ok else "✗"
        print(f"    {mark} {key:30s} actual={actual:.4f}  expected={exp:.3f}  diff={actual-exp:+.4f}")


def main() -> None:
    print("Calibration cross-check")
    check_run(RUN014, EXPECTED_RUN014)
    check_run(RUN010, None)


if __name__ == "__main__":
    main()

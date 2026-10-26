"""Reproduce XAI/attention numbers in results.tex §4.1.3 (tab:xai-metrics) and
the attention-entropy claim (13.92 ± 0.05 nats) from outputs/explainability_metrics.csv.

Inputs:  outputs/explainability_metrics.csv (written by scripts/compute_explainability_metrics.py)
Output:  text report on stdout; flags any mismatch vs. thesis claims.
"""
from __future__ import annotations

import csv
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent.parent
CSV_PATH = ROOT / "outputs/explainability_metrics.csv"

# Thesis tab:xai-metrics rows:
EXPECTED = {
    "patient00082": dict(iou=0.776, ssim=0.886, pearson=0.965),
    "patient35759": dict(iou=0.701, ssim=0.862, pearson=0.936),
    "patient38491": dict(iou=0.765, ssim=0.875, pearson=0.950),
}
EXPECTED_MEAN = dict(iou=0.747, ssim=0.875, pearson=0.950)
EXPECTED_ENTROPY = (13.92, 0.05)


def main() -> None:
    with CSV_PATH.open(newline="") as f:
        rows = list(csv.DictReader(f))

    print(f"=== {CSV_PATH.name} ({len(rows)} rows) ===")
    print(f"{'sample':<14}  {'iou':>7}  {'ssim':>7}  {'pearson r':>10}  {'entropy':>10}")
    for r in rows:
        print(f"  {r['sample_id']:<12}  {float(r['heatmap_iou_mean']):>7.3f}  "
              f"{float(r['ssim_mean']):>7.3f}  {float(r['method_correlation_mean']):>10.3f}  "
              f"{float(r['attention_entropy_mean']):>10.3f}")

    # Per-case comparison vs thesis tab:xai-metrics
    print("\n=== Cross-check vs results.tex tab:xai-metrics ===")
    flags = []
    case_rows = [r for r in rows if r["sample_id"].startswith("patient")]
    for r in case_rows:
        pid = r["sample_id"]
        exp = EXPECTED.get(pid)
        if not exp:
            continue
        iou = float(r["heatmap_iou_mean"])
        ssim = float(r["ssim_mean"])
        pear = float(r["method_correlation_mean"])
        for name, actual, expected in [("iou", iou, exp["iou"]), ("ssim", ssim, exp["ssim"]), ("pearson", pear, exp["pearson"])]:
            ok = abs(actual - expected) <= 0.001
            mark = "✓" if ok else "✗"
            print(f"  {mark} {pid:<14} {name:<8} actual={actual:.3f}  expected={expected:.3f}  diff={actual-expected:+.4f}")
            if not ok:
                flags.append(f"{pid} {name}: {actual:.3f} ≠ {expected:.3f}")

    # Aggregated means across the three case studies
    case_only = [r for r in case_rows if r["sample_id"] in EXPECTED]
    m_iou = mean(float(r["heatmap_iou_mean"]) for r in case_only)
    m_ssim = mean(float(r["ssim_mean"]) for r in case_only)
    m_pear = mean(float(r["method_correlation_mean"]) for r in case_only)
    print(f"\n  MEAN across 3 cases:  iou={m_iou:.3f}  ssim={m_ssim:.3f}  pearson={m_pear:.3f}")
    print(f"  Thesis 'mean' row:    iou=0.747  ssim=0.875  pearson=0.950")
    for name, actual, expected in [("iou", m_iou, 0.747), ("ssim", m_ssim, 0.875), ("pearson", m_pear, 0.950)]:
        ok = abs(actual - expected) <= 0.001
        mark = "✓" if ok else "✗"
        if not ok:
            flags.append(f"MEAN {name}: {actual:.3f} ≠ {expected:.3f}")
        print(f"  {mark} mean {name}: actual={actual:.3f}  expected={expected:.3f}")

    # Attention entropy (results.tex §4.1.3: "mean = 13.92 ± 0.05 nats across the three cases")
    entropies = [float(r["attention_entropy_mean"]) for r in case_only]
    m_ent = mean(entropies)
    # Sample standard deviation
    if len(entropies) > 1:
        var = sum((x - m_ent) ** 2 for x in entropies) / (len(entropies) - 1)
        sd_ent = var ** 0.5
    else:
        sd_ent = 0.0
    print(f"\n  Attention entropy: mean={m_ent:.3f}  sd={sd_ent:.3f}  (thesis: 13.92 ± 0.05)")
    exp_mean, exp_sd = EXPECTED_ENTROPY
    if abs(m_ent - exp_mean) > 0.01:
        flags.append(f"attention entropy mean: {m_ent:.3f} ≠ {exp_mean:.2f}")

    print("\nFlags:")
    if not flags:
        print("  (none) — all thesis claims reproduce.")
    else:
        for f in flags:
            print(f"  ✗ {f}")


if __name__ == "__main__":
    main()

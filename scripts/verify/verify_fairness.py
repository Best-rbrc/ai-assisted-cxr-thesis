"""Reproduce all fairness numbers in results.tex §4.1.4 (tab:fairness-age, tab:fairness-view)
from the precomputed CSV written by scripts/fairness_analysis.py.

Inputs:  outputs/fairness/run014_..._fairness_summary.csv
Output:  text report on stdout; flags any mismatch vs. thesis claims.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CSV_PATH = ROOT / "outputs/fairness/run014_densenet121_6labels_ep09_val0.8038_test0.8361_fairness_summary.csv"

LABEL_ORDER = ["Cardiomegaly", "Edema", "Consolidation", "Atelectasis", "Pleural Effusion", "Pneumothorax"]


def load() -> list[dict]:
    with CSV_PATH.open(newline="") as f:
        return list(csv.DictReader(f))


def print_table(rows: list[dict], group_type: str, groups: list[str]) -> dict:
    """Print AUROC table for one stratification (Sex/Age/View)."""
    by_group_label = defaultdict(dict)
    n_by_group = {}
    for r in rows:
        if r["group_type"] != group_type:
            continue
        by_group_label[r["group"]][r["label"]] = float(r["auroc"])
        n_by_group[r["group"]] = int(r["n"])
    print(f"\n=== {group_type} ===")
    header = f"  {'Label':<18} " + " ".join(f"{g:>10}" for g in groups)
    print(header)
    print(f"  {'n':<18} " + " ".join(f"{n_by_group.get(g,0):>10,d}" for g in groups))
    print(f"  {'-'*16:<18} " + " ".join("-"*10 for _ in groups))
    for lbl in LABEL_ORDER + ["MEAN"]:
        vals = [by_group_label[g].get(lbl) for g in groups]
        row = f"  {lbl:<18} " + " ".join(
            f"{v:>10.3f}" if v is not None else " " * 10 for v in vals
        )
        print(row)
    return by_group_label


def main() -> None:
    rows = load()
    print(f"Loaded {len(rows)} fairness rows from {CSV_PATH.name}")

    sex_data  = print_table(rows, "Sex",  ["Male", "Female"])
    age_data  = print_table(rows, "Age",  ["≤40", "41–60", "61–80", "80+"])
    view_data = print_table(rows, "View", ["AP", "PA"])

    # --- Checks against thesis claims ---
    print("\n=== Cross-check vs. thesis ===")
    flags = []

    # Sex: Male 0.834 vs Female 0.840, Δ=0.006
    m, f = sex_data["Male"]["MEAN"], sex_data["Female"]["MEAN"]
    print(f"  Sex MEAN: Male={m:.3f}  Female={f:.3f}  Δ={f-m:+.3f}  (thesis: 0.834 / 0.840 / 0.006)")
    if round(m, 3) != 0.834: flags.append(f"Sex Male MEAN: {m:.3f} ≠ 0.834")
    if round(f, 3) != 0.840: flags.append(f"Sex Female MEAN: {f:.3f} ≠ 0.840")
    # Largest sex gap: Pneumothorax F-M = +0.014
    pneumo_gap = sex_data["Female"]["Pneumothorax"] - sex_data["Male"]["Pneumothorax"]
    print(f"  Pneumothorax F-M gap: {pneumo_gap:+.3f}  (thesis: +0.014)")
    if round(pneumo_gap, 3) != 0.014: flags.append(f"Pneumo sex gap: {pneumo_gap:+.3f} ≠ +0.014")

    # Age: 0.864 → 0.812 across ≤40 → 80+
    young, old = age_data["≤40"]["MEAN"], age_data["80+"]["MEAN"]
    print(f"  Age MEAN: ≤40={young:.3f}  80+={old:.3f}  Δ={young-old:+.3f}  (thesis: 0.864 / 0.812 / 0.051)")
    if round(young, 3) != 0.864: flags.append(f"Age ≤40 MEAN: {young:.3f} ≠ 0.864")
    if round(old, 3) != 0.812: flags.append(f"Age 80+ MEAN: {old:.3f} ≠ 0.812")
    # Atelectasis age gap (steepest): ≤40 - 80+ = 0.085
    atel_gap = age_data["≤40"]["Atelectasis"] - age_data["80+"]["Atelectasis"]
    print(f"  Atelectasis ≤40-80+ gap: {atel_gap:+.3f}  (thesis: 0.085)")
    if round(atel_gap, 3) != 0.085: flags.append(f"Atelectasis age gap: {atel_gap:+.3f} ≠ 0.085")
    # Pneumothorax age gap (smallest): ≤40 - 80+ = 0.016
    pne_age_gap = age_data["≤40"]["Pneumothorax"] - age_data["80+"]["Pneumothorax"]
    print(f"  Pneumothorax ≤40-80+ gap: {pne_age_gap:+.3f}  (thesis: 0.016)")
    if round(pne_age_gap, 3) != 0.016: flags.append(f"Pneumo age gap: {pne_age_gap:+.3f} ≠ 0.016")

    # View: AP 0.828 vs PA 0.862, Δ=0.035
    ap, pa = view_data["AP"]["MEAN"], view_data["PA"]["MEAN"]
    print(f"  View MEAN: AP={ap:.3f}  PA={pa:.3f}  Δ={pa-ap:+.3f}  (thesis: 0.828 / 0.862 / 0.035)")
    if round(ap, 3) != 0.828: flags.append(f"View AP MEAN: {ap:.3f} ≠ 0.828")
    if round(pa, 3) != 0.862: flags.append(f"View PA MEAN: {pa:.3f} ≠ 0.862")
    # Atelectasis AP/PA gap (largest)
    atel_view = view_data["PA"]["Atelectasis"] - view_data["AP"]["Atelectasis"]
    print(f"  Atelectasis PA-AP gap: {atel_view:+.3f}  (thesis: +0.078)")
    if round(atel_view, 3) != 0.078: flags.append(f"Atelectasis view gap: {atel_view:+.3f} ≠ +0.078")
    # Pneumothorax AP-PA gap (only label where AP > PA)
    pne_view = view_data["PA"]["Pneumothorax"] - view_data["AP"]["Pneumothorax"]
    print(f"  Pneumothorax PA-AP gap: {pne_view:+.3f}  (thesis: -0.005)")
    if round(pne_view, 3) != -0.005: flags.append(f"Pneumo view gap: {pne_view:+.3f} ≠ -0.005")

    # Sample sizes
    print(f"\n  Sample sizes (n): Sex M/F = "
          f"{int(next(r['n'] for r in rows if r['group_type']=='Sex' and r['group']=='Male')):,}/"
          f"{int(next(r['n'] for r in rows if r['group_type']=='Sex' and r['group']=='Female')):,}  "
          f"(thesis: 16,822 / 11,817)")
    print(f"  Age: " + ", ".join(
        f"{g}={int(next(r['n'] for r in rows if r['group_type']=='Age' and r['group']==g)):,}"
        for g in ["≤40","41–60","61–80","80+"]
    ) + "  (thesis: 4,164 / 9,107 / 11,075 / 4,292)")
    ap_n = int(next(r['n'] for r in rows if r['group_type']=='View' and r['group']=='AP'))
    pa_n = int(next(r['n'] for r in rows if r['group_type']=='View' and r['group']=='PA'))
    print(f"  View: AP={ap_n:,} ({ap_n/(ap_n+pa_n)*100:.1f}%)  PA={pa_n:,} ({pa_n/(ap_n+pa_n)*100:.1f}%)  "
          f"(thesis: 24,249 / 4,389; 85% / 15%)")

    print("\nFlags:")
    if not flags:
        print("  (none) — all thesis claims reproduce.")
    else:
        for f in flags:
            print(f"  ✗ {f}")


if __name__ == "__main__":
    main()

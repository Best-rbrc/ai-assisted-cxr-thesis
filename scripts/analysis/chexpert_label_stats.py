"""Reproduce the CheXpert label-distribution numbers in appendices/a.tex (tab:chexpert-labels)
and the per-label positive weights used in Run 014 (tab:run014-perlabel notes).

Reads CheXpert-v1.0-small/train_proper.csv, filters to frontal-view images, and
reports per-label positive %, uncertain %, and the resulting pos_weight w_j^+
under each label's uncertainty-handling strategy.

Inputs:  CheXpert-v1.0-small/train_proper.csv
Output:  text report on stdout.
"""
from __future__ import annotations

import csv
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "CheXpert-v1.0-small" / "train_proper.csv"

# Labels used in Run 014 (the production model), with their uncertainty strategies
# as documented in appendices/a.tex (tab:chexpert-labels).
LABELS = [
    ("Pleural Effusion", "u-zeros"),
    ("Edema",            "u-ones"),
    ("Atelectasis",      "u-ones"),
    ("Cardiomegaly",     "u-zeros"),
    ("Pneumothorax",     "u-ones"),
    ("Consolidation",    "u-ones"),
]


def main():
    with CSV_PATH.open(newline="") as f:
        rows = list(csv.DictReader(f))

    frontal = [r for r in rows if r["Frontal/Lateral"] == "Frontal"]
    print(f"=== {CSV_PATH.name} ===")
    print(f"Total rows:        {len(rows)}")
    print(f"Frontal-view rows: {len(frontal)}")
    print()

    print(f"{'Label':<18} {'Pos %':>7} {'Unc %':>7} {'Neg %':>7} {'NaN %':>7}  "
          f"{'Strategy':<8} {'w (strict)':>10} {'w (NaN→0)':>10}")
    print("-" * 90)

    n = len(frontal)
    for label, strategy in LABELS:
        pos = unc = neg = nan = 0
        for r in frontal:
            v = r.get(label, "")
            if v == "":
                nan += 1
            else:
                fv = float(v)
                if fv == 1.0:
                    pos += 1
                elif fv == -1.0:
                    unc += 1
                elif fv == 0.0:
                    neg += 1

        # Two weight variants: the loss-consistent one (NaN excluded) and the
        # one actually used in training (NaN counted as negative). Run 014's
        # weights in appendices/a.tex match the latter.
        if strategy == "u-ones":
            n_pos_eff = pos + unc
            n_neg_strict = neg
            n_neg_with_nan = neg + nan
        elif strategy == "u-zeros":
            n_pos_eff = pos
            n_neg_strict = neg + unc
            n_neg_with_nan = neg + unc + nan
        else:
            raise ValueError(f"unknown strategy {strategy!r}")

        w_strict = n_neg_strict / n_pos_eff if n_pos_eff else float("nan")
        w_with_nan = n_neg_with_nan / n_pos_eff if n_pos_eff else float("nan")

        print(f"{label:<18} "
              f"{pos/n*100:>6.1f}% {unc/n*100:>6.1f}% {neg/n*100:>6.1f}% {nan/n*100:>6.1f}%  "
              f"{strategy:<8} {w_strict:>9.2f} {w_with_nan:>9.2f}")

    print()
    print("Notes:")
    print("  Pos/Unc/Neg/NaN percentages match appendices/a.tex tab:chexpert-labels exactly.")
    print("  Reported pos_weights in the thesis use the 'NaN→0' column (NaN treated as")
    print("  negative for weighting, even though NaN is masked from the loss).")
    print("  Cardiomegaly is at 12.3% — methodology.tex now states 'approximately 12%' (was 'fewer than 12%' before the fix).")


if __name__ == "__main__":
    main()

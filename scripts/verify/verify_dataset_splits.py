"""Reproduce the CheXpert-v1.0-small split sizes claimed in methodology.tex and
appendices/a.tex (tab:chexpert-split).

Inputs:  CheXpert-v1.0-small/{train,train_proper,val_proper,test,valid}.csv

Output:  text report on stdout; flags any mismatch vs. thesis claims.
"""
from __future__ import annotations

import csv
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "CheXpert-v1.0-small"

SPLITS = [
    ("train.csv",        "Train (full, original CheXpert split)",     223_414, None),
    ("train_split.csv",  "Train split (85% of patients, derived)",    None,    None),
    ("train_proper.csv", "Train proper (95% of train_split, derived)",180_241, 154_148),
    ("val_proper.csv",   "Val proper (5% of train_split, derived)",     9_661,   8_240),
    ("test.csv",         "Test (15% of patients, derived)",            33_512,  28_639),
    ("valid.csv",        "Official CheXpert validation set",              234,    None),
]


def count(path: Path) -> tuple[int, int]:
    """Return (total_rows, frontal_rows). Skips the header row."""
    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        total = 0
        frontal = 0
        for r in reader:
            total += 1
            if r.get("Frontal/Lateral") == "Frontal":
                frontal += 1
    return total, frontal


def main() -> None:
    print(f"{'File':<22} {'Description':<48} {'Total':>10} {'Frontal':>10}  Match")
    print("-" * 110)
    any_mismatch = False
    for fname, descr, expected_total, expected_frontal in SPLITS:
        path = BASE / fname
        if not path.exists():
            print(f"{fname:<22} {descr:<48} {'MISSING':>10}")
            any_mismatch = True
            continue
        total, frontal = count(path)
        match_marks = []
        if expected_total is not None:
            ok = total == expected_total
            match_marks.append(f"total={total == expected_total} (expected {expected_total})")
            if not ok:
                any_mismatch = True
        if expected_frontal is not None:
            ok = frontal == expected_frontal
            match_marks.append(f"frontal={ok} (expected {expected_frontal})")
            if not ok:
                any_mismatch = True
        marks = "; ".join(match_marks) if match_marks else "(no claim to check)"
        print(f"{fname:<22} {descr:<48} {total:>10} {frontal:>10}  {marks}")
    print()
    print("Thesis claims (methodology.tex §3.2 + appendices/a.tex tab:chexpert-split):")
    print("  train.csv:      223,414 total")
    print("  train_proper:   180,241 total / 154,148 frontal")
    print("  val_proper:       9,661 total /   8,240 frontal")
    print("  test.csv:        33,512 total /  28,639 frontal")
    print("  valid.csv:          234 total")
    print()
    print("OVERALL:", "FAIL — see above" if any_mismatch else "all reproducible split sizes match")


if __name__ == "__main__":
    main()

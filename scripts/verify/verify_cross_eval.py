"""Document the source of results.tex tab:crosseval (Runs 014/015/016 on the
shared full-CheXpert test set, n=28,300).

This script does NOT reproduce the numbers because the full CheXpert test split
(28,300 images) is not stored locally — only CheXpert-v1.0-small is on disk.
To reproduce, run scripts/src/evaluate.py with --config configs/<run>.yaml and a
test CSV pointing at the full-CheXpert held-out split.

Outputs: text report listing the thesis numbers and what would be needed to
reproduce them.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CKPT = ROOT / "checkpoints"

THESIS_CROSSEVAL = [
    # label, run014_dn224, run015_dn512, run016_swin384
    ("Cardiomegaly",     0.843, 0.849, 0.847),
    ("Edema",            0.852, 0.861, 0.864),
    ("Consolidation",    0.707, 0.714, 0.722),
    ("Atelectasis",      0.713, 0.718, 0.725),
    ("Pleural Effusion", 0.877, 0.878, 0.884),
    ("Pneumothorax",     0.880, 0.928, 0.922),
    ("MEAN",             0.812, 0.825, 0.827),
]


def main() -> None:
    print("=== Cross-evaluation (results.tex tab:crosseval) ===")
    print("Test set: full CheXpert, n = 28,300 (NOT stored locally)")
    print()

    have_014 = (CKPT / "densenet121/run014_densenet121_6labels_ep09_val0.8038_test0.8361.pt").exists()
    have_015 = (CKPT / "densenet121/run015_densenet121_6labels_full512_ep18_val0.8272_test0.8246.pt").exists()
    have_016 = (CKPT / "swin_tiny/run016_swin_tiny_6labels_full384_ep11_val0.8286_test0.8272.pt").exists()
    print(f"Checkpoints available:  run014={have_014}  run015={have_015}  run016={have_016}")
    print(f"Full-CheXpert test CSV:  NOT present (only CheXpert-v1.0-small is on disk)")
    print()

    print(f"{'Label':<18} {'Run 014':>8} {'Run 015':>8} {'Run 016':>8} {'Δ(016-014)':>11}")
    print("-" * 65)
    for label, r14, r15, r16 in THESIS_CROSSEVAL:
        print(f"{label:<18} {r14:>8.3f} {r15:>8.3f} {r16:>8.3f} {r16-r14:>+11.3f}")
    print()
    print("To reproduce these numbers locally:")
    print("  1. Download the full CheXpert dataset (Stanford ML group).")
    print("  2. Create a held-out test split CSV with the 28,300 patients.")
    print("  3. Run:  uv run python -m src.evaluate \\")
    print("              --config configs/densenet121_6labels.yaml \\")
    print("              --checkpoint checkpoints/densenet121/run014_...pt \\")
    print("              --split test  # but with test_csv pointing at full-CheXpert")
    print("     repeat for run015 and run016 configs/checkpoints.")
    print()
    print("Without the full-CheXpert test CSV on disk, these claims cannot be re-derived;")
    print("they are sourced from the original training logs and the thesis carries them forward.")


if __name__ == "__main__":
    main()

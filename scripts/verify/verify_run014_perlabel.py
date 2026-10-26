"""Reproduce per-label test AUROC, F1, and optimal-threshold numbers in
results.tex tab:run014-perlabel by parsing the saved evaluate.py output.

To regenerate the source file from the checkpoint (takes ~7 min on Apple-MPS):
  uv run python -u -m src.evaluate \\
      --config configs/densenet121_6labels.yaml \\
      --checkpoint checkpoints/densenet121/run014_densenet121_6labels_ep09_val0.8038_test0.8361.pt \\
      --split test 2>&1 | tee outputs/run014_test_eval_raw.log
  # Then keep only the result lines:
  cat outputs/run014_test_eval_raw.log | tr '\\r' '\\n' \\
      | grep -E "Split|Loss|AUROC|F1|Label|─|Cardio|Edema|Cons|Atel|Pleural|Pneumo" \\
      > outputs/run014_test_eval.txt

Inputs:  outputs/run014_test_eval.txt
Output:  text report on stdout; flags any mismatch vs. thesis claims.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
EVAL_PATH = ROOT / "outputs/run014_test_eval.txt"

# Thesis tab:run014-perlabel:
EXPECTED = {
    "Cardiomegaly":     dict(auroc=0.876, f1_05=0.561, f1_opt=0.553, t_opt=0.46),
    "Edema":            dict(auroc=0.865, f1_05=0.693, f1_opt=0.696, t_opt=0.55),
    "Consolidation":    dict(auroc=0.742, f1_05=0.441, f1_opt=0.440, t_opt=0.49),
    "Atelectasis":      dict(auroc=0.741, f1_05=0.572, f1_opt=0.572, t_opt=0.50),
    "Pleural Effusion": dict(auroc=0.882, f1_05=0.786, f1_opt=0.786, t_opt=0.50),
    "Pneumothorax":     dict(auroc=0.911, f1_05=0.558, f1_opt=0.563, t_opt=0.51),
}
EXPECTED_MEAN = dict(auroc=0.836, f1_05=0.602, f1_opt=0.602)

LABEL_RE = re.compile(
    r"^\s*(Cardiomegaly|Edema|Consolidation|Atelectasis|Pleural Effusion|Pneumothorax)\s+"
    r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"
)


def main() -> None:
    if not EVAL_PATH.exists():
        print(f"ERROR: {EVAL_PATH} not found.")
        print(__doc__)
        return

    text = EVAL_PATH.read_text()
    print(f"=== {EVAL_PATH.name} ===")
    print(text)

    # Parse per-label rows
    actual = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if m:
            actual[m.group(1)] = dict(
                auroc=float(m.group(2)),
                f1_05=float(m.group(3)),
                f1_opt=float(m.group(4)),
                t_opt=float(m.group(5)),
            )

    # Extract mean rows from header block
    mean_auroc = mean_f105 = mean_f1opt = None
    for line in text.splitlines():
        if line.strip().startswith("Mean AUROC:"):
            mean_auroc = float(line.split(":")[1])
        elif line.strip().startswith("Mean F1@0.5:"):
            mean_f105 = float(line.split(":")[1])
        elif line.strip().startswith("Mean F1-opt:"):
            mean_f1opt = float(line.split(":")[1])

    print("=== Cross-check vs. results.tex tab:run014-perlabel ===")
    flags = []
    for label, exp in EXPECTED.items():
        if label not in actual:
            flags.append(f"{label}: missing in eval output")
            continue
        act = actual[label]
        for k, ev in exp.items():
            av = act[k]
            tol = 0.005 if k == "t_opt" else 0.001
            ok = abs(round(av, 3) - ev) <= tol
            mark = "✓" if ok else "✗"
            print(f"  {mark} {label:<18} {k:<7} actual={av:.4f}  expected={ev:.3f}  diff={av-ev:+.4f}")
            if not ok:
                flags.append(f"{label} {k}: {av:.4f} ≠ {ev:.3f}")

    print()
    for k, av, ev in [("MEAN auroc", mean_auroc, EXPECTED_MEAN["auroc"]),
                      ("MEAN F1@0.5", mean_f105, EXPECTED_MEAN["f1_05"]),
                      ("MEAN F1-opt", mean_f1opt, EXPECTED_MEAN["f1_opt"])]:
        if av is None:
            flags.append(f"{k}: not parsed from output")
            continue
        ok = abs(round(av, 3) - ev) <= 0.001
        mark = "✓" if ok else "✗"
        print(f"  {mark} {k:<14} actual={av:.4f}  expected={ev:.3f}")
        if not ok:
            flags.append(f"{k}: {av:.4f} ≠ {ev:.3f}")

    print("\nFlags:")
    if not flags:
        print("  (none) — all thesis claims reproduce.")
    else:
        for f in flags:
            print(f"  ✗ {f}")


if __name__ == "__main__":
    main()

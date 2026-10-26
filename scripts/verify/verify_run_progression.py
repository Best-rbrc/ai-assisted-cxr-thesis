"""Reproduce the per-run test AUROCs in results.tex tab:all-runs by
extracting them from checkpoint filenames in checkpoints/.

Checkpoint filenames encode test AUROC, e.g.:
  run014_densenet121_6labels_ep09_val0.8038_test0.8361.pt
                                              ^^^^^^

Inputs:  checkpoints/{densenet121,swin_tiny,vit_base,densenet121_cxr}/*.pt
Output:  text report on stdout; lists every checkpoint with its parsed test AUROC,
         then prints the thesis tab:all-runs in the order claimed.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent / "checkpoints"

CKPT_RE = re.compile(r"(run\d+)_.*?test([\d.]+)\.pt$")

# Thesis tab:all-runs (results.tex)
THESIS_RUNS = [
    ("001", "DenseNet121",        "u-mask",                                0.789),
    ("002", "Swin-Tiny (v1)",     "u-mask (misconfigured)",                0.791),
    ("003", "Swin-Tiny (v2)",     "u-mask",                                0.808),
    ("004", "ViT-Base/16",        "u-mask",                                0.804),
    ("005", "Swin-Tiny (v3)",     "u-mask, 384px",                         0.808),
    ("006", "DenseNet121 (CXR)",  "u-mask, CXR pretraining",               0.785),
    ("007", "Swin-Tiny",          "u-mask, single-label Consolidation",    0.708),
    ("008", "Swin-Tiny",          "u-mixed + pw",                          0.813),
    ("009", "ViT-Base/16",        "u-mixed + pw",                          0.812),
    ("010", "DenseNet121",        "u-mixed + pw",                          0.830),
    ("011", "DenseNet121",        "u-mixed + pw, patience 7",              0.815),
    ("012", "DenseNet121",        "u-mixed + pw, 7 labels",                0.827),
    ("013", "DenseNet121",        "u-mixed + pw + nan-mask, 7 labels",     0.762),
    ("014", "DenseNet121",        "u-mixed + pw, 6 labels",                0.836),
    ("015", "DenseNet121",        "u-ones + pw, 512px, full",              0.825),
    ("016", "Swin-Tiny",          "u-ones + pw, 384px, full",              0.827),
]


def find_checkpoints() -> dict[str, list[tuple[str, float]]]:
    """Return {run_id: [(filename, parsed_auroc), ...]}."""
    result: dict[str, list] = {}
    for ckpt in sorted(ROOT.rglob("*.pt")):
        m = CKPT_RE.search(ckpt.name)
        if not m:
            continue
        run_id = m.group(1).replace("run", "")
        auroc = float(m.group(2))
        result.setdefault(run_id, []).append((str(ckpt.relative_to(ROOT)), auroc))
    return result


def main() -> None:
    print("=== Checkpoints found ===")
    ckpts = find_checkpoints()
    for run_id in sorted(ckpts):
        for fname, auroc in ckpts[run_id]:
            print(f"  Run {run_id}  test AUROC={auroc:.4f}  ({fname})")

    print("\n=== Cross-check vs results.tex tab:all-runs ===")
    print(f"{'Run':>5}  {'Arch / strategy':<55}  {'Thesis':>7}  {'Ckpt':>7}  Match")
    print("-" * 95)
    flags = []
    for run_id, arch, strategy, thesis_auroc in THESIS_RUNS:
        descr = f"{arch} — {strategy}"
        ck = ckpts.get(run_id, [])
        if not ck:
            print(f"{'  '+run_id:>5}  {descr:<55}  {thesis_auroc:>7.3f}  {'—':>7}  (no checkpoint)")
            continue
        # Run can have multiple checkpoints (e.g. with _temp.json); take the first .pt
        ckpt_auroc = ck[0][1]
        ok = abs(round(ckpt_auroc, 3) - thesis_auroc) <= 0.001
        mark = "✓" if ok else "✗"
        print(f"{'  '+run_id:>5}  {descr:<55}  {thesis_auroc:>7.3f}  {ckpt_auroc:>7.4f}  {mark}")
        if not ok:
            flags.append(f"Run {run_id}: ckpt {ckpt_auroc:.4f} ≠ thesis {thesis_auroc:.3f}")

    print("\nFlags:")
    if not flags:
        print("  (none) — all per-run test AUROCs reproducible from checkpoint filenames.")
    else:
        for f in flags:
            print(f"  ✗ {f}")
    missing = [run_id for run_id, *_ in THESIS_RUNS if run_id not in ckpts]
    if missing:
        print(f"\n  Note: checkpoints not stored locally for runs: {', '.join(missing)}")


if __name__ == "__main__":
    main()

"""Regenerate Figure 4.X (AI-helpful slider by role x AI literacy).

Reuses the data-loading and classification logic from analyze_user_study.py
so the plotted values stay locked to the same source of truth as the numbers
reported in results.tex.

Usage (from project root):
  uv run python -m scripts.plot_xai_helpfulness_matrix
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from scripts.analysis.analyze_user_study import ai_lit, load, role_of

ROLES = ["Non-medical", "Doctor (junior)", "Student", "Doctor (experienced)"]
ROLE_LABELS = {
    "Non-medical": "Non-medical",
    "Doctor (junior)": "Junior\ndoctor",
    "Student": "Student",
    "Doctor (experienced)": "Experienced\ndoctor",
}
LITERACY = ["none", "basic", "good"]
LITERACY_LABELS = {"none": "None", "basic": "Basic", "good": "Good"}
XAI_CONDS = {"C", "E"}  # matches analyze_user_study.py "XAI ratings by role x AI literacy" section
MIN_TRIALS = 4
OUTPUT = Path(__file__).resolve().parent.parent.parent / "HSG-bachelor-thesis" / "graphics" / "fig_xai_helpfulness_matrix.pdf"


def compute_matrix():
    sess, trials, _ = load()
    by_sid = {s["id"]: s for s in sess}

    cells = defaultdict(list)
    for t in trials:
        if t["trial_type"] not in ("main", "bonus"):
            continue
        if t["condition"] not in XAI_CONDS:
            continue
        s = by_sid.get(t["session_id"])
        if not s:
            continue
        if t["ai_helpful"] in (None, "", "null"):
            continue
        r = role_of(s)
        lit = ai_lit(s)
        if r not in ROLES or lit not in LITERACY:
            continue
        try:
            cells[(r, lit)].append(int(t["ai_helpful"]))
        except (TypeError, ValueError):
            continue

    matrix = np.full((len(ROLES), len(LITERACY)), np.nan)
    counts = np.zeros((len(ROLES), len(LITERACY)), dtype=int)
    for i, r in enumerate(ROLES):
        for j, lit in enumerate(LITERACY):
            vals = cells[(r, lit)]
            counts[i, j] = len(vals)
            if len(vals) >= MIN_TRIALS:
                matrix[i, j] = sum(vals) / len(vals)
    return matrix, counts


def plot(matrix, counts):
    fig, ax = plt.subplots(figsize=(7.0, 4.2))

    cmap = plt.get_cmap("YlOrRd").copy()
    cmap.set_bad(color="#E5E5E5")
    masked = np.ma.masked_invalid(matrix)
    im = ax.imshow(masked, cmap=cmap, vmin=30, vmax=90, aspect="auto")

    for i in range(matrix.shape[0]):
        for j in range(matrix.shape[1]):
            if np.isnan(matrix[i, j]):
                ax.text(j, i, "—", ha="center", va="center",
                        color="#888888", fontsize=11)
            else:
                v = matrix[i, j]
                ax.text(j, i, f"{v:.0f}", ha="center", va="center",
                        color="white" if v >= 65 else "black",
                        fontsize=13, fontweight="bold")

    ax.set_xticks(range(len(LITERACY)))
    ax.set_xticklabels([LITERACY_LABELS[l] for l in LITERACY])
    ax.set_yticks(range(len(ROLES)))
    ax.set_yticklabels([ROLE_LABELS[r] for r in ROLES])
    ax.set_xlabel("AI literacy", labelpad=8)

    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(length=0)

    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.03)
    cbar.set_label("AI-helpful slider (0–100)")
    cbar.outline.set_visible(False)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    matrix, counts = compute_matrix()
    print("Role x literacy mean (None / Basic / Good), n in parens:")
    for i, r in enumerate(ROLES):
        row = []
        for j, _ in enumerate(LITERACY):
            v = matrix[i, j]
            row.append(f"{'—' if np.isnan(v) else f'{v:5.1f}'} (n={counts[i, j]})")
        print(f"  {r:22s}  " + "  ".join(row))
    plot(matrix, counts)

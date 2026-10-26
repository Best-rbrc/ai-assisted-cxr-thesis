"""Regenerate Figure 4.8 (Hamming accuracy before/after AI by role).

Reuses the data-loading and role-classification logic from analyze_user_study.py
so the plotted values stay locked to the same source of truth as the numbers
reported in results.tex.

Usage (from project root):
  uv run python -m scripts.plot_accuracy_by_role
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from scripts.analysis.analyze_user_study import (
    ai_hamming,
    hamming,
    load,
    mean,
    role_of,
)

ROLES = ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]
ROLE_LABELS = {
    "Student": "Student",
    "Doctor (junior)": "Junior\ndoctor",
    "Doctor (experienced)": "Experienced\ndoctor",
    "Non-medical": "Non-medical",
}
TWO_PHASE_CONDS = {"B", "C", "E"}  # legacy D excluded per V2 protocol
OUTPUT = Path(__file__).resolve().parent.parent.parent / "HSG-bachelor-thesis" / "graphics" / "fig_accuracy_by_role.pdf"


def compute_role_stats():
    sess, trials, _ = load()
    by_sid = {s["id"]: s for s in sess}
    engaged_ids = {t["session_id"] for t in trials}

    main_bonus = [t for t in trials if t["trial_type"] in ("main", "bonus")]
    two_phase = [
        t for t in main_bonus
        if t["condition"] in TWO_PHASE_CONDS and t["revised_findings"] is not None
    ]

    by_role = defaultdict(list)
    for t in two_phase:
        s = by_sid.get(t["session_id"])
        if s and s["id"] in engaged_ids and role_of(s) in ROLES:
            by_role[role_of(s)].append(t)

    pre, post, ai_overall = {}, {}, []
    for role in ROLES:
        ts = by_role[role]
        pre[role] = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        post[role] = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
        ai_overall.extend(ai_hamming(t) for t in ts)
    ai_mean = mean(ai_overall)
    return pre, post, ai_mean


def plot(pre, post, ai_mean):
    x = np.arange(len(ROLES))
    width = 0.38

    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    bars_pre = ax.bar(x - width / 2, [pre[r] for r in ROLES], width,
                      label="Pre-AI", color="#4C78A8")
    bars_post = ax.bar(x + width / 2, [post[r] for r in ROLES], width,
                       label="Post-AI", color="#E68A4E")
    line = ax.axhline(ai_mean, color="#2E7D32", linestyle="--", linewidth=1.6,
                      label=f"AI model ({ai_mean:.3f})")

    for bar in list(bars_pre) + list(bars_post):
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width() / 2, h + 0.005, f"{h:.3f}",
                ha="center", va="bottom", fontsize=9)

    ax.set_xticks(x)
    ax.set_xticklabels([ROLE_LABELS[r] for r in ROLES])
    ax.set_ylabel("Hamming Accuracy")
    ax.set_ylim(0.50, 0.95)
    ax.grid(axis="y", linestyle="-", alpha=0.25)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)

    ax.legend(handles=[line, bars_pre, bars_post],
              loc="upper center", bbox_to_anchor=(0.5, -0.13),
              ncol=3, frameon=False)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved: {OUTPUT}")


if __name__ == "__main__":
    pre, post, ai_mean = compute_role_stats()
    for r in ROLES:
        print(f"  {r:24s}  Pre={pre[r]:.3f}  Post={post[r]:.3f}")
    print(f"  AI mean: {ai_mean:.3f}")
    plot(pre, post, ai_mean)

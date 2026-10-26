"""Reproduce every derived number used in the user-study sections of results.tex.

Inputs:  data/study_sessions_rows-5.csv
         data/study_trials_rows-5.csv
         data/study_block_surveys_rows-5.csv

Output:  text report on stdout (one section per table in results.tex).
"""
from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
SESS = BASE / "study_sessions_rows-5.csv"
TRIA = BASE / "study_trials_rows-5.csv"
SURV = BASE / "study_block_surveys_rows-5.csv"

LABELS = ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"]
AI_THRESHOLD = 0.5

# ---------- normalisation tables ----------
COUNTRY = {
    "Österreich": "Austria", "Austria": "Austria",
    "Schweiz": "Switzerland", "Switzerland": "Switzerland",
    "Deutschland": "Germany", "Germany": "Germany",
    "Kanada": "Canada", "Canada": "Canada",
    "Palestine": "Palestine",
    "Netherlands": "Netherlands",
    "United Kingdom": "United Kingdom",
    "USA": "USA",
}

AI_KNOWLEDGE = {
    "Gutes Verständnis": "good", "Good understanding": "good",
    "Grundkonzepte": "basic", "Basic concepts": "basic",
    "Kein Verständnis": "none", "No understanding": "none",
}

XRAY_BUCKET = {  # self-reported X-ray volume → analysis bucket
    "0": 0,
    "1–5": 1, "6–20": 1,           # "1-20" in paper buckets
    "21–50": 2,                     # "20-100"
    "Mehr als 100": 3, "100+": 3,   # "100+"
}
XRAY_LABEL = {0: "0", 1: "1–20", 2: "20–100", 3: "100+"}

EXPERIENCE_STUDENT = {"Medizinstudent/in", "Medical student"}
EXPERIENCE_DOCTOR = {"Assistenzarzt/Facharzt", "Resident", "Resident/Attending"}
EXPERIENCE_NONMED = {"Kein medizinischer Hintergrund", "Non-medical", "Other healthcare"}


def role_of(s) -> str:
    el = s["experience_level"]
    if el in EXPERIENCE_NONMED:
        return "Non-medical"
    if el in EXPERIENCE_STUDENT:
        return "Student"
    if el in EXPERIENCE_DOCTOR:
        bucket = XRAY_BUCKET.get(s["xray_volume"], 0)
        return "Doctor (experienced)" if bucket == 3 else "Doctor (junior)"
    return f"UNCLASSIFIED:{el!r}"


def country_of(s) -> str:
    return COUNTRY.get(s["country"], s["country"] or "Unknown")


def ai_lit(s) -> str:
    return AI_KNOWLEDGE.get(s["ai_knowledge"], "unknown")


def xb(s) -> int:
    return XRAY_BUCKET.get(s["xray_volume"], 0)


# ---------- IO ----------
def load():
    with SESS.open(newline="") as f:
        sess = list(csv.DictReader(f))
    with TRIA.open(newline="") as f:
        trials = list(csv.DictReader(f))
    with SURV.open(newline="") as f:
        surveys = list(csv.DictReader(f))
    for t in trials:
        t["initial_findings"] = json.loads(t["initial_findings"]) if t["initial_findings"] else []
        t["revised_findings"] = json.loads(t["revised_findings"]) if t["revised_findings"] else None
        t["ground_truth"] = json.loads(t["ground_truth"]) if t["ground_truth"] else []
        t["ai_preds"] = json.loads(t["ai_preds"]) if t["ai_preds"] else {}
    return sess, trials, surveys


# ---------- accuracy helpers ----------
def hamming(pred_set, gt_set):
    pred = set(pred_set) & set(LABELS)
    gt = set(gt_set) & set(LABELS)
    correct = sum(1 for lbl in LABELS if (lbl in pred) == (lbl in gt))
    return correct / len(LABELS)


def ai_labels(ai_preds):
    return {lbl for lbl, p in ai_preds.items() if p >= AI_THRESHOLD}


def ai_hamming(t):
    if not t["ai_preds"]:
        return None
    return hamming(ai_labels(t["ai_preds"]), t["ground_truth"])


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else float("nan")


# ---------- report ----------
def main():
    sess, trials, surveys = load()
    by_sid = {s["id"]: s for s in sess}

    # ---- §0: funnel ----
    completed = [s for s in sess if s["completed_at"]]
    ids_with_trial = {t["session_id"] for t in trials}
    engaged = [s for s in sess if s["id"] in ids_with_trial]
    engaged_ids = {s["id"] for s in engaged}
    # trial-level analyses use the 36 engaged participants (per paper text);
    # session-level measures (Jian, TLX, calibration) use the 27 completers.

    print("\n=== Funnel ===")
    print(f"Sessions created:           {len(sess)}")
    print(f"Sessions completed:         {len(completed)}  ({len(completed)/len(sess)*100:.1f}%)")
    print(f"Sessions engaged (≥1 trial):{len(engaged)}")
    not_engaged = [s for s in sess if s["id"] not in ids_with_trial]
    print(f"Non-engaged drop-off screens:")
    for k, v in Counter(s["current_screen"] for s in not_engaged).most_common():
        print(f"  {v:3d}  {k}")

    type_ct = Counter(t["trial_type"] for t in trials)
    print(f"Trials: main={type_ct['main']}, bonus={type_ct['bonus']}, "
          f"baseline={type_ct['baseline']}, attention_check={type_ct['attention_check']}")
    print(f"Surveys: {len(surveys)}")

    # ---- case set (unique cases by trial_type, with pneumothorax counts) ----
    print("\n=== Case set (unique cases) ===")
    case_meta = {}  # case_id -> (trial_type, category, is_pneumothorax_positive)
    for t in trials:
        if t["case_id"] not in case_meta:
            case_meta[t["case_id"]] = (t["trial_type"], t["category"], "pneumothorax" in t["ground_truth"])
    for tt in ["baseline", "main", "bonus", "attention_check"]:
        cases = [c for c, m in case_meta.items() if m[0] == tt]
        cats_ct = Counter(case_meta[c][1] for c in cases)
        pneumo_pos = sum(1 for c in cases if case_meta[c][2])
        print(f"  {tt:18s} n={len(cases):2d}  pneumo+={pneumo_pos}  cats={dict(cats_ct)}")
    study_cases = [c for c, m in case_meta.items() if m[0] in ("baseline", "main", "bonus")]
    study_pneumo = sum(1 for c in study_cases if case_meta[c][2])
    print(f"  STUDY pool (baseline+main+bonus): {len(study_cases)} cases, pneumothorax+ in {study_pneumo}")

    # AI sensitivity/specificity for pneumothorax on the unique study image set.
    # Used in results.tex §4.3 ("AI sensitivity 1.000, specificity 0.92 on the study image set").
    print("\n=== AI pneumothorax sens/spec on unique study cases ===")
    for pool, types in [("main+bonus", ("main", "bonus")), ("main+bonus+baseline", ("main", "bonus", "baseline"))]:
        seen = {}
        for t in trials:
            if t["trial_type"] in types and t["case_id"] not in seen:
                seen[t["case_id"]] = t
        pos = [t for t in seen.values() if "pneumothorax" in t["ground_truth"]]
        neg = [t for t in seen.values() if "pneumothorax" not in t["ground_truth"]]
        ai_tp = sum(1 for t in pos if t["ai_preds"].get("pneumothorax", 0) >= AI_THRESHOLD)
        ai_tn = sum(1 for t in neg if t["ai_preds"].get("pneumothorax", 0) <  AI_THRESHOLD)
        sens = ai_tp / len(pos) if pos else float("nan")
        spec = ai_tn / len(neg) if neg else float("nan")
        print(f"  {pool:22s} cases={len(seen):2d} pos={len(pos)} neg={len(neg)}  "
              f"Sens={sens:.3f} ({ai_tp}/{len(pos)})  Spec={spec:.3f} ({ai_tn}/{len(neg)})")

    # ---- engaged country distribution ----
    print("\n=== Countries (engaged) ===")
    cc = Counter(country_of(s) for s in engaged)
    for k, v in cc.most_common():
        print(f"  {v:2d}  {k}   ({v/len(engaged)*100:.1f}%)")
    print(f"  unique countries: {len(cc)}")

    # ---- §0: completers composition ----
    print("\n=== Completers composition ===")
    role_ct = Counter(role_of(s) for s in completed)
    for k, v in sorted(role_ct.items()):
        print(f"  {v:2d}  {k}")
    ail = Counter(ai_lit(s) for s in completed)
    print(f"AI literacy: good={ail['good']}, basic={ail['basic']}, none={ail['none']}, unknown={ail['unknown']}")
    le100 = sum(1 for s in completed if xb(s) < 3)
    print(f"X-ray reads ≤100: {le100}/{len(completed)}   >100: {len(completed) - le100}/{len(completed)}")

    # Participant breakdown by role × xray × ai-lit × countries
    print("\n=== Role table (completers, n={}) ===".format(len(completed)))
    by_role = defaultdict(list)
    for s in completed:
        by_role[role_of(s)].append(s)
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        rs = by_role[role]
        ail_r = Counter(ai_lit(s) for s in rs)
        cs = sorted({country_of(s)[:2].upper() for s in rs})
        xb_r = Counter(xb(s) for s in rs)
        xb_descr = "/".join(f"{XRAY_LABEL[k]}:{v}" for k, v in sorted(xb_r.items()))
        print(f"  {role:24s} n={len(rs):2d}  AI(g/b/n)={ail_r['good']}/{ail_r['basic']}/{ail_r['none']}  "
              f"xb=[{xb_descr}]  countries={cs}")

    # ---- §4.2: Hamming by role (two-phase conditions B, C, E) ----
    # Legacy condition D was de-scoped in the V2 redesign and is therefore
    # excluded from the within-trial pre/post comparison. D trials remain
    # available in the raw data but are reported only in the separate
    # condition-effects table.
    two_phase_conds = {"B", "C", "E"}
    main_bonus = [t for t in trials if t["trial_type"] in ("main", "bonus")]
    two_phase = [t for t in main_bonus if t["condition"] in two_phase_conds and t["revised_findings"] is not None]

    print("\n=== Hamming by role (two-phase B/C/E, main+bonus) ===")
    by_role_t = defaultdict(list)
    for t in two_phase:
        s = by_sid.get(t["session_id"])
        if s and s["id"] in engaged_ids and role_of(s) in ("Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"):
            by_role_t[role_of(s)].append(t)
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        ts = by_role_t[role]
        if not ts:
            print(f"  {role:24s} n=0")
            continue
        ai = mean(ai_hamming(t) for t in ts)
        pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
        print(f"  {role:24s} n={len(ts):3d}  AI={ai:.3f}  Pre={pre:.3f}  Post={post:.3f}  Δ={post-pre:+.3f}")
    all_ts = [t for ts in by_role_t.values() for t in ts]
    ai = mean(ai_hamming(t) for t in all_ts)
    pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in all_ts)
    post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in all_ts)
    print(f"  {'ALL':24s} n={len(all_ts):3d}  AI={ai:.3f}  Pre={pre:.3f}  Post={post:.3f}  Δ={post-pre:+.3f}")

    # ---- §4.2: AI vs individual participants ----
    print("\n=== AI vs participant (two-phase B/C/E, main+bonus) ===")
    per_pid = defaultdict(list)
    for t in main_bonus:
        if t["condition"] in two_phase_conds and t["revised_findings"] is not None:
            per_pid[t["session_id"]].append(t)
    total = 0
    ai_wins_pre = ai_wins_post = ai_wins_exact = 0
    beaters = []
    for sid, ts in per_pid.items():
        s = by_sid.get(sid)
        if not s: continue
        total += 1
        ai = mean(ai_hamming(t) for t in ts)
        pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
        if ai > pre: ai_wins_pre += 1
        if ai > post: ai_wins_post += 1
        # exact-match
        ai_exact = mean(int(ai_labels(t["ai_preds"]) == set(t["ground_truth"]) & set(LABELS)) for t in ts)
        post_exact = mean(int(set(t["revised_findings"]) & set(LABELS) == set(t["ground_truth"]) & set(LABELS)) for t in ts)
        if ai_exact > post_exact: ai_wins_exact += 1
        if post > ai:  # human beats AI
            mind_change = mean(int(set(t["initial_findings"]) != set(t["revised_findings"] or [])) for t in ts)
            beaters.append((s["session_code"], role_of(s), s["xray_volume"], ai, post, post-ai, mind_change, len(ts)))
    print(f"Total participants with two-phase trials: {total}")
    print(f"AI > participant pre-AI:  {ai_wins_pre}/{total}  ({ai_wins_pre/total*100:.1f}%)")
    print(f"AI > participant post-AI: {ai_wins_post}/{total}  ({ai_wins_post/total*100:.1f}%)")
    print(f"AI > participant on exact-match: {ai_wins_exact}/{total}  ({ai_wins_exact/total*100:.1f}%)")
    print("\nParticipants whose final Hamming > AI:")
    for c, r, xv, ai_h, post_h, d, mc, n in sorted(beaters, key=lambda x: -x[5]):
        print(f"  {c:8s}  {r:22s} xray={xv:14s}  AI={ai_h:.3f}  Post={post_h:.3f}  Δ={d:+.3f}  mind-ch={mc*100:.0f}%  n={n}")

    # ---- §4.3: Pneumothorax sensitivity by role ----
    print("\n=== Pneumothorax sensitivity by role (two-phase B/C/E) ===")
    pneumo_trials = [t for t in two_phase if "pneumothorax" in t["ground_truth"]]
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        ts = [t for t in pneumo_trials if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role]
        if not ts:
            print(f"  {role:24s} n=0")
            continue
        pre_sens = mean(int("pneumothorax" in t["initial_findings"]) for t in ts)
        post_sens = mean(int("pneumothorax" in t["revised_findings"]) for t in ts)
        print(f"  {role:24s} n={len(ts):3d}  PreSens={pre_sens:.3f}  PostSens={post_sens:.3f}  Δ={post_sens-pre_sens:+.3f}")
    all_p = pneumo_trials
    pre_a = mean(int("pneumothorax" in t["initial_findings"]) for t in all_p)
    post_a = mean(int("pneumothorax" in t["revised_findings"]) for t in all_p)
    print(f"  {'ALL':24s} n={len(all_p):3d}  PreSens={pre_a:.3f}  PostSens={post_a:.3f}  Δ={post_a-pre_a:+.3f}")

    # ---- §4.3: Pneumothorax specificity (negatives only) ----
    print("\n=== Pneumothorax specificity by role (negatives only, two-phase B/C/E) ===")
    pneumo_neg = [t for t in two_phase if "pneumothorax" not in t["ground_truth"]]
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        ts = [t for t in pneumo_neg if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role]
        if not ts:
            print(f"  {role:24s} n=0")
            continue
        pre_sp = mean(int("pneumothorax" not in t["initial_findings"]) for t in ts)
        post_sp = mean(int("pneumothorax" not in t["revised_findings"]) for t in ts)
        print(f"  {role:24s} n={len(ts):3d}  PreSpec={pre_sp:.3f}  PostSpec={post_sp:.3f}  Δ={post_sp-pre_sp:+.3f}")
    pre_sp_a = mean(int("pneumothorax" not in t["initial_findings"]) for t in pneumo_neg)
    post_sp_a = mean(int("pneumothorax" not in t["revised_findings"]) for t in pneumo_neg)
    print(f"  {'ALL':24s} n={len(pneumo_neg):3d}  PreSpec={pre_sp_a:.3f}  PostSpec={post_sp_a:.3f}  Δ={post_sp_a-pre_sp_a:+.3f}")

    # ---- §4.3: Gains by case category × role ----
    print("\n=== Hamming Δ by category × role (two-phase B/C/E — matches results.tex tab:category-gains) ===")
    cats = ["easy", "hard", "incidental", "ai_wrong"]
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        row = [role]
        for cat in cats:
            ts = [t for t in two_phase
                  if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role
                  and t["category"] == cat]
            if not ts:
                row.append("---")
                continue
            pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
            post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
            row.append(f"{post-pre:+.3f} (n={len(ts)})")
        print("  " + "  ".join(f"{x:18s}" for x in row))

    # Parallel block including condition D — kept for reference / debugging only.
    # Both results.tex and discussion.tex use the B/C/E-restricted numbers above
    # since the V2 redesign de-scoped condition D.
    print("\n=== Hamming Δ by category × role (ALL two-phase incl. D — diagnostic, not used in thesis) ===")
    all_two_phase = [t for t in main_bonus if t["revised_findings"] is not None]
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        row = [role]
        for cat in cats:
            ts = [t for t in all_two_phase
                  if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role
                  and t["category"] == cat]
            if not ts:
                row.append("---")
                continue
            pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
            post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
            row.append(f"{post-pre:+.3f} (n={len(ts)})")
        print("  " + "  ".join(f"{x:18s}" for x in row))

    # ---- §4.4: Condition effects (all participants, main+bonus, all roles) ----
    print("\n=== Condition effects (all participants) ===")
    for cond in ["A", "B", "C", "D", "E"]:
        ts = [t for t in main_bonus if t["condition"] == cond]
        if not ts:
            continue
        pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        revised = [t for t in ts if t["revised_findings"] is not None]
        post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in revised) if revised else None
        delta = (post - pre) if post is not None and cond != "A" else None
        print(f"  Cond {cond}: n={len(ts):3d}  Pre={pre:.3f}  Post={post if post is None else f'{post:.3f}'}  Δ={delta if delta is None else f'{delta:+.3f}'}")

    print("\n=== Condition Δ by role (two-phase only) ===")
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        nrole = sum(1 for s in completed if role_of(s) == role)
        row = [f"{role} (n={nrole})"]
        for cond in ["B", "C", "D", "E"]:
            ts = [t for t in main_bonus
                  if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role
                  and t["condition"] == cond and t["revised_findings"] is not None]
            if not ts:
                row.append("---")
                continue
            pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
            post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
            row.append(f"{post-pre:+.3f} (n={len(ts)})")
        print("  " + "  ".join(f"{x:22s}" for x in row))

    # ---- §4.5: Reliance metrics by X-ray experience ----
    print("\n=== Reliance metrics by X-ray experience (two-phase) ===")
    for bk in [0, 1, 2, 3]:
        # participants in this bucket (completers)
        pids = {s["id"] for s in completed if xb(s) == bk}
        ts = [t for t in two_phase if t["session_id"] in pids]
        if not ts:
            continue
        n_part = len(pids)
        mind_ch = mean(int(set(t["initial_findings"]) != set(t["revised_findings"] or [])) for t in ts)
        # adopted AI exactly: of disagreements, post == ai
        disagree = [t for t in ts if set(t["initial_findings"]) != ai_labels(t["ai_preds"])]
        adopted = mean(int(set(t["revised_findings"]) == ai_labels(t["ai_preds"])) for t in disagree) if disagree else float("nan")
        # moved toward AI: of disagreements, hamming(post, ai_set) > hamming(pre, ai_set)
        moved = mean(
            int(hamming(t["revised_findings"], ai_labels(t["ai_preds"])) > hamming(t["initial_findings"], ai_labels(t["ai_preds"])))
            for t in disagree
        ) if disagree else float("nan")
        # headroom: (post-pre) / (ai-pre) if ai > pre
        ai_h = mean(ai_hamming(t) for t in ts)
        pre_h = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        post_h = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
        head = (post_h - pre_h) / (ai_h - pre_h) if ai_h > pre_h else float("nan")
        print(f"  X-ray {XRAY_LABEL[bk]:6s} n={n_part:2d} trials={len(ts):3d}  "
              f"MindCh={mind_ch*100:5.1f}%  AdoptAI={adopted*100:5.1f}%  MovedToAI={moved*100:5.1f}%  "
              f"Headroom={head*100 if head==head else float('nan'):5.1f}%")

    # Participant-level mind-change (averages over participants, not trials) —
    # kept for reference. The thesis (results.tex tab:reliance and discussion.tex)
    # now uniformly reports trial-level rates from the block above.
    print("\n=== Mind-change by X-ray experience (PARTICIPANT-level avg — diagnostic only) ===")
    for bk in [0, 1, 2, 3]:
        pids = [s["id"] for s in completed if xb(s) == bk]
        per_p_mc = []
        for pid in pids:
            ts = [t for t in two_phase if t["session_id"] == pid]
            if ts:
                mc = mean(int(set(t["initial_findings"]) != set(t["revised_findings"] or [])) for t in ts)
                per_p_mc.append(mc)
        if not per_p_mc:
            continue
        print(f"  X-ray {XRAY_LABEL[bk]:6s} n_part={len(per_p_mc):2d}  MindCh(p-avg)={mean(per_p_mc)*100:5.1f}%")

    # ---- §4.6: Expert individual table ----
    print("\n=== Experienced-doctor individuals ===")
    for s in completed:
        if role_of(s) != "Doctor (experienced)":
            continue
        sid = s["id"]
        ts = [t for t in main_bonus if t["session_id"] == sid and t["condition"] in two_phase_conds and t["revised_findings"] is not None]
        if not ts:
            continue
        pre = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        post = mean(hamming(t["revised_findings"], t["ground_truth"]) for t in ts)
        mc = mean(int(set(t["initial_findings"]) != set(t["revised_findings"] or [])) for t in ts)
        helpful_vals = [int(t["ai_helpful"]) for t in ts if t["ai_helpful"] not in (None, "", "null")]
        helpful = mean(helpful_vals) if helpful_vals else float("nan")
        print(f"  {s['session_code']:8s}  {country_of(s):8s}  Pre={pre:.3f}  Post={post:.3f}  MindCh={mc*100:.1f}%  AI-helpful={helpful:.1f}  n={len(ts)}")

    # ---- §4.7: XAI ratings by role × literacy (C+E trials only — these have xai questions) ----
    print("\n=== XAI ratings by role × AI literacy (cond C, E only) ===")
    xai_trials = [t for t in two_phase if t["condition"] in ("C", "E") and t["xai_helpful"] not in (None, "", "null")]
    cells = defaultdict(list)
    for t in xai_trials:
        s = by_sid.get(t["session_id"])
        if not s: continue
        cells[(role_of(s), ai_lit(s))].append(t)
    for (role, lit), ts in sorted(cells.items()):
        if len(ts) < 1: continue
        helped = sum(1 for t in ts if t["xai_helpful"] == "helped")
        neutral = sum(1 for t in ts if t["xai_helpful"] == "neutral")
        misleading = sum(1 for t in ts if t["xai_helpful"] == "misleading")
        helpful_vals = [int(t["ai_helpful"]) for t in ts if t["ai_helpful"] not in (None, "", "null")]
        h = mean(helpful_vals) if helpful_vals else float("nan")
        print(f"  {role:24s} lit={lit:6s} n={len(ts):3d}  helped={helped:2d} ({helped/len(ts)*100:3.0f}%)  "
              f"neutral={neutral:2d}  misleading={misleading:2d}  ai-help={h:.1f}")

    # ---- §4.8: Jian trust ----
    print("\n=== Jian trust scale (completers) ===")
    JIAN_REVERSE = [0, 1, 2, 3, 4]  # first 5 items reverse-scored (distrust items: deceptive..wary..harmful)
    def jian_mean(items):
        items = json.loads(items) if isinstance(items, str) else items
        vals = []
        for i, v in enumerate(items):
            vals.append((8 - v) if i in JIAN_REVERSE else v)
        return mean(vals)
    role_jian = defaultdict(list)
    for s in completed:
        pre, post = s["pre_trust_items"], s["post_trust_items"]
        if not pre or not post:
            continue
        pj = jian_mean(pre)
        qj = jian_mean(post)
        role_jian[role_of(s)].append((pj, qj))
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        rs = role_jian[role]
        if not rs: continue
        pj = mean(x[0] for x in rs); qj = mean(x[1] for x in rs)
        print(f"  {role:24s} n={len(rs):2d}  Pre={pj:.2f}  Post={qj:.2f}  Δ={qj-pj:+.2f}")
    all_j = [x for rs in role_jian.values() for x in rs]
    pj = mean(x[0] for x in all_j); qj = mean(x[1] for x in all_j)
    print(f"  {'ALL':24s} n={len(all_j):2d}  Pre={pj:.2f}  Post={qj:.2f}  Δ={qj-pj:+.2f}")
    incr = sum(1 for x in all_j if x[1]-x[0] > 0.05)
    decr = sum(1 for x in all_j if x[1]-x[0] < -0.05)
    same = sum(1 for x in all_j if abs(x[1]-x[0]) <= 0.05)
    print(f"  net change: increase={incr}  decrease={decr}  same={same}")

    # trust pulse by role (mean over surveys)
    print("\n=== Trust pulse by role ===")
    pulse_by_role = defaultdict(list)
    for srv in surveys:
        s = by_sid.get(srv["session_id"])
        if not s: continue
        try:
            pulse_by_role[role_of(s)].append(int(srv["trust_pulse"]))
        except (ValueError, TypeError):
            pass
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        vs = pulse_by_role[role]
        if not vs: continue
        print(f"  {role:24s} pulse_mean={mean(vs):.1f}  n_surveys={len(vs)}")

    # ---- §4.8: NASA-TLX by cond and by role ----
    print("\n=== NASA-TLX by condition ===")
    for cond in ["A","B","C","E","D"]:
        ss = [s for s in surveys if s["condition"] == cond]
        if not ss: continue
        m = mean(int(s["nasa_mental"]) for s in ss if s["nasa_mental"])
        tp = mean(int(s["nasa_time"]) for s in ss if s["nasa_time"])
        fr = mean(int(s["nasa_frustration"]) for s in ss if s["nasa_frustration"])
        print(f"  {cond}: n={len(ss):3d}  Mental={m:.1f}  Time={tp:.1f}  Frust={fr:.1f}")
    print("\n=== NASA-TLX by role ===")
    by_role_s = defaultdict(list)
    for s in surveys:
        sess_row = by_sid.get(s["session_id"])
        if sess_row: by_role_s[role_of(sess_row)].append(s)
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        ss = by_role_s[role]
        if not ss: continue
        m = mean(int(s["nasa_mental"]) for s in ss if s["nasa_mental"])
        tp = mean(int(s["nasa_time"]) for s in ss if s["nasa_time"])
        fr = mean(int(s["nasa_frustration"]) for s in ss if s["nasa_frustration"])
        print(f"  {role:24s} n={len(ss):3d}  Mental={m:.1f}  Time={tp:.1f}  Frust={fr:.1f}")

    # ---- §4.8: decision times by condition (median, capped 600s = 600_000 ms) ----
    print("\n=== Decision time (median, seconds) ===")
    def med_s(values_ms):
        vals = [min(v, 600_000) / 1000 for v in values_ms if v is not None]
        return statistics.median(vals) if vals else float("nan")
    for cond in ["A","B","C","D","E"]:
        ts = [t for t in main_bonus if t["condition"] == cond]
        if not ts: continue
        pre = [int(t["response_time_pre_ms"]) for t in ts if t["response_time_pre_ms"]]
        post = [int(t["response_time_post_ms"]) for t in ts if t["response_time_post_ms"]]
        pre_med = med_s(pre); post_med = med_s(post) if post else None
        tot = pre_med + (post_med or 0)
        print(f"  Cond {cond}: n={len(ts):3d}  Pre={pre_med:.0f}s  Post={post_med if post_med is None else f'{post_med:.0f}'}s  Total={tot:.0f}s")

    # ---- §4.8: confidence calibration ----
    print("\n=== Confidence calibration (initial_confidence vs accuracy) ===")
    bins = [(0,30),(30,50),(50,70),(70,90),(90,101)]
    for lo, hi in bins:
        ts = [t for t in main_bonus if t["initial_confidence"] and lo <= int(t["initial_confidence"]) < hi]
        if not ts: continue
        h = mean(hamming(t["initial_findings"], t["ground_truth"]) for t in ts)
        em = mean(int(set(t["initial_findings"]) & set(LABELS) == set(t["ground_truth"]) & set(LABELS)) for t in ts)
        print(f"  {lo:3d}-{hi-1:3d}  n={len(ts):3d}  Ham={h:.3f}  Exact={em*100:.1f}%")

    # confidence delta by role (non-medical Δ +43.8, experienced -0.9)
    print("\n=== Initial confidence pre vs post (mean per role) ===")
    for role in ["Student", "Doctor (junior)", "Doctor (experienced)", "Non-medical"]:
        ts = [t for t in main_bonus if by_sid.get(t["session_id"]) and role_of(by_sid[t["session_id"]]) == role and t["revised_findings"] is not None]
        if not ts: continue
        pre_c = mean(int(t["initial_confidence"]) for t in ts if t["initial_confidence"])
        post_c = mean(int(t["revised_confidence"]) for t in ts if t["revised_confidence"])
        print(f"  {role:24s}  Pre={pre_c:.1f}  Post={post_c:.1f}  Δ={post_c-pre_c:+.1f}")


if __name__ == "__main__":
    main()

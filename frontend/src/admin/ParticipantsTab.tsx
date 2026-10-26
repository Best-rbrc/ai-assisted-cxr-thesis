import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, X, CheckCircle2, XCircle, Search } from "lucide-react";
import type { AdminData, SessionWithTrials, RawTrial, RawBlockSurvey } from "./useAdminData";
import { trialAccuracy } from "./useAdminData";

const JIAN_PRE = [
  "AI diagnostic tools can be deceptive",
  "AI diagnostic tools may behave in underhanded ways",
  "I am suspicious of the intent behind AI diagnostic tools",
  "I am wary of AI diagnostic tools",
  "AI diagnostic tools could lead to harmful outcomes",
  "I am confident in AI diagnostic tools",
  "AI diagnostic tools are reliable",
  "AI diagnostic tools are dependable",
  "AI diagnostic tools have integrity",
];
const JIAN_POST = [
  "The system I just used was deceptive",
  "The system behaved in an underhanded manner",
  "I am suspicious of the system's intent",
  "I am wary of the system",
  "The system's actions could lead to harmful outcomes",
  "I am confident in the system",
  "The system is reliable",
  "The system is dependable",
  "The system has integrity",
];

const CONDITION_COLORS: Record<string, string> = {
  A: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  C: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  D: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  E: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const FINDING_NAMES: Record<string, string> = {
  cardiomegaly: "cMeg",
  edema: "Edema",
  consolidation: "Consol.",
  atelectasis: "Atel.",
  pleural_effusion: "Eff.",
  pneumothorax: "Ptx",
};

function FindingChip({ finding, type }: { finding: string; type: "correct" | "extra" | "missed" | "neutral" }) {
  const colors = {
    correct: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    extra: "bg-red-500/20 text-red-400 border-red-500/30",
    missed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    neutral: "bg-secondary text-muted-foreground border-border",
  };
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[type]}`}>
      {FINDING_NAMES[finding] ?? finding}
    </span>
  );
}

function TrialRow({ trial, onClick }: { trial: RawTrial; onClick: () => void }) {
  const acc = trialAccuracy(trial);
  const gt = new Set(trial.ground_truth ?? []);
  const findings = trial.revised_findings ?? trial.initial_findings ?? [];
  const correctFindings = findings.filter(f => gt.has(f));
  const extraFindings = findings.filter(f => !gt.has(f));
  const missedFindings = [...gt].filter(f => !findings.includes(f));

  return (
    <tr
      className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer transition-colors text-xs"
      onClick={onClick}
    >
      <td className="py-1.5 px-2 font-mono text-muted-foreground">{trial.case_id}</td>
      <td className="py-1.5 px-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONDITION_COLORS[trial.condition ?? ""] ?? "bg-secondary text-muted-foreground border-border"}`}>
          {trial.condition ?? "?"}
        </span>
      </td>
      <td className="py-1.5 px-2">
        <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border border-border capitalize">{trial.category ?? trial.trial_type}</span>
      </td>
      <td className="py-1.5 px-2">
        <div className="flex flex-wrap gap-0.5">
          {correctFindings.map(f => <FindingChip key={f} finding={f} type="correct" />)}
          {extraFindings.map(f => <FindingChip key={f} finding={f} type="extra" />)}
          {missedFindings.map(f => <FindingChip key={f} finding={f} type="missed" />)}
          {findings.length === 0 && [...gt].length === 0 && <span className="text-muted-foreground/50 text-[10px]">Normal</span>}
        </div>
      </td>
      <td className="py-1.5 px-2 text-right font-mono">
        {acc != null ? (
          <span className={acc >= 0.8 ? "text-emerald-400" : acc >= 0.5 ? "text-amber-400" : "text-red-400"}>
            {Math.round(acc * 100)}%
          </span>
        ) : "—"}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
        {trial.initial_confidence != null ? `${trial.initial_confidence}` : "—"}
        {trial.revised_confidence != null ? ` → ${trial.revised_confidence}` : ""}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
        {trial.response_time_pre_ms != null ? (trial.response_time_pre_ms / 1000).toFixed(1) : "—"}s
      </td>
    </tr>
  );
}

function ImageModal({ trial, onClose }: { trial: RawTrial; onClose: () => void }) {
  const [overlay, setOverlay] = useState<string | null>(null);
  const prefix = trial.case_id.replace(/^(fx|case|baseline)-?\d+$/, "");

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{trial.case_id}</h3>
            <p className="text-xs text-muted-foreground capitalize">{trial.category} · Condition {trial.condition}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        {/* Findings comparison */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Ground Truth</p>
            <div className="flex flex-wrap gap-0.5">
              {(trial.ground_truth ?? []).length === 0
                ? <span className="text-muted-foreground/60">Normal</span>
                : (trial.ground_truth ?? []).map(f => <FindingChip key={f} finding={f} type="neutral" />)
              }
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Initial Answer</p>
            <div className="flex flex-wrap gap-0.5">
              {(trial.initial_findings ?? []).length === 0
                ? <span className="text-muted-foreground/60">None</span>
                : (trial.initial_findings ?? []).map(f => {
                    const isCorrect = (trial.ground_truth ?? []).includes(f);
                    return <FindingChip key={f} finding={f} type={isCorrect ? "correct" : "extra"} />;
                  })
              }
            </div>
          </div>
          {trial.revised_findings && (
            <div className="space-y-1">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Revised Answer</p>
              <div className="flex flex-wrap gap-0.5">
                {trial.revised_findings.length === 0
                  ? <span className="text-muted-foreground/60">None</span>
                  : trial.revised_findings.map(f => {
                      const isCorrect = (trial.ground_truth ?? []).includes(f);
                      return <FindingChip key={f} finding={f} type={isCorrect ? "correct" : "extra"} />;
                    })
                }
              </div>
            </div>
          )}
        </div>

        {/* AI predictions */}
        {trial.ai_preds && Object.keys(trial.ai_preds).length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">AI Predictions</p>
            <div className="space-y-1">
              {Object.entries(trial.ai_preds).sort((a, b) => b[1] - a[1]).map(([f, conf]) => (
                <div key={f} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">{FINDING_NAMES[f] ?? f}</span>
                  <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 bg-primary/70 rounded-full" style={{ width: `${conf * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono w-10 text-right">{Math.round(conf * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extra info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {trial.ai_helpful != null && <span>AI helpful: <strong className="text-foreground">{trial.ai_helpful}/10</strong></span>}
          {trial.changed_mind != null && <span>Changed mind: <strong className="text-foreground">{trial.changed_mind ? "Yes" : "No"}</strong></span>}
          {trial.xai_helpful && <span>Heatmap: <strong className="text-foreground">{trial.xai_helpful}</strong></span>}
          {trial.xai_faithful && <span>Faithful: <strong className="text-foreground">{trial.xai_faithful}</strong></span>}
        </div>
      </div>
    </div>
  );
}

function ParticipantDetail({ session, onClose }: { session: SessionWithTrials; onClose: () => void }) {
  const [selectedTrial, setSelectedTrial] = useState<RawTrial | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "trials" | "surveys">("trials");

  const mainTrials = session.trials.filter(t => t.trial_type === "main");
  const baselineTrials = session.trials.filter(t => t.trial_type === "baseline");
  const bonusTrials = session.trials.filter(t => t.trial_type === "bonus");

  const hasPreTrust = session.pre_trust_items && session.pre_trust_items.length > 0;
  const hasPostTrust = session.post_trust_items && session.post_trust_items.length > 0;
  const jianOrder = session.jian_item_order ?? Array.from({ length: 9 }, (_, i) => i);

  const TABS = [
    { id: "trials" as const, label: `Trials (${session.trials.length})` },
    { id: "profile" as const, label: "Profile" },
    { id: "surveys" as const, label: `Surveys (${session.blockSurveys.length})` },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-start justify-end">
      <div className="bg-background border-l border-border h-full w-full max-w-3xl overflow-y-auto p-6 space-y-4">
        {selectedTrial && <ImageModal trial={selectedTrial} onClose={() => setSelectedTrial(null)} />}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground font-mono">{session.session_code}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {new Date(session.created_at).toLocaleString()} · {session.language === "de" ? "German" : "English"}
              {session.completed_at && ` · Completed ${new Date(session.completed_at).toLocaleString()}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Internal tab bar */}
        <div className="flex gap-1 border-b border-border pb-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                activeTab === tab.id
                  ? "bg-secondary text-foreground border border-b-background border-border -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-4">

          {/* ── TRIALS TAB ── */}
          {activeTab === "trials" && (
            <>
              {session.trials.length === 0 && (
                <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
                  No trials recorded for this session yet.
                </div>
              )}
              {baselineTrials.length > 0 && (
                <TrialTable label="Baseline Trials" trials={baselineTrials} onSelect={setSelectedTrial} />
              )}
              {mainTrials.length > 0 && (
                <TrialTable label="Main Trials" trials={mainTrials} onSelect={setSelectedTrial} />
              )}
              {bonusTrials.length > 0 && (
                <TrialTable label="Bonus Trials" trials={bonusTrials} onSelect={setSelectedTrial} />
              )}
            </>
          )}

          {/* ── PROFILE TAB ── */}
          {activeTab === "profile" && (
            <div className="glass-panel p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Profile</h3>
              {session.experience_level == null && (
                <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                  This participant never completed the profile step.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {[
                  ["Experience", session.experience_level],
                  ["Age", session.age_range],
                  ["Sex", session.sex],
                  ["Country", session.country],
                  ["Semester", session.semester],
                  ["X-Ray Exp.", session.xray_experience],
                  ["X-Ray Volume", session.xray_volume],
                  ["AI General", session.ai_usage_general],
                  ["AI Medicine", session.ai_usage_medicine],
                  ["AI Knowledge", session.ai_knowledge],
                  ["AI Attitude", session.ai_attitude],
                  ["AI Training", session.ai_training],
                  ["CDSS Exp.", session.ai_cdss_experience],
                  ["Time Budget", session.time_budget_min ? `${session.time_budget_min} min` : null],
                  ["Baseline Acc.", session.baseline_accuracy != null ? `${Math.round(session.baseline_accuracy * 100)}%` : null],
                ].map(([label, value]) => value ? (
                  <div key={label as string}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xs text-foreground font-medium">{value}</p>
                  </div>
                ) : null)}
              </div>
              {session.specialty && session.specialty.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Specialty</p>
                  <div className="flex flex-wrap gap-1">
                    {session.specialty.map(s => (
                      <span key={s} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded border border-border text-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {session.ai_current_use && session.ai_current_use.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">AI Current Use</p>
                  <div className="flex flex-wrap gap-1">
                    {session.ai_current_use.map(s => (
                      <span key={s} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded border border-border text-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SURVEYS TAB ── */}
          {activeTab === "surveys" && (
            <>
              {(hasPreTrust || hasPostTrust) && (
                <div className="glass-panel p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jian Trust Scale (1–7)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-[10px] text-muted-foreground uppercase">
                          <th className="text-left py-1.5 pr-3">#</th>
                          <th className="text-left py-1.5 pr-3">Item</th>
                          <th className="text-right py-1.5 px-2">Pre</th>
                          <th className="text-right py-1.5 px-2">Post</th>
                          <th className="text-right py-1.5">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jianOrder.map((originalIdx, displayIdx) => {
                          const pre = session.pre_trust_items?.[originalIdx];
                          const post = session.post_trust_items?.[originalIdx];
                          const delta = pre != null && post != null ? post - pre : null;
                          return (
                            <tr key={originalIdx} className="border-b border-border/30">
                              <td className="py-1 pr-3 font-mono text-muted-foreground">{displayIdx + 1}</td>
                              <td className="py-1 pr-3 text-muted-foreground">{JIAN_PRE[originalIdx]}</td>
                              <td className="py-1 px-2 text-right font-mono">{pre ?? "—"}</td>
                              <td className="py-1 px-2 text-right font-mono">{post ?? "—"}</td>
                              <td className={`py-1 text-right font-mono ${delta == null ? "" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                {delta != null ? (delta > 0 ? `+${delta}` : String(delta)) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {session.debrief_comments && (
                    <div className="border-t border-border pt-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Comments</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{session.debrief_comments}</p>
                    </div>
                  )}
                </div>
              )}
              {session.blockSurveys.length > 0 && (
                <div className="glass-panel p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Block Surveys (NASA-TLX)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-[10px] text-muted-foreground uppercase">
                          <th className="text-left py-1.5 pr-3">Block</th>
                          <th className="text-left py-1.5 pr-3">Condition</th>
                          <th className="text-right py-1.5 px-2">Mental</th>
                          <th className="text-right py-1.5 px-2">Time</th>
                          <th className="text-right py-1.5 px-2">Frustration</th>
                          <th className="text-right py-1.5">Trust Pulse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.blockSurveys.map(bs => (
                          <tr key={bs.id} className="border-b border-border/30">
                            <td className="py-1 pr-3 font-mono">{bs.block_number}</td>
                            <td className="py-1 pr-3">
                              <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONDITION_COLORS[bs.condition ?? ""] ?? "bg-secondary text-muted-foreground border-border"}`}>
                                {bs.condition ?? "?"}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-right font-mono">{bs.nasa_mental ?? "—"}</td>
                            <td className="py-1 px-2 text-right font-mono">{bs.nasa_time ?? "—"}</td>
                            <td className="py-1 px-2 text-right font-mono">{bs.nasa_frustration ?? "—"}</td>
                            <td className="py-1 text-right font-mono">{bs.trust_pulse ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!hasPreTrust && !hasPostTrust && session.blockSurveys.length === 0 && (
                <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
                  No survey data recorded for this session.
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

function TrialTable({ label, trials, onSelect }: { label: string; trials: RawTrial[]; onSelect: (t: RawTrial) => void }) {
  return (
    <div className="glass-panel p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label} ({trials.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground uppercase">
              <th className="text-left py-1.5 px-2">Case</th>
              <th className="text-left py-1.5 px-2">Cond.</th>
              <th className="text-left py-1.5 px-2">Cat.</th>
              <th className="text-left py-1.5 px-2">Findings (GT / Given)</th>
              <th className="text-right py-1.5 px-2">Acc.</th>
              <th className="text-right py-1.5 px-2">Confidence</th>
              <th className="text-right py-1.5 px-2">RT</th>
            </tr>
          </thead>
          <tbody>
            {trials.map(t => (
              <TrialRow key={t.id} trial={t} onClick={() => onSelect(t)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground/60">Click a row to view details. Green = correct, red = false positive, amber = missed.</p>
    </div>
  );
}

export function ParticipantsTab({ data }: { data: AdminData }) {
  const { sessionsWithTrials } = data;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SessionWithTrials | null>(null);
  const [filter, setFilter] = useState<"all" | "complete" | "incomplete">("all");

  const filtered = useMemo(() => {
    return sessionsWithTrials.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.session_code.toLowerCase().includes(q) ||
        (s.experience_level ?? "").toLowerCase().includes(q) ||
        (s.country ?? "").toLowerCase().includes(q) ||
        (s.language ?? "").toLowerCase().includes(q);
      const matchFilter = filter === "all" ||
        (filter === "complete" && s.isComplete) ||
        (filter === "incomplete" && !s.isComplete);
      return matchSearch && matchFilter;
    });
  }, [sessionsWithTrials, search, filter]);

  return (
    <div className="space-y-4">
      {selected && <ParticipantDetail session={selected} onClose={() => setSelected(null)} />}

      {/* Controls */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code, country, experience…"
            className="w-full pl-8 pr-3 h-8 rounded bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "complete", "incomplete"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-8 px-3 rounded text-xs font-medium capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} sessions</span>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-3 px-4">Code</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-left py-3 px-3">Lang.</th>
                <th className="text-left py-3 px-3">Experience</th>
                <th className="text-left py-3 px-3">Country</th>
                <th className="text-right py-3 px-3">Cases</th>
                <th className="text-right py-3 px-3">Baseline Acc.</th>
                <th className="text-right py-3 px-3">Trials</th>
                <th className="text-right py-3 px-4">Started</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 font-mono text-xs text-foreground font-semibold">{s.session_code}</td>
                  <td className="py-2.5 px-3">
                    {s.isComplete
                      ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Done</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-400"><XCircle className="w-3 h-3" /> {s.current_screen ?? "—"}</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground uppercase">{s.language ?? "?"}</td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">{s.experience_level ?? "—"}</td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">{s.country ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right text-xs font-mono text-muted-foreground">{s.n_cases ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right text-xs font-mono">
                    {s.baseline_accuracy != null ? `${Math.round(s.baseline_accuracy * 100)}%` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-xs font-mono text-muted-foreground">{s.mainTrials.length}</td>
                  <td className="py-2.5 px-4 text-right text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No sessions match your filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

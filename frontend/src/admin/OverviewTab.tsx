import { useMemo } from "react";
import type { AdminData, RawTrial } from "./useAdminData";
import { trialAccuracy } from "./useAdminData";

const JIAN_ITEMS = [
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

// Items 0–4 are distrust (reverse-scored for trust), items 5–8 are trust
const DISTRUST_INDICES = [0, 1, 2, 3, 4];

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-40 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right text-foreground">{value}</span>
    </div>
  );
}

const CONDITION_LABELS: Record<string, string> = {
  A: "A – No AI",
  B: "B – AI Predictions",
  C: "C – AI + Heatmaps",
  D: "D – AI + Heatmaps + Bias Warnings",
  E: "E – Heatmaps Only",
};

export function OverviewTab({ data }: { data: AdminData }) {
  const { sessions, trials, sessionsWithTrials } = data;

  const stats = useMemo(() => {
    const total = sessions.length;
    const completed = sessions.filter(s => !!s.completed_at).length;
    const inProgress = total - completed;

    // Language breakdown
    const byLang: Record<string, number> = {};
    for (const s of sessions) {
      const l = s.language ?? "en";
      byLang[l] = (byLang[l] ?? 0) + 1;
    }

    // Only count sessions that filled in a profile (completed welcome screen)
    const profileSessions = sessions.filter(s => s.experience_level != null);
    const noProfile = sessions.length - profileSessions.length;

    // Experience breakdown (profile sessions only)
    const byExp: Record<string, number> = {};
    for (const s of profileSessions) {
      const e = s.experience_level!;
      byExp[e] = (byExp[e] ?? 0) + 1;
    }

    // Country breakdown (profile sessions only)
    const byCountry: Record<string, number> = {};
    for (const s of profileSessions) {
      const c = s.country ?? "Not specified";
      byCountry[c] = (byCountry[c] ?? 0) + 1;
    }

    // Time budget breakdown (profile sessions only)
    const byTime: Record<string, number> = {};
    for (const s of profileSessions) {
      const t = s.time_budget_min ? `${s.time_budget_min} min` : "Not specified";
      byTime[t] = (byTime[t] ?? 0) + 1;
    }

    // Avg baseline accuracy (only for sessions with data)
    const accValues = sessions.filter(s => s.baseline_accuracy != null).map(s => s.baseline_accuracy as number);
    const avgAcc = accValues.length ? avg(accValues) : null;

    // Main trials analysis
    const mainTrials = trials.filter(t => t.trial_type === "main");

    // Per-condition breakdown
    const byCondition: Record<string, { count: number; aiHelpful: number[]; accuracy: number[]; rtPre: number[]; rtPost: number[] }> = {};
    for (const t of mainTrials) {
      const c = t.condition ?? "?";
      if (!byCondition[c]) byCondition[c] = { count: 0, aiHelpful: [], accuracy: [], rtPre: [], rtPost: [] };
      byCondition[c].count++;
      if (t.ai_helpful != null) byCondition[c].aiHelpful.push(t.ai_helpful);
      const acc = trialAccuracy(t);
      if (acc != null) byCondition[c].accuracy.push(acc);
      if (t.response_time_pre_ms != null) byCondition[c].rtPre.push(t.response_time_pre_ms);
      if (t.response_time_post_ms != null) byCondition[c].rtPost.push(t.response_time_post_ms);
    }

    // Trust scores (Jian)
    const preTrustMeans: (number | null)[] = JIAN_ITEMS.map((_, i) => {
      const vals = sessions.filter(s => s.pre_trust_items && s.pre_trust_items[i] != null).map(s => s.pre_trust_items![i]);
      return vals.length ? avg(vals) : null;
    });
    const postTrustMeans: (number | null)[] = JIAN_ITEMS.map((_, i) => {
      const vals = sessions.filter(s => s.post_trust_items && s.post_trust_items[i] != null).map(s => s.post_trust_items![i]);
      return vals.length ? avg(vals) : null;
    });

    // Overall trust score averages (reverse distrust items)
    const preOverall = sessionsWithTrials.filter(s => s.pre_trust_items?.length === 9).map(s => {
      const items = s.pre_trust_items!;
      const trust = items.filter((_, i) => !DISTRUST_INDICES.includes(i));
      const distrust = items.filter((_, i) => DISTRUST_INDICES.includes(i)).map(v => 8 - v); // reverse 1-7 → 6-0
      return avg([...trust, ...distrust]);
    });
    const postOverall = sessionsWithTrials.filter(s => s.post_trust_items?.length === 9).map(s => {
      const items = s.post_trust_items!;
      const trust = items.filter((_, i) => !DISTRUST_INDICES.includes(i));
      const distrust = items.filter((_, i) => DISTRUST_INDICES.includes(i)).map(v => 8 - v);
      return avg([...trust, ...distrust]);
    });

    // Changed mind rate per condition
    const changedByCondition: Record<string, { changed: number; total: number }> = {};
    for (const t of mainTrials) {
      if (t.condition && t.changed_mind != null) {
        if (!changedByCondition[t.condition]) changedByCondition[t.condition] = { changed: 0, total: 0 };
        changedByCondition[t.condition].total++;
        if (t.changed_mind) changedByCondition[t.condition].changed++;
      }
    }

    // AI current use breakdown
    const aiUseMap: Record<string, number> = {};
    for (const s of sessions) {
      for (const u of s.ai_current_use ?? []) {
        aiUseMap[u] = (aiUseMap[u] ?? 0) + 1;
      }
    }

    return {
      total, completed, inProgress,
      byLang, byExp, byCountry, byTime,
      avgAcc, mainTrials, byCondition,
      preTrustMeans, postTrustMeans,
      preOverall, postOverall,
      changedByCondition, aiUseMap,
      noProfile, profileSessions: profileSessions.length,
    };
  }, [sessions, trials, sessionsWithTrials]);

  const maxCountry = Math.max(...Object.values(stats.byCountry));
  const maxExp = Math.max(...Object.values(stats.byExp));
  const maxAiUse = Math.max(...Object.values(stats.aiUseMap));

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Sessions" value={stats.total} />
        <StatCard label="Completed" value={stats.completed} sub={pct(stats.completed, stats.total)} />
        <StatCard label="In Progress" value={stats.inProgress} />
        <StatCard label="Avg Baseline Acc." value={stats.avgAcc != null ? `${Math.round(stats.avgAcc * 100)}%` : "—"} sub="Jaccard similarity" />
      </div>

      {/* Language + time budget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="glass-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Language</h3>
          {Object.entries(stats.byLang).sort((a, b) => b[1] - a[1]).map(([lang, count]) => (
            <BarRow key={lang} label={lang === "en" ? "English" : "German"} value={count} max={stats.total} color="bg-primary" />
          ))}
        </div>
        <div className="glass-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time Budget</h3>
            {stats.noProfile > 0 && (
              <span className="text-[10px] text-muted-foreground/60 bg-secondary px-2 py-0.5 rounded border border-border">
                profile sessions only
              </span>
            )}
          </div>
          {Object.entries(stats.byTime).sort().map(([t, count]) => (
            <BarRow key={t} label={t} value={count} max={stats.profileSessions} color="bg-blue-500" />
          ))}
        </div>
      </div>

      {/* Demographics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="glass-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Medical Experience</h3>
            {stats.noProfile > 0 && (
              <span className="text-[10px] text-muted-foreground/60 bg-secondary px-2 py-0.5 rounded border border-border">
                {stats.noProfile} session{stats.noProfile !== 1 ? "s" : ""} without profile excluded
              </span>
            )}
          </div>
          {Object.entries(stats.byExp).sort((a, b) => b[1] - a[1]).map(([e, count]) => (
            <BarRow key={e} label={e} value={count} max={maxExp} color="bg-emerald-500" />
          ))}
        </div>
        <div className="glass-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Country</h3>
            {stats.noProfile > 0 && (
              <span className="text-[10px] text-muted-foreground/60 bg-secondary px-2 py-0.5 rounded border border-border">
                profile sessions only
              </span>
            )}
          </div>
          {Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1]).map(([c, count]) => (
            <BarRow key={c} label={c} value={count} max={maxCountry} color="bg-violet-500" />
          ))}
        </div>
      </div>

      {/* AI use */}
      {Object.keys(stats.aiUseMap).length > 0 && (
        <div className="glass-panel p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Current Use</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {Object.entries(stats.aiUseMap).sort((a, b) => b[1] - a[1]).map(([u, count]) => (
              <BarRow key={u} label={u} value={count} max={maxAiUse} color="bg-amber-500" />
            ))}
          </div>
        </div>
      )}

      {/* Per-condition analysis */}
      <div className="glass-panel p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Per-Condition Analysis</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-2 pr-4">Condition</th>
                <th className="text-right py-2 px-3">Trials</th>
                <th className="text-right py-2 px-3">Avg Accuracy</th>
                <th className="text-right py-2 px-3">Avg AI Helpful</th>
                <th className="text-right py-2 px-3">Changed Mind</th>
                <th className="text-right py-2 px-3">RT Pre (s)</th>
                <th className="text-right py-2 px-3">RT Post (s)</th>
              </tr>
            </thead>
            <tbody>
              {["A", "B", "C", "D", "E"].map(cond => {
                const c = stats.byCondition[cond];
                const changed = stats.changedByCondition[cond];
                return (
                  <tr key={cond} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-2 pr-4 text-foreground font-medium">{CONDITION_LABELS[cond] ?? cond}</td>
                    <td className="py-2 px-3 text-right font-mono">{c?.count ?? 0}</td>
                    <td className="py-2 px-3 text-right font-mono">{c?.accuracy.length ? `${Math.round(avg(c.accuracy) * 100)}%` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{c?.aiHelpful.length ? avg(c.aiHelpful).toFixed(1) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{changed ? `${changed.changed}/${changed.total} (${pct(changed.changed, changed.total)})` : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{c?.rtPre.length ? (avg(c.rtPre) / 1000).toFixed(1) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{c?.rtPost.length ? (avg(c.rtPost) / 1000).toFixed(1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trust scores */}
      <div className="glass-panel p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jian Trust Scale — Mean Scores (1–7)</h3>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> Pre-study ({stats.preOverall.length > 0 ? `avg ${avg(stats.preOverall).toFixed(2)}` : "no data"})</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Post-study ({stats.postOverall.length > 0 ? `avg ${avg(stats.postOverall).toFixed(2)}` : "no data"})</span>
          </div>
        </div>
        <div className="space-y-2">
          {JIAN_ITEMS.map((item, i) => {
            const pre = stats.preTrustMeans[i];
            const post = stats.postTrustMeans[i];
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{i + 1}. {item}</span>
                  <span className="text-xs font-mono text-muted-foreground/60">
                    {pre != null ? pre.toFixed(1) : "—"} → {post != null ? post.toFixed(1) : "—"}
                  </span>
                </div>
                <div className="flex gap-1 h-2">
                  <div className="flex-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-2 bg-primary rounded-full" style={{ width: pre != null ? `${((pre - 1) / 6) * 100}%` : "0%" }} />
                  </div>
                  <div className="flex-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-2 bg-emerald-500 rounded-full" style={{ width: post != null ? `${((post - 1) / 6) * 100}%` : "0%" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

// Raw Supabase row types (superset of generated types, includes migration columns)
export interface RawSession {
  id: string;
  session_code: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  current_screen: string | null;
  current_case_index: number | null;
  current_block: number | null;
  session_index: number | null;
  n_cases: number | null;
  time_budget_min: number | null;
  language: string | null;
  experience_level: string | null;
  age_range: string | null;
  sex: string | null;
  country: string | null;
  semester: string | null;
  specialty: string[] | null;
  xray_experience: string | null;
  xray_volume: string | null;
  ai_usage_general: string | null;
  ai_usage_medicine: string | null;
  ai_current_use: string[] | null;
  ai_knowledge: string | null;
  ai_cdss_experience: string | null;
  ai_attitude: string | null;
  ai_training: string | null;
  consent: boolean | null;
  consent_timestamp: string | null;
  baseline_accuracy: number | null;
  pre_trust_items: number[] | null;
  post_trust_items: number[] | null;
  jian_item_order: number[] | null;
  debrief_comments: string | null;
}

export interface RawTrial {
  id: string;
  session_id: string;
  case_id: string;
  trial_type: string;
  condition: string | null;
  category: string | null;
  ground_truth: string[] | null;
  ai_preds: Record<string, number> | null;
  initial_findings: string[] | null;
  initial_confidence: number | null;
  revised_findings: string[] | null;
  revised_confidence: number | null;
  ai_helpful: number | null;
  xai_helpful: string | null;
  xai_faithful: string | null;
  xai_view_selected: string | null;
  xai_overlay_finding: string | null;
  changed_mind: boolean | null;
  response_time_pre_ms: number | null;
  response_time_post_ms: number | null;
  bias_banner_dismissed: boolean | null;
  time_on_banner_ms: number | null;
  created_at: string;
}

export interface RawBlockSurvey {
  id: string;
  session_id: string;
  block_number: number;
  condition: string | null;
  nasa_mental: number | null;
  nasa_time: number | null;
  nasa_frustration: number | null;
  trust_pulse: number | null;
  created_at: string;
}

// Enriched objects joined client-side
export interface SessionWithTrials extends RawSession {
  trials: RawTrial[];
  blockSurveys: RawBlockSurvey[];
  isComplete: boolean;
  mainTrials: RawTrial[];
  baselineTrials: RawTrial[];
}

export interface AdminData {
  sessions: RawSession[];
  trials: RawTrial[];
  blockSurveys: RawBlockSurvey[];
  sessionsWithTrials: SessionWithTrials[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Accuracy helpers
export function trialAccuracy(trial: RawTrial): number | null {
  const gt = new Set(trial.ground_truth ?? []);
  const findings = trial.revised_findings ?? trial.initial_findings ?? [];
  if (gt.size === 0 && findings.length === 0) return 1;
  if (gt.size === 0) return findings.length === 0 ? 1 : 0;
  const found = findings.filter(f => gt.has(f));
  const extra = findings.filter(f => !gt.has(f));
  const tp = found.length;
  const fn = gt.size - tp;
  const fp = extra.length;
  if (tp + fp + fn === 0) return 1;
  return tp / (tp + fp + fn);
}

export function useAdminData(): AdminData {
  const [sessions, setSessions] = useState<RawSession[]>([]);
  const [trials, setTrials] = useState<RawTrial[]>([]);
  const [blockSurveys, setBlockSurveys] = useState<RawBlockSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase.from("study_sessions").select("*").order("created_at", { ascending: false }),
      supabase.from("study_trials").select("*").order("created_at", { ascending: true }),
      supabase.from("study_block_surveys").select("*").order("created_at", { ascending: true }),
    ]).then(([sessRes, trialRes, surveyRes]) => {
      if (cancelled) return;
      if (sessRes.error) { setError(sessRes.error.message); setLoading(false); return; }
      if (trialRes.error) { setError(trialRes.error.message); setLoading(false); return; }
      if (surveyRes.error) { setError(surveyRes.error.message); setLoading(false); return; }
      setSessions((sessRes.data ?? []) as unknown as RawSession[]);
      setTrials((trialRes.data ?? []) as unknown as RawTrial[]);
      setBlockSurveys((surveyRes.data ?? []) as unknown as RawBlockSurvey[]);
      setLoading(false);
    }).catch(e => {
      if (!cancelled) { setError(String(e)); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [rev]);

  const sessionsWithTrials = useMemo<SessionWithTrials[]>(() => {
    const trialsBySession = new Map<string, RawTrial[]>();
    const surveysBySession = new Map<string, RawBlockSurvey[]>();

    for (const t of trials) {
      const arr = trialsBySession.get(t.session_id) ?? [];
      arr.push(t);
      trialsBySession.set(t.session_id, arr);
    }
    for (const s of blockSurveys) {
      const arr = surveysBySession.get(s.session_id) ?? [];
      arr.push(s);
      surveysBySession.set(s.session_id, arr);
    }

    return sessions.map(s => {
      const sessionTrials = trialsBySession.get(s.id) ?? [];
      const mainTrials = sessionTrials.filter(t => t.trial_type === "main");
      const baselineTrials = sessionTrials.filter(t => t.trial_type === "baseline");
      return {
        ...s,
        trials: sessionTrials,
        blockSurveys: surveysBySession.get(s.id) ?? [],
        isComplete: !!s.completed_at,
        mainTrials,
        baselineTrials,
      };
    });
  }, [sessions, trials, blockSurveys]);

  return {
    sessions,
    trials,
    blockSurveys,
    sessionsWithTrials,
    loading,
    error,
    refresh: () => setRev(r => r + 1),
  };
}

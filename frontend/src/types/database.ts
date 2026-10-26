// TypeScript interfaces matching the Supabase schema for future backend integration

export interface SessionRecord {
  id: string;
  created_at: string;
  experience_level: string;
  time_budget_min: number;
  n_cases: number;
  consent: boolean;
  ai_usage_freq: string;
  ai_clinical_prior: boolean;
  ai_understanding: number;
  baseline_accuracy: number;
  semester: string;
  xray_experience: string;
}

export interface TrialRecord {
  id: string;
  session_id: string;
  case_id: string;
  condition: "A" | "B" | "C" | "D";
  case_category: string;
  ground_truth: Record<string, number>;
  ai_preds: Record<string, number>;
  pre_ai_answers: Record<string, number> | null;
  participant_answers: Record<string, number>;
  self_confidence: number;
  ai_helpfulness: number | null;
  xai_helpful: string | null;
  xai_faithful: string | null;
  xai_view_selected: string | null;
  changed_mind_self_report: boolean | null;
  response_time_pre_ms: number;
  response_time_post_ms: number | null;
  bias_banner_dismissed: boolean | null;
  time_on_banner_ms: number | null;
}

export interface PostSurveyRecord {
  id: string;
  session_id: string;
  block_index: number;
  nasa_mental: number;
  nasa_time: number;
  nasa_frustration: number;
  trust_pulse: number | null;
  trust_items: number[] | null;
  free_text: string | null;
}

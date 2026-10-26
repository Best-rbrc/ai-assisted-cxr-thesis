import { supabase } from "@/integrations/supabase/client";
import type { CaseResponse, BlockSurvey, UserProfile } from "@/context/study-types";
import { withRetry } from "@/services/retryQueue";

export const studyDataService = {
  async createSession(sessionCode: string, sessionIndex: number): Promise<string | null> {
    return withRetry("createSession", async () => {
      const { data, error } = await supabase
        .from("study_sessions")
        .insert({ session_code: sessionCode, session_index: sessionIndex, current_screen: "consent" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    });
  },

  async updateSessionProfile(sessionCode: string, profile: UserProfile, nCases: number, language?: string) {
    return withRetry("updateSessionProfile", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({
          language: language ?? "en",
          experience_level: profile.experienceLevel,
          age_range: profile.ageRange,
          sex: profile.sex,
          country: profile.country,
          semester: profile.semester,
          specialty: profile.specialty,
          xray_experience: profile.xrayExperience,
          xray_volume: profile.xrayVolume,
          ai_usage_general: profile.aiUsageGeneral,
          ai_usage_medicine: profile.aiUsageMedicine,
          ai_current_use: profile.aiCurrentUse,
          ai_knowledge: profile.aiKnowledge,
          ai_cdss_experience: profile.aiCdssExperience,
          ai_attitude: profile.aiAttitude,
          ai_training: profile.aiTraining,
          time_budget_min: profile.timeAvailable,
          n_cases: nCases,
          consent: profile.consented,
          consent_timestamp: new Date().toISOString(),
        })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async updateSessionScreen(sessionCode: string, screen: string, caseIndex: number, block: number) {
    return withRetry("updateSessionScreen", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({ current_screen: screen, current_case_index: caseIndex, current_block: block })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async saveTrial(sessionCode: string, r: CaseResponse, trialType: string) {
    return withRetry("saveTrial", async () => {
      const { data: session } = await supabase
        .from("study_sessions")
        .select("id")
        .eq("session_code", sessionCode)
        .single();
      if (!session) throw new Error("Session not found");

      const { error } = await supabase
        .from("study_trials")
        .insert({
          session_id: session.id,
          case_id: r.caseId,
          trial_type: trialType,
          condition: r.condition,
          category: r.category,
          ground_truth: r.groundTruth,
          ai_preds: r.aiPredictions.reduce((acc, p) => ({ ...acc, [p.findingId]: p.confidence / 100 }), {}),
          initial_findings: r.initialFindings,
          initial_confidence: r.initialConfidence,
          revised_findings: r.revisedFindings ?? null,
          revised_confidence: r.revisedConfidence ?? null,
          ai_helpful: r.aiHelpful ?? null,
          xai_helpful: r.xaiHelpful ?? null,
          xai_faithful: r.xaiFaithful ?? null,
          xai_view_selected: r.xaiViewSelected ?? null,
          xai_overlay_finding: r.xaiOverlayFinding ?? null,
          changed_mind: r.changedMindSelfReport ?? null,
          response_time_pre_ms: r.responseTimePreMs,
          response_time_post_ms: r.responseTimePostMs ?? null,
          bias_banner_dismissed: r.biasBannerDismissed ?? null,
          time_on_banner_ms: r.timeOnBannerMs ?? null,
        });
      if (error) throw error;
    });
  },

  async saveBlockSurvey(sessionCode: string, survey: BlockSurvey) {
    return withRetry("saveBlockSurvey", async () => {
      const { data: session } = await supabase
        .from("study_sessions")
        .select("id")
        .eq("session_code", sessionCode)
        .single();
      if (!session) throw new Error("Session not found");

      const { error } = await supabase
        .from("study_block_surveys")
        .insert({
          session_id: session.id,
          block_number: survey.block,
          condition: survey.condition,
          nasa_mental: survey.nasaMental,
          nasa_time: survey.nasaTime,
          nasa_frustration: survey.nasaFrustration,
          trust_pulse: survey.trustPulse,
        });
      if (error) throw error;
    });
  },

  async saveDebrief(sessionCode: string, postTrustItems: number[], comments: string) {
    return withRetry("saveDebrief", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({
          post_trust_items: postTrustItems,
          debrief_comments: comments,
          completed_at: new Date().toISOString(),
        })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async saveBaselineAccuracy(sessionCode: string, accuracy: number) {
    return withRetry("saveBaselineAccuracy", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({ baseline_accuracy: accuracy })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async savePreTrustItems(sessionCode: string, items: number[]) {
    return withRetry("savePreTrustItems", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({ pre_trust_items: items })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async saveJianItemOrder(sessionCode: string, order: number[]) {
    return withRetry("saveJianItemOrder", async () => {
      const { error } = await supabase
        .from("study_sessions")
        .update({ jian_item_order: order })
        .eq("session_code", sessionCode);
      if (error) throw error;
    });
  },

  async saveEmailSubscription(email: string) {
    return withRetry("saveEmailSubscription", async () => {
      const { error } = await supabase
        .from("study_email_subscriptions")
        .insert({ email });
      if (error) throw error;
    });
  },

  async loadSession(sessionCode: string) {
    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("session_code", sessionCode)
      .single();
    if (error) return null;
    return data;
  },

  async loadTrials(sessionId: string) {
    const { data, error } = await supabase
      .from("study_trials")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return data || [];
  },
};

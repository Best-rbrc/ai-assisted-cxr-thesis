-- Add missing demographic fields to study_sessions.
-- These were collected in the welcome form but not previously persisted.
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS country          TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS age_range        TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS sex              TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS specialty        TEXT[];
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS xray_volume      TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS ai_knowledge     TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS ai_cdss_experience TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS ai_attitude      TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS ai_training      TEXT;

-- Add which XAI overlay finding the participant actually viewed per trial.
ALTER TABLE public.study_trials ADD COLUMN IF NOT EXISTS xai_overlay_finding TEXT;

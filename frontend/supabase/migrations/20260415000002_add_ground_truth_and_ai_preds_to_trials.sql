-- Add ground_truth and ai_preds columns to study_trials.
-- These fields are written by saveTrial() but were missing from the original schema,
-- causing all trial inserts to be silently rejected by PostgreSQL.

ALTER TABLE public.study_trials ADD COLUMN IF NOT EXISTS ground_truth       TEXT[];
ALTER TABLE public.study_trials ADD COLUMN IF NOT EXISTS ai_preds           JSONB;

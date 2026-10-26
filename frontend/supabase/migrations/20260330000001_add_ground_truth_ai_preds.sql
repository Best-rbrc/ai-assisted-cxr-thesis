-- Add ground truth labels and AI predictions to each trial row.
-- These are required for all per-label accuracy, over-reliance, and switching analyses.
ALTER TABLE public.study_trials ADD COLUMN IF NOT EXISTS ground_truth  TEXT[];
ALTER TABLE public.study_trials ADD COLUMN IF NOT EXISTS ai_preds      JSONB;

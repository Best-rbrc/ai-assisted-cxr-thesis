-- Add language to study_sessions so per-language analysis is directly queryable.
ALTER TABLE public.study_sessions      ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Add condition to study_block_surveys so workload can be grouped by condition
-- without a complex Latin-square join in the analysis script.
ALTER TABLE public.study_block_surveys ADD COLUMN IF NOT EXISTS condition TEXT;

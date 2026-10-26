ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS jian_item_order integer[];
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS consent_timestamp timestamptz;
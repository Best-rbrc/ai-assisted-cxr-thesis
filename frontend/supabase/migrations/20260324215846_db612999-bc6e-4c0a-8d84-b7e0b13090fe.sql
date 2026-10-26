-- Sessions table to store study session data
CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  experience_level TEXT,
  semester TEXT,
  xray_experience TEXT,
  ai_usage_general TEXT,
  ai_usage_medicine TEXT,
  ai_current_use TEXT[],
  time_budget_min INTEGER,
  n_cases INTEGER,
  consent BOOLEAN DEFAULT false,
  baseline_accuracy NUMERIC,
  pre_trust_items INTEGER[],
  post_trust_items INTEGER[],
  debrief_comments TEXT,
  current_screen TEXT DEFAULT 'landing',
  current_case_index INTEGER DEFAULT 0,
  current_block INTEGER DEFAULT 1,
  session_index INTEGER,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Trials table to store each case response
CREATE TABLE public.study_trials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  trial_type TEXT NOT NULL DEFAULT 'main',
  condition TEXT,
  category TEXT,
  initial_findings TEXT[],
  initial_confidence NUMERIC,
  revised_findings TEXT[],
  revised_confidence NUMERIC,
  ai_helpful NUMERIC,
  xai_helpful TEXT,
  xai_faithful TEXT,
  xai_view_selected TEXT,
  changed_mind BOOLEAN,
  response_time_pre_ms INTEGER,
  response_time_post_ms INTEGER,
  bias_banner_dismissed BOOLEAN,
  time_on_banner_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Block surveys
CREATE TABLE public.study_block_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  block_number INTEGER NOT NULL,
  nasa_mental NUMERIC,
  nasa_time NUMERIC,
  nasa_frustration NUMERIC,
  trust_pulse NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Email subscriptions (anonymous - not linked to session)
CREATE TABLE public.study_email_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_block_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_email_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts and reads (no auth required for study)
CREATE POLICY "Anyone can insert sessions" ON public.study_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read sessions by code" ON public.study_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can update sessions" ON public.study_sessions FOR UPDATE USING (true);

CREATE POLICY "Anyone can insert trials" ON public.study_trials FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read trials" ON public.study_trials FOR SELECT USING (true);

CREATE POLICY "Anyone can insert block surveys" ON public.study_block_surveys FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read block surveys" ON public.study_block_surveys FOR SELECT USING (true);

CREATE POLICY "Anyone can insert email subs" ON public.study_email_subscriptions FOR INSERT WITH CHECK (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_study_sessions_updated_at
  BEFORE UPDATE ON public.study_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
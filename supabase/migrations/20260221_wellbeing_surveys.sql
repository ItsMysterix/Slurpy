-- supabase/migrations/20260221_wellbeing_surveys.sql
-- Wellbeing surveys table for optional PHQ-2/GAD-2 assessments
-- Author: CTO Team
-- Date: 2026-02-21

BEGIN;

-- Create wellbeing_surveys table for optional PHQ-2/GAD-2 tracking
CREATE TABLE IF NOT EXISTS public.wellbeing_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  survey_date timestamptz DEFAULT now(),
  
  -- PHQ-2 (Depression Screening) scores: 0-6
  -- Question 1: Little interest or pleasure
  -- Question 2: Feeling down, depressed, or hopeless
  phq2_q1 smallint, -- 0-3
  phq2_q2 smallint, -- 0-3
  phq2_total smallint, -- 0-6
  
  -- GAD-2 (Anxiety Screening) scores: 0-6
  -- Question 1: Nervous, anxious, on edge
  -- Question 2: Unable to stop worrying
  gad2_q1 smallint, -- 0-3
  gad2_q2 smallint, -- 0-3
  gad2_total smallint, -- 0-6
  
  -- Post-session mood improvement (optional): 1-5 scale
  -- Where 1=Much worse, 3=No change, 5=Much better
  post_session_mood_improvement smallint,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT phq2_q1_valid CHECK (phq2_q1 IS NULL OR phq2_q1 BETWEEN 0 AND 3),
  CONSTRAINT phq2_q2_valid CHECK (phq2_q2 IS NULL OR phq2_q2 BETWEEN 0 AND 3),
  CONSTRAINT phq2_total_valid CHECK (phq2_total IS NULL OR phq2_total BETWEEN 0 AND 6),
  CONSTRAINT gad2_q1_valid CHECK (gad2_q1 IS NULL OR gad2_q1 BETWEEN 0 AND 3),
  CONSTRAINT gad2_q2_valid CHECK (gad2_q2 IS NULL OR gad2_q2 BETWEEN 0 AND 3),
  CONSTRAINT gad2_total_valid CHECK (gad2_total IS NULL OR gad2_total BETWEEN 0 AND 6),
  CONSTRAINT mood_improvement_valid CHECK (post_session_mood_improvement IS NULL OR post_session_mood_improvement BETWEEN 1 AND 5)
);

-- Indices for common queries
CREATE INDEX idx_wellbeing_surveys_user_id ON public.wellbeing_surveys(user_id, survey_date DESC);
CREATE INDEX idx_wellbeing_surveys_created_at ON public.wellbeing_surveys(created_at DESC);
CREATE INDEX idx_wellbeing_surveys_phq2_total ON public.wellbeing_surveys(phq2_total) WHERE phq2_total IS NOT NULL;
CREATE INDEX idx_wellbeing_surveys_gad2_total ON public.wellbeing_surveys(gad2_total) WHERE gad2_total IS NOT NULL;

-- RLS Policies: Users can only view/insert their own surveys
ALTER TABLE public.wellbeing_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wellbeing surveys"
  ON public.wellbeing_surveys
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wellbeing surveys"
  ON public.wellbeing_surveys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wellbeing surveys (same day only)"
  ON public.wellbeing_surveys
  FOR UPDATE
  USING (auth.uid() = user_id AND DATE_TRUNC('day', created_at) = CURRENT_DATE);

-- Service role can read all (for analytics dashboards)
CREATE POLICY "Service role can read all wellbeing surveys"
  ON public.wellbeing_surveys
  FOR SELECT
  USING (
    current_setting('role') = 'postgres' OR
    current_setting('request.jwt.claims'::text ->> 'role') = 'service_role'
  );

COMMIT;

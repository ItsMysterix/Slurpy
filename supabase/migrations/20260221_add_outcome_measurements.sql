-- ============================================================================
-- Migration: Add Outcome Measurement System (PHQ-9, GAD-7, PCL-5)
-- Purpose: Clinical outcome tracking for therapeutic efficacy measurement
-- Date: 2026-02-21
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ASSESSMENT RESPONSES - Stores individual assessment answers
-- ============================================================================

CREATE TABLE assessment_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL,
    -- 'phq9', 'gad7', 'pcl5', 'rosenberg', 'psqi'
  
  -- Raw responses (per question)
  responses JSONB NOT NULL,
    -- e.g., {"q1": 2, "q2": 1, "q3": 0, ...}
  
  -- Computed scores
  total_score INT NOT NULL,  -- Raw sum
  severity TEXT NOT NULL,    -- 'minimal', 'mild', 'moderate', 'moderately_severe', 'severe'
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- For tracking assessment sequence
  sequence_number INT NOT NULL,  -- 1st, 2nd, 3rd assessment, etc.
  session_id UUID,  -- Link to therapy session if applicable
  
  -- Status tracking
  is_baseline BOOLEAN DEFAULT FALSE,  -- First assessment for user?
  is_complete BOOLEAN DEFAULT TRUE,   -- All questions answered?
  
  -- Optional context notes
  context_notes TEXT,
    -- e.g., "Pre-medication change", "Post-crisis", "Relapse event"
  
  -- Efficient querying
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id),
  UNIQUE(user_id, assessment_type, created_at)  -- Only one per type per day
);

CREATE INDEX idx_assessment_responses_user_date 
  ON assessment_responses(user_id, created_at DESC);
CREATE INDEX idx_assessment_responses_type 
  ON assessment_responses(assessment_type);
CREATE INDEX idx_assessment_responses_severity 
  ON assessment_responses(severity);
CREATE INDEX idx_assessment_responses_baseline 
  ON assessment_responses(user_id, is_baseline);

-- ============================================================================
-- 2. OUTCOME TRACKING - Aggregated outcomes over time
-- ============================================================================

CREATE TABLE outcome_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Current assessment scores
  phq9_score INT,  -- 0-27
  phq9_severity TEXT,
  gad7_score INT,  -- 0-21
  gad7_severity TEXT,
  pcl5_score INT,  -- 0-80, PTSD
  rosenberg_score FLOAT,  -- 0-30
  
  -- Progress indicators
  week_number INT NOT NULL,  -- Week of treatment
  days_in_treatment INT NOT NULL,
  
  -- Trend calculations
  phq9_change FLOAT,  -- Current vs baseline
  gad7_change FLOAT,
  
  -- Response status
  phq9_response BOOLEAN,  -- 25%+ improvement?
  phq9_remission BOOLEAN,  -- Score <= 4?
  gad7_response BOOLEAN,
  gad7_remission BOOLEAN,
  
  -- Overall status
  status TEXT NOT NULL,
    -- 'intake', 'responding', 'partial_response', 'non_responder', 
    -- 'remitted', 'relapsed', 'maintenance'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Efficient querying
  CONSTRAINT fk_user_outcome FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_outcome_tracking_user_week 
  ON outcome_tracking(user_id, week_number DESC);
CREATE INDEX idx_outcome_tracking_status 
  ON outcome_tracking(user_id, status);
CREATE INDEX idx_outcome_tracking_response 
  ON outcome_tracking(user_id, phq9_response, gad7_response);

-- ============================================================================
-- 3. BASELINE MEASUREMENTS - Store initial assessment for comparison
-- ============================================================================

CREATE TABLE baseline_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Initial scores (taken during intake)
  phq9_baseline INT NOT NULL,
  gad7_baseline INT NOT NULL,
  pcl5_baseline INT,
  rosenberg_baseline FLOAT,
  
  -- User context at baseline
  demographics JSONB,  -- age, gender, ethnicity, location, occupation
  presenting_problem TEXT,  -- "I have anxiety", "Depression and sleep issues"
  history JSONB,  -- previous diagnoses, treatments, medications
  
  -- Treatment goals (user-defined)
  goals TEXT[],
    -- ["Reduce anxiety in work meetings", "Sleep 7+ hours", "Feel confident"]
  
  -- Target scores (remission threshold)
  phq9_target INT DEFAULT 4,  -- Goal: remission
  gad7_target INT DEFAULT 4,
  
  -- Dates
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_user_baseline FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_baseline_measurements_user 
  ON baseline_measurements(user_id);

-- ============================================================================
-- 4. TREATMENT STATUS - Tracks user's current treatment phase
-- ============================================================================

CREATE TABLE treatment_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Current phase
  current_phase TEXT NOT NULL,
    -- 'intake', 'stabilization', 'skill_building', 'integration', 'maintenance'
  phase_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Phase progression
  session_count INT DEFAULT 0,
  days_in_current_phase INT DEFAULT 0,
  
  -- Skills learned
  skills_acquired TEXT[],
    -- ['breathing', 'grounding', 'reframe', 'exposure']
  
  -- Latest metrics
  latest_phq9 INT,
  latest_gad7 INT,
  last_assessment_date TIMESTAMPTZ,
  
  -- Motivation/engagement
  motivation_score INT,  -- 1-10 self-report
  engagement_level TEXT,  -- 'high', 'moderate', 'low'
  
  -- Crisis risk
  crisis_risk_level TEXT DEFAULT 'low',
    -- 'low', 'moderate', 'elevated', 'immediate'
  
  -- Updated tracking
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_user_treatment FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_treatment_status_user 
  ON treatment_status(user_id);
CREATE INDEX idx_treatment_status_phase 
  ON treatment_status(current_phase);

-- ============================================================================
-- 5. ASSESSMENT SCHEDULE - Plan when to reassess
-- ============================================================================

CREATE TABLE assessment_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  assessment_type TEXT NOT NULL,  -- 'phq9', 'gad7', 'pcl5'
  scheduled_date TIMESTAMPTZ NOT NULL,
  
  -- Reminder status
  reminder_sent BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  
  -- Context
  reason TEXT,  -- 'routine_4week', 'crisis_followup', 'baseline', 'endpoint'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_user_schedule FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_assessment_schedule_user_date 
  ON assessment_schedule(user_id, scheduled_date);
CREATE INDEX idx_assessment_schedule_pending 
  ON assessment_schedule(user_id, completed) WHERE completed = FALSE;

-- ============================================================================
-- 6. MOOD TIMESERIES (Enhanced) - Store daily mood with enhanced tracking
-- ============================================================================

ALTER TABLE mood_logs ADD COLUMN IF NOT EXISTS
  assessment_context JSONB,
    -- {"phq9_at_time": 15, "session_count": 3, "treatment_phase": "stabilization"}
  
  -- Score on standardized scales
  ADD COLUMN IF NOT EXISTS valence_score FLOAT,  -- -1 to 1
  ADD COLUMN IF NOT EXISTS arousal_score FLOAT;  -- -1 to 1 (energy level)

CREATE INDEX IF NOT EXISTS idx_mood_logs_week 
  ON mood_logs(user_id, DATE_TRUNC('week', created_at));

-- ============================================================================
-- 7. Treatment Phase Lookup - Reference table
-- ============================================================================

CREATE TABLE IF NOT EXISTS treatment_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_name TEXT UNIQUE NOT NULL,
  phase_order INT NOT NULL,
  
  description TEXT,
  typical_duration_weeks INT,
  goals TEXT[],
  key_interventions TEXT[],
  success_criteria TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Populate treatment phases
INSERT INTO treatment_phases (phase_name, phase_order, description, typical_duration_weeks, goals, key_interventions, success_criteria)
VALUES
  (
    'intake',
    1,
    'Initial assessment and alliance building',
    1,
    ARRAY['Establish safety', 'Build rapport', 'Collect baseline'],
    ARRAY['Assessment', 'Psychoeducation', 'Safety planning'],
    'User feels heard and understood'
  ),
  (
    'stabilization',
    2,
    'Teach basic coping skills and safety',
    2,
    ARRAY['Reduce acute symptoms', 'Learn 1-2 core skills', 'Establish safety'],
    ARRAY['Breathing', 'Grounding', 'Crisis planning'],
    'User reports symptom relief after skill use'
  ),
  (
    'skill_building',
    3,
    'Build comprehensive coping toolkit',
    4,
    ARRAY['Teach 4-6 evidence-based skills', 'Practice regularly', 'Build confidence'],
    ARRAY['Cognitive therapy', 'Exposure', 'Behavioral activation', 'Problem-solving'],
    '50%+ symptom reduction (25%+ on PHQ-9/GAD-7)'
  ),
  (
    'integration',
    4,
    'Apply skills to real-world situations',
    2,
    ARRAY['Practice in vivo', 'Build independence', 'Prepare for setbacks'],
    ARRAY['Behavioral experiments', 'Exposure hierarchy', 'Relapse planning'],
    'User applying skills independently in daily life'
  ),
  (
    'maintenance',
    5,
    'Sustain gains and prevent relapse',
    999,
    ARRAY['Maintain symptom improvement', 'Build resilience', 'Explore meaning'],
    ARRAY['Booster sessions', 'Relapse prevention', 'Values work'],
    'Sustained remission; normal quality of life'
  )
ON CONFLICT (phase_name) DO NOTHING;

-- ============================================================================
-- 8. Row-Level Security Policies
-- ============================================================================

ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseline_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_schedule ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own assessment responses"
  ON assessment_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assessment responses"
  ON assessment_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own outcome tracking"
  ON outcome_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own baseline"
  ON baseline_measurements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own baseline"
  ON baseline_measurements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own treatment status"
  ON treatment_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own assessment schedule"
  ON assessment_schedule FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 9. FUNCTION: Calculate PHQ-9 severity level
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_phq9_severity(score INT)
RETURNS TEXT AS $$
BEGIN
  IF score <= 4 THEN RETURN 'minimal';
  ELSIF score <= 9 THEN RETURN 'mild';
  ELSIF score <= 14 THEN RETURN 'moderate';
  ELSIF score <= 19 THEN RETURN 'moderately_severe';
  ELSE RETURN 'severe';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 10. FUNCTION: Calculate GAD-7 severity level
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_gad7_severity(score INT)
RETURNS TEXT AS $$
BEGIN
  IF score <= 4 THEN RETURN 'minimal';
  ELSIF score <= 9 THEN RETURN 'mild';
  ELSIF score <= 14 THEN RETURN 'moderate';
  ELSIF score <= 21 THEN RETURN 'severe';
  ELSE RETURN 'severe';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 11. FUNCTION: Detect treatment phase based on session count & time
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_treatment_phase(
  p_session_count INT,
  p_days_in_treatment INT,
  p_phq9_baseline INT,
  p_phq9_current INT
)
RETURNS TEXT AS $$
BEGIN
  -- Intake: first 1-2 sessions
  IF p_session_count <= 2 THEN RETURN 'intake';
  END IF;
  
  -- Stabilization: sessions 3-5, or first 2 weeks
  IF p_session_count <= 5 AND p_days_in_treatment <= 14 THEN
    RETURN 'stabilization';
  END IF;
  
  -- Skill building: 4-6 weeks of treatment
  IF p_days_in_treatment <= 42 THEN RETURN 'skill_building';
  END IF;
  
  -- Integration: 6-8 weeks
  IF p_days_in_treatment <= 56 THEN RETURN 'integration';
  END IF;
  
  -- Maintenance: 8+ weeks
  RETURN 'maintenance';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 12. Grant necessary permissions
-- ============================================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

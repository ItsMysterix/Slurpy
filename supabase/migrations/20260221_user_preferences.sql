-- Add user preferences tracking for survey opt-out and other settings
-- Migration: 20260221_user_preferences.sql
-- Idempotent: yes (uses CREATE TABLE IF NOT EXISTS and DROP IF EXISTS)

BEGIN;

-- Create user_preferences table if not exists
-- Stores user-level preferences for surveys, notifications, etc.
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Survey preferences
  survey_opt_out BOOLEAN DEFAULT FALSE, -- True = user has opted out of wellness surveys
  
  -- Notification preferences
  notifications_enabled BOOLEAN DEFAULT TRUE,
  
  -- Data sharing preferences
  anonymous_data_sharing BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Enable RLS on user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view/update their own preferences
CREATE POLICY IF NOT EXISTS "users_can_manage_own_preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Service role can read all (for dashboards/analytics)
CREATE POLICY IF NOT EXISTS "service_role_read_all_preferences" ON user_preferences
  FOR SELECT USING (auth.jwt()->>'role' = 'service_role');

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_survey_opt_out ON user_preferences(survey_opt_out) WHERE survey_opt_out = TRUE;

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_preferences_updated_at ON user_preferences;
CREATE TRIGGER user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION update_user_preferences_timestamp();

COMMIT;

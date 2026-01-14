-- Add key_insights column to insight_run table for therapist-style insights
-- This stores AI-generated emotional insights and actionable recommendations

ALTER TABLE insight_run 
ADD COLUMN key_insights JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN insight_run.key_insights IS 'Array of AI-generated therapeutic insights with title, description, icon, and trend';

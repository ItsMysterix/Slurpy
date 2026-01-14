-- Add session summary and progress tracking to chat_sessions
-- This enables AI to track user progress over time (e.g., anxious patient improving)

ALTER TABLE chat_sessions 
ADD COLUMN session_summary TEXT,
ADD COLUMN progress_indicators JSONB DEFAULT '{}'::jsonb,
ADD COLUMN key_insights TEXT[];

COMMENT ON COLUMN chat_sessions.session_summary IS 'AI-generated summary of the conversation for insight building';
COMMENT ON COLUMN chat_sessions.progress_indicators IS 'JSON object tracking progress metrics like emotional_state, coping_skills, resilience';
COMMENT ON COLUMN chat_sessions.key_insights IS 'Array of key takeaways from this session';

-- Index for efficient insight aggregation
CREATE INDEX idx_chat_sessions_summary ON chat_sessions(user_id, started_at DESC) WHERE session_summary IS NOT NULL;

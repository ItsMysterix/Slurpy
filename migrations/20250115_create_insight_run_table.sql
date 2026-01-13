-- Sprint 2: InsightRun table for weekly reflections
-- Append-only: new insights are added, never updated
-- User-deletable: users can delete individual insights

CREATE TABLE insight_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Time range for the reflection (7-day rolling window)
  time_range_start TIMESTAMP WITH TIME ZONE NOT NULL,
  time_range_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Insights content
  dominant_emotions TEXT[] NOT NULL DEFAULT '{}', -- e.g., ["joy", "calm"]
  recurring_themes TEXT[] NOT NULL DEFAULT '{}',  -- e.g., ["work stress", "family time"]
  mood_trend TEXT CHECK (mood_trend IN ('rising', 'declining', 'stable')) DEFAULT NULL,
  resilience_delta TEXT CHECK (resilience_delta IN ('improving', 'stable', 'strained')) DEFAULT NULL,
  narrative_summary TEXT NOT NULL, -- 5-7 sentence reflection
  
  -- Source metadata (for audit trail)
  source_metadata JSONB NOT NULL DEFAULT '{}', -- {moodEntries, sessionCount, hasMemoryContext, journalEntriesCount}
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Indices for efficient queries
  UNIQUE(user_id, time_range_start, time_range_end)
);

-- RLS Policies: Users can only see/delete their own insights
ALTER TABLE insight_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
  ON insight_run FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create insights for themselves"
  ON insight_run FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights"
  ON insight_run FOR DELETE
  USING (auth.uid() = user_id);

-- Index on user_id + created_at for efficient listing
CREATE INDEX idx_insight_run_user_created ON insight_run(user_id, created_at DESC);
CREATE INDEX idx_insight_run_time_range ON insight_run(user_id, time_range_start, time_range_end);

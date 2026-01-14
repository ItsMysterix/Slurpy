-- Migration: Create snake_case views to bridge PascalCase tables
-- Date: 2026-01-14
-- Purpose: Allow code referencing snake_case tables to work against existing PascalCase schema

BEGIN;

-- View: daily_mood -> maps to "DailyMood"
CREATE OR REPLACE VIEW public.daily_mood AS
SELECT
  "id" AS id,
  "userId" AS user_id,
  "emotion" AS emotion,
  "intensity" AS intensity,
  "fruit" AS fruit,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM public."DailyMood";

-- View: chat_session -> maps to "ChatSession"
-- Extracts summary and dominant_emotion from analysis JSON
CREATE OR REPLACE VIEW public.chat_session AS
SELECT
  "id" AS id,
  "userId" AS user_id,
  ("analysis"->>'summary') AS summary,
  ("analysis"->>'dominantEmotion') AS dominant_emotion,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at,
  COALESCE("messageCount", 0) AS message_count
FROM public."ChatSession";

-- View: user_memory -> maps to "UserMemory"
-- Aliases summary to content and provides empty labels array
CREATE OR REPLACE VIEW public.user_memory AS
SELECT
  "id" AS id,
  "userId" AS user_id,
  "summary" AS content,
  ARRAY[]::text[] AS labels,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM public."UserMemory";

COMMIT;

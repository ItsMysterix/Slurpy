-- Migration: Create snake_case views to bridge PascalCase tables
-- Date: 2026-01-14
-- Purpose: Allow code referencing snake_case tables to work against existing PascalCase schema

-- Migration: Create/verify snake_case compatibility
-- Tables already exist in snake_case (daily_mood, chat_sessions)
-- UserMemory exists in PascalCase, create view for snake_case access

BEGIN;

-- View: user_memory -> maps to "UserMemory" (PascalCase table)
-- Aliases summary to content and provides empty labels array
CREATE OR REPLACE VIEW public.user_memory_view AS
SELECT
  "id" AS id,
  "userId" AS user_id,
  "summary" AS content,
  ARRAY[]::text[] AS labels,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM public."UserMemory";

COMMIT;

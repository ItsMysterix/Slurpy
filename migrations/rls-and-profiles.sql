-- Migration: Enable RLS and create profiles table
-- Date: 2026-01-14
-- Purpose: Foundation for security fixes

-- ============================================================
-- 1. CREATE PROFILES TABLE (canonical user/plan storage)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    "plan" text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'ELITE')),
    "plan_updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "voice_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

-- Index for quick lookups by user_id
CREATE UNIQUE INDEX "profiles_user_id_idx" ON "public"."profiles" USING "btree" ("user_id");
CREATE INDEX "profiles_plan_idx" ON "public"."profiles" USING "btree" ("plan");

-- ============================================================
-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChatSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DailyMood" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InsightRun" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. CREATE RLS POLICIES FOR PROFILES TABLE
-- ============================================================

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON "public"."profiles"
    FOR SELECT USING (auth.uid() = "user_id");

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON "public"."profiles"
    FOR UPDATE USING (auth.uid() = "user_id")
    WITH CHECK (auth.uid() = "user_id");

-- Only authenticated users can insert (via trigger or app logic)
CREATE POLICY "profiles_insert_own" ON "public"."profiles"
    FOR INSERT WITH CHECK (auth.uid() = "user_id");

-- Service role can do everything (for admin functions)
CREATE POLICY "profiles_service_role" ON "public"."profiles"
    USING (current_user_id() = current_setting('app.current_user_id')::uuid OR auth.role() = 'service_role');

-- ============================================================
-- 4. CREATE RLS POLICIES FOR CHATMESSAGE TABLE
-- ============================================================

-- Users can read messages from their own sessions
CREATE POLICY "chat_message_select_own_session" ON "public"."ChatMessage"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert messages to their own sessions
CREATE POLICY "chat_message_insert_own_session" ON "public"."ChatMessage"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own messages
CREATE POLICY "chat_message_update_own" ON "public"."ChatMessage"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own messages
CREATE POLICY "chat_message_delete_own" ON "public"."ChatMessage"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "chat_message_service_role" ON "public"."ChatMessage"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 5. CREATE RLS POLICIES FOR CHATSESSION TABLE
-- ============================================================

-- Users can read their own sessions
CREATE POLICY "chat_session_select_own" ON "public"."ChatSession"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert their own sessions
CREATE POLICY "chat_session_insert_own" ON "public"."ChatSession"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own sessions
CREATE POLICY "chat_session_update_own" ON "public"."ChatSession"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own sessions
CREATE POLICY "chat_session_delete_own" ON "public"."ChatSession"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "chat_session_service_role" ON "public"."ChatSession"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 6. CREATE RLS POLICIES FOR DAILYMOOD TABLE
-- ============================================================

-- Users can read their own moods
CREATE POLICY "daily_mood_select_own" ON "public"."DailyMood"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert their own moods
CREATE POLICY "daily_mood_insert_own" ON "public"."DailyMood"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own moods
CREATE POLICY "daily_mood_update_own" ON "public"."DailyMood"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own moods
CREATE POLICY "daily_mood_delete_own" ON "public"."DailyMood"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "daily_mood_service_role" ON "public"."DailyMood"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 7. CREATE RLS POLICIES FOR JOURNALENTRY TABLE
-- ============================================================

-- Users can read their own entries
CREATE POLICY "journal_entry_select_own" ON "public"."JournalEntry"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert their own entries
CREATE POLICY "journal_entry_insert_own" ON "public"."JournalEntry"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own entries
CREATE POLICY "journal_entry_update_own" ON "public"."JournalEntry"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own entries
CREATE POLICY "journal_entry_delete_own" ON "public"."JournalEntry"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "journal_entry_service_role" ON "public"."JournalEntry"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 8. CREATE RLS POLICIES FOR USERMEMORY TABLE
-- ============================================================

-- Users can read their own memories
CREATE POLICY "user_memory_select_own" ON "public"."UserMemory"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert their own memories
CREATE POLICY "user_memory_insert_own" ON "public"."UserMemory"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own memories
CREATE POLICY "user_memory_update_own" ON "public"."UserMemory"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own memories
CREATE POLICY "user_memory_delete_own" ON "public"."UserMemory"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "user_memory_service_role" ON "public"."UserMemory"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 9. CREATE RLS POLICIES FOR INSIGHTRUN TABLE
-- ============================================================

-- Users can read their own insights
CREATE POLICY "insight_run_select_own" ON "public"."InsightRun"
    FOR SELECT USING (
        "userId" = auth.uid()::text
    );

-- Users can insert their own insights
CREATE POLICY "insight_run_insert_own" ON "public"."InsightRun"
    FOR INSERT WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can update their own insights
CREATE POLICY "insight_run_update_own" ON "public"."InsightRun"
    FOR UPDATE USING (
        "userId" = auth.uid()::text
    ) WITH CHECK (
        "userId" = auth.uid()::text
    );

-- Users can delete their own insights
CREATE POLICY "insight_run_delete_own" ON "public"."InsightRun"
    FOR DELETE USING (
        "userId" = auth.uid()::text
    );

-- Service role bypass
CREATE POLICY "insight_run_service_role" ON "public"."InsightRun"
    USING (auth.role() = 'service_role');

-- ============================================================
-- 10. GRANT PERMISSIONS TO ROLES
-- ============================================================

GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT SELECT, INSERT, UPDATE ON "public"."profiles" TO "authenticated";
GRANT ALL ON "public"."profiles" TO "service_role";

-- Tables inherit permissions from before, RLS now enforces ownership

-- ============================================================
-- MIGRATION NOTES
-- ============================================================
-- 
-- 1. profiles table is empty initially - must populate from auth.users
--    Run this after migration succeeds:
--    INSERT INTO profiles (user_id, plan) 
--    SELECT id, 'FREE' FROM auth.users 
--    WHERE id NOT IN (SELECT user_id FROM profiles)
--    ON CONFLICT DO NOTHING;
--
-- 2. All userIds in existing tables are TEXT (UUIDs as strings)
--    All new code should use auth.uid()::text for consistency
--
-- 3. RLS policies require auth.uid() to be set (automatic for authenticated users)
--    Service role bypasses RLS for admin operations
--
-- 4. After enabling RLS, test each endpoint to verify policies work
--    SELECT should return only user's own records
--    INSERT/UPDATE/DELETE should fail for other users' records
--

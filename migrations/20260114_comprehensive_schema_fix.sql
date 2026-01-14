-- COMPREHENSIVE SCHEMA FIX MIGRATION
-- Adds all missing tables, creates snake_case views for consistency
-- Fixes naming convention conflicts
-- Date: January 14, 2026

-- ============================================
-- PART 1: CREATE MISSING TABLES
-- ============================================

-- Create profiles table (if not exists)
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    "plan" text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'ELITE')),
    "plan_updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "voice_enabled" boolean DEFAULT false,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create calendar_events table (if not exists)
CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL,
    "date" date NOT NULL,
    "title" text NOT NULL,
    "location_label" text,
    "location_lat" double precision,
    "location_lng" double precision,
    "emotion" text,
    "intensity" integer,
    "notes" text,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create users_roles table (if not exists) - for authorization
CREATE TABLE IF NOT EXISTS "public"."users_roles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL,
    "role" text NOT NULL CHECK (role IN ('user', 'ops', 'admin')),
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, role)
);

-- Create billing_customers table (if not exists)
CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    "stripe_customer_id" text NOT NULL UNIQUE,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create webhook_events table (if not exists)
CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "event_type" text NOT NULL,
    "payload" jsonb NOT NULL,
    "processed" boolean DEFAULT false,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ============================================
-- PART 2: CREATE SNAKE_CASE VIEWS FOR PASCALCASE TABLES
-- ============================================

-- Create view for daily_mood → DailyMood
CREATE OR REPLACE VIEW "public"."daily_mood" AS
SELECT 
    "id",
    "userId" as "user_id",
    "emotion",
    "intensity",
    "notes",
    "fruit",
    "createdAt" as "created_at"
FROM "public"."DailyMood";

-- Create view for chat_session → ChatSession
CREATE OR REPLACE VIEW "public"."chat_session" AS
SELECT 
    "sessionId" as "session_id",
    "userId" as "user_id",
    "dominantEmotion" as "dominant_emotion",
    "summary",
    "createdAt" as "created_at",
    "updatedAt" as "updated_at"
FROM "public"."ChatSession";

-- Create view for chat_sessions (plural) → ChatSession
CREATE OR REPLACE VIEW "public"."chat_sessions" AS
SELECT 
    "sessionId" as "session_id",
    "userId" as "user_id",
    "dominantEmotion" as "dominant_emotion",
    "summary",
    "createdAt" as "created_at",
    "updatedAt" as "updated_at"
FROM "public"."ChatSession";

-- Create view for chat_messages → ChatMessage
CREATE OR REPLACE VIEW "public"."chat_messages" AS
SELECT 
    "id",
    "sessionId" as "session_id",
    "userId" as "user_id",
    "role",
    "content",
    "timestamp",
    "createdAt" as "created_at"
FROM "public"."ChatMessage";

-- Create view for journal_entries → JournalEntry
CREATE OR REPLACE VIEW "public"."journal_entries" AS
SELECT 
    "id",
    "userId" as "user_id",
    "title",
    "content",
    "date",
    "emotion",
    "intensity",
    "tags",
    "createdAt" as "created_at",
    "updatedAt" as "updated_at"
FROM "public"."JournalEntry";

-- Create view for user_memory → UserMemory (if UserMemory table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'UserMemory') THEN
        EXECUTE '
            CREATE OR REPLACE VIEW "public"."user_memory" AS
            SELECT 
                "id",
                "userId" as "user_id",
                "summary",
                "sourceType" as "source_type",
                "sourceId" as "source_id",
                "sourceDate" as "source_date",
                "createdAt" as "created_at",
                "updatedAt" as "updated_at"
            FROM "public"."UserMemory"';
    END IF;
END $$;

-- ============================================
-- PART 3: CREATE INDEXES FOR NEW TABLES
-- ============================================

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "public"."profiles" ("user_id");
CREATE INDEX IF NOT EXISTS "profiles_plan_idx" ON "public"."profiles" ("plan");

-- Indexes for calendar_events
CREATE INDEX IF NOT EXISTS "calendar_events_user_id_idx" ON "public"."calendar_events" ("user_id");
CREATE INDEX IF NOT EXISTS "calendar_events_date_idx" ON "public"."calendar_events" ("date");
CREATE INDEX IF NOT EXISTS "calendar_events_user_date_idx" ON "public"."calendar_events" ("user_id", "date" DESC);

-- Indexes for users_roles
CREATE INDEX IF NOT EXISTS "users_roles_user_id_idx" ON "public"."users_roles" ("user_id");

-- Indexes for billing_customers
CREATE INDEX IF NOT EXISTS "billing_customers_user_id_idx" ON "public"."billing_customers" ("user_id");
CREATE INDEX IF NOT EXISTS "billing_customers_stripe_idx" ON "public"."billing_customers" ("stripe_customer_id");

-- Indexes for webhook_events
CREATE INDEX IF NOT EXISTS "webhook_events_type_idx" ON "public"."webhook_events" ("event_type");
CREATE INDEX IF NOT EXISTS "webhook_events_processed_idx" ON "public"."webhook_events" ("processed");

-- ============================================
-- PART 4: ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 5: CREATE RLS POLICIES FOR NEW TABLES
-- ============================================

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_own" ON "public"."profiles";
CREATE POLICY "profiles_select_own" ON "public"."profiles"
    FOR SELECT USING (auth.uid() = "user_id");

DROP POLICY IF EXISTS "profiles_update_own" ON "public"."profiles";
CREATE POLICY "profiles_update_own" ON "public"."profiles"
    FOR UPDATE USING (auth.uid() = "user_id")
    WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "profiles_insert_own" ON "public"."profiles";
CREATE POLICY "profiles_insert_own" ON "public"."profiles"
    FOR INSERT WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "profiles_service_role" ON "public"."profiles";
CREATE POLICY "profiles_service_role" ON "public"."profiles"
    USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Calendar events policies
DROP POLICY IF EXISTS "calendar_events_select_own" ON "public"."calendar_events";
CREATE POLICY "calendar_events_select_own" ON "public"."calendar_events"
    FOR SELECT USING (auth.uid()::text = "user_id");

DROP POLICY IF EXISTS "calendar_events_insert_own" ON "public"."calendar_events";
CREATE POLICY "calendar_events_insert_own" ON "public"."calendar_events"
    FOR INSERT WITH CHECK (auth.uid()::text = "user_id");

DROP POLICY IF EXISTS "calendar_events_update_own" ON "public"."calendar_events";
CREATE POLICY "calendar_events_update_own" ON "public"."calendar_events"
    FOR UPDATE USING (auth.uid()::text = "user_id")
    WITH CHECK (auth.uid()::text = "user_id");

DROP POLICY IF EXISTS "calendar_events_delete_own" ON "public"."calendar_events";
CREATE POLICY "calendar_events_delete_own" ON "public"."calendar_events"
    FOR DELETE USING (auth.uid()::text = "user_id");

-- Users roles policies (admin only)
DROP POLICY IF EXISTS "users_roles_select_own" ON "public"."users_roles";
CREATE POLICY "users_roles_select_own" ON "public"."users_roles"
    FOR SELECT USING (auth.uid()::text = "user_id");

DROP POLICY IF EXISTS "users_roles_service_role" ON "public"."users_roles";
CREATE POLICY "users_roles_service_role" ON "public"."users_roles"
    USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Billing customers policies
DROP POLICY IF EXISTS "billing_customers_select_own" ON "public"."billing_customers";
CREATE POLICY "billing_customers_select_own" ON "public"."billing_customers"
    FOR SELECT USING (auth.uid() = "user_id");

DROP POLICY IF EXISTS "billing_customers_service_role" ON "public"."billing_customers";
CREATE POLICY "billing_customers_service_role" ON "public"."billing_customers"
    USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Webhook events policies (service role only)
DROP POLICY IF EXISTS "webhook_events_service_role" ON "public"."webhook_events";
CREATE POLICY "webhook_events_service_role" ON "public"."webhook_events"
    USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================
-- PART 6: GRANT PERMISSIONS
-- ============================================

-- Revoke overly broad permissions from anon
REVOKE ALL ON TABLE "public"."profiles" FROM "anon";
REVOKE ALL ON TABLE "public"."calendar_events" FROM "anon";
REVOKE ALL ON TABLE "public"."users_roles" FROM "anon";
REVOKE ALL ON TABLE "public"."billing_customers" FROM "anon";
REVOKE ALL ON TABLE "public"."webhook_events" FROM "anon";

-- Grant minimal permissions to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."calendar_events" TO "authenticated";
GRANT SELECT ON TABLE "public"."users_roles" TO "authenticated";
GRANT SELECT ON TABLE "public"."billing_customers" TO "authenticated";

-- Grant all to service_role
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";
GRANT ALL ON TABLE "public"."users_roles" TO "service_role";
GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";

-- Grant view permissions
GRANT SELECT ON "public"."daily_mood" TO "authenticated";
GRANT SELECT ON "public"."chat_session" TO "authenticated";
GRANT SELECT ON "public"."chat_sessions" TO "authenticated";
GRANT SELECT ON "public"."chat_messages" TO "authenticated";
GRANT SELECT ON "public"."journal_entries" TO "authenticated";

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these after migration to verify:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name;

-- Expected result: All user data tables should have rowsecurity = true
-- Expected result: Each table should have appropriate SELECT/INSERT/UPDATE/DELETE policies
-- Expected result: Views should map PascalCase to snake_case

-- Migration: Add InsightRun table for weekly emotional reflections
-- Date: 2026-01-13
-- Purpose: Store aggregated weekly insights (append-only, user-deletable)
-- Safety: Read-only aggregation of mood, chat, optional memory context

CREATE TABLE IF NOT EXISTS "public"."InsightRun" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "timeRangeStart" timestamp(3) without time zone NOT NULL,
    "timeRangeEnd" timestamp(3) without time zone NOT NULL,
    "dominantEmotions" "text"[] DEFAULT ARRAY[]::text[],
    "recurringThemes" "text"[] DEFAULT ARRAY[]::text[],
    "moodTrend" "text",  -- 'rising', 'declining', 'stable', null
    "resilienceDelta" "text",  -- 'improving', 'stable', 'strained', null
    "narrativeSummary" "text" NOT NULL,
    "sourceMetadata" "jsonb",  -- { moodEntries: N, sessionCount: N, hasMemoryContext: bool }
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "public"."InsightRun" OWNER TO "postgres";

-- Primary key constraint
ALTER TABLE ONLY "public"."InsightRun"
    ADD CONSTRAINT "InsightRun_pkey" PRIMARY KEY ("id");

-- Indexes for query performance
CREATE INDEX "InsightRun_userId_idx" ON "public"."InsightRun" USING "btree" ("userId");
CREATE INDEX "InsightRun_createdAt_idx" ON "public"."InsightRun" USING "btree" ("createdAt" DESC);
CREATE INDEX "InsightRun_userId_createdAt_idx" ON "public"."InsightRun" USING "btree" ("userId", "createdAt" DESC);
CREATE INDEX "InsightRun_timeRange_idx" ON "public"."InsightRun" USING "btree" ("timeRangeStart", "timeRangeEnd");

-- RLS: Allow authenticated users to manage their own insights only
ALTER TABLE "public"."InsightRun" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
    ON "public"."InsightRun"
    FOR SELECT
    USING (auth.uid()::text = "userId");

CREATE POLICY "Users can create their own insights (service role)"
    ON "public"."InsightRun"
    FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can delete their own insights"
    ON "public"."InsightRun"
    FOR DELETE
    USING (auth.uid()::text = "userId");

-- Permissions
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON TABLE "public"."InsightRun" TO "anon";
GRANT ALL ON TABLE "public"."InsightRun" TO "authenticated";
GRANT ALL ON TABLE "public"."InsightRun" TO "service_role";

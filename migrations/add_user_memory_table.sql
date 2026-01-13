-- Migration: Add user memory table for explicit memory management
-- Date: 2026-01-13
-- Purpose: Store user-created memory summaries from chat sessions and journal entries
-- Gating: Pro/Elite users only (free users cannot create memories)

CREATE TABLE IF NOT EXISTS "public"."UserMemory" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "sourceType" "text" NOT NULL, -- 'chat' or 'journal'
    "sourceId" "text" NOT NULL,   -- ChatSession.id or JournalEntry.id
    "sourceDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "public"."UserMemory" OWNER TO "postgres";

-- Primary key constraint
ALTER TABLE ONLY "public"."UserMemory"
    ADD CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id");

-- Foreign key: Link to chat_sessions (optional, on delete do nothing to preserve memory)
-- Note: Using snake_case chat_sessions table with session_id primary key
ALTER TABLE ONLY "public"."UserMemory"
    ADD CONSTRAINT "UserMemory_sourceId_fkey_chat" 
    FOREIGN KEY ("sourceId") REFERENCES "public"."chat_sessions"("session_id") 
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX "UserMemory_userId_idx" ON "public"."UserMemory" USING "btree" ("userId");
CREATE INDEX "UserMemory_createdAt_idx" ON "public"."UserMemory" USING "btree" ("createdAt");
CREATE INDEX "UserMemory_userId_createdAt_idx" ON "public"."UserMemory" USING "btree" ("userId", "createdAt" DESC);
CREATE INDEX "UserMemory_sourceType_idx" ON "public"."UserMemory" USING "btree" ("sourceType");

-- RLS: Allow authenticated users to manage their own memories only
ALTER TABLE "public"."UserMemory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memories"
    ON "public"."UserMemory"
    FOR SELECT
    USING (auth.uid()::text = "userId");

CREATE POLICY "Users can create their own memories"
    ON "public"."UserMemory"
    FOR INSERT
    WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "Users can update their own memories"
    ON "public"."UserMemory"
    FOR UPDATE
    USING (auth.uid()::text = "userId");

CREATE POLICY "Users can delete their own memories"
    ON "public"."UserMemory"
    FOR DELETE
    USING (auth.uid()::text = "userId");

-- Permissions
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON TABLE "public"."UserMemory" TO "anon";
GRANT ALL ON TABLE "public"."UserMemory" TO "authenticated";
GRANT ALL ON TABLE "public"."UserMemory" TO "service_role";

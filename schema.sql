

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ChatMessage" (
    "id" "text" NOT NULL,
    "sessionId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "emotion" "text",
    "intensity" double precision,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "topics" "text"[],
    "assistantReaction" "text"
);


ALTER TABLE "public"."ChatMessage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ChatSession" (
    "id" "text" NOT NULL,
    "sessionId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "startTime" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endTime" timestamp(3) without time zone,
    "duration" integer,
    "messageCount" integer DEFAULT 0 NOT NULL,
    "analysis" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."ChatSession" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."DailyMood" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "date" timestamp(3) without time zone NOT NULL,
    "emotion" "text" NOT NULL,
    "intensity" integer NOT NULL,
    "fruit" "text" NOT NULL,
    "notes" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."DailyMood" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."JournalEntry" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "date" timestamp(3) without time zone NOT NULL,
    "mood" "text",
    "tags" "text"[],
    "isPrivate" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "fruit" "text"
);


ALTER TABLE "public"."JournalEntry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
    "id" character varying(36) NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) NOT NULL,
    "logs" "text",
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_steps_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."_prisma_migrations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ChatMessage"
    ADD CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ChatSession"
    ADD CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."DailyMood"
    ADD CONSTRAINT "DailyMood_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."JournalEntry"
    ADD CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."_prisma_migrations"
    ADD CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id");



CREATE INDEX "ChatMessage_sessionId_idx" ON "public"."ChatMessage" USING "btree" ("sessionId");



CREATE INDEX "ChatMessage_timestamp_idx" ON "public"."ChatMessage" USING "btree" ("timestamp");



CREATE INDEX "ChatMessage_userId_idx" ON "public"."ChatMessage" USING "btree" ("userId");



CREATE UNIQUE INDEX "ChatSession_sessionId_key" ON "public"."ChatSession" USING "btree" ("sessionId");



CREATE INDEX "ChatSession_startTime_idx" ON "public"."ChatSession" USING "btree" ("startTime");



CREATE INDEX "ChatSession_userId_idx" ON "public"."ChatSession" USING "btree" ("userId");



CREATE INDEX "DailyMood_date_idx" ON "public"."DailyMood" USING "btree" ("date");



CREATE UNIQUE INDEX "DailyMood_userId_date_key" ON "public"."DailyMood" USING "btree" ("userId", "date");



CREATE INDEX "DailyMood_userId_idx" ON "public"."DailyMood" USING "btree" ("userId");



CREATE INDEX "JournalEntry_date_idx" ON "public"."JournalEntry" USING "btree" ("date");



CREATE INDEX "JournalEntry_userId_date_idx" ON "public"."JournalEntry" USING "btree" ("userId", "date");



CREATE INDEX "JournalEntry_userId_idx" ON "public"."JournalEntry" USING "btree" ("userId");



ALTER TABLE ONLY "public"."ChatMessage"
    ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("sessionId") ON UPDATE CASCADE ON DELETE CASCADE;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."ChatMessage" TO "anon";
GRANT ALL ON TABLE "public"."ChatMessage" TO "authenticated";
GRANT ALL ON TABLE "public"."ChatMessage" TO "service_role";



GRANT ALL ON TABLE "public"."ChatSession" TO "anon";
GRANT ALL ON TABLE "public"."ChatSession" TO "authenticated";
GRANT ALL ON TABLE "public"."ChatSession" TO "service_role";



GRANT ALL ON TABLE "public"."DailyMood" TO "anon";
GRANT ALL ON TABLE "public"."DailyMood" TO "authenticated";
GRANT ALL ON TABLE "public"."DailyMood" TO "service_role";



GRANT ALL ON TABLE "public"."JournalEntry" TO "anon";
GRANT ALL ON TABLE "public"."JournalEntry" TO "authenticated";
GRANT ALL ON TABLE "public"."JournalEntry" TO "service_role";



GRANT ALL ON TABLE "public"."_prisma_migrations" TO "anon";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;

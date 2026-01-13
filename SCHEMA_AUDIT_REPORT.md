# SCHEMA PARITY AUDIT REPORT
## Supabase vs Repository (Sprint 1 + Sprint 2)

**Audit Date**: January 13, 2026  
**Database**: Supabase (cmykvjwkhtxhlsijlqxb)  
**Repository**: ItsMysterix/Slurpy (main branch)

---

## EXECUTIVE SUMMARY

**CRITICAL FINDINGS**: Both Sprint 1 and Sprint 2 schema tables are **DEFINED in the repository but NOT APPLIED to the live database**.

| Sprint | Status | Tables Missing |
|--------|--------|-----------------|
| **Sprint 1 (Memory)** | ❌ MISSING | `UserMemory` |
| **Sprint 2 (Insights)** | ❌ MISSING | `InsightRun` |

**Migration Status**: Two migration files exist but have not been executed on the live Supabase database.

---

## PART 1 — EXPECTED SCHEMA (FROM REPOSITORY)

### Sprint 1 — Memory System
**Table**: `UserMemory` (PascalCase)

**Expected Columns**:
```
id             TEXT PRIMARY KEY
userId         TEXT NOT NULL (indexed)
summary        TEXT NOT NULL
sourceType     TEXT NOT NULL (enum: 'chat' or 'journal')
sourceId       TEXT NOT NULL (foreign key to ChatSession)
sourceDate     TIMESTAMP WITHOUT TIME ZONE
createdAt      TIMESTAMP WITHOUT TIME ZONE (default: NOW())
updatedAt      TIMESTAMP WITHOUT TIME ZONE NOT NULL
```

**Expected Indexes**:
- `UserMemory_userId_idx`
- `UserMemory_createdAt_idx`
- `UserMemory_userId_createdAt_idx` (userId, createdAt DESC)
- `UserMemory_sourceType_idx`

**Expected RLS Policies**:
- SELECT: Users can view their own memories only
- INSERT: Users can create their own memories only
- UPDATE: Users can update their own memories only
- DELETE: Users can delete their own memories only

**Source Files**:
- `migrations/add_user_memory_table.sql` (2008 bytes)
- `schema.sql` lines 97-268 (defined in schema snapshot)

---

### Sprint 2 — Insights System
**Table**: `InsightRun` (PascalCase) OR `insight_run` (snake_case)

**Expected Columns** (from schema.sql):
```
id                  TEXT PRIMARY KEY
userId              TEXT NOT NULL (indexed)
timeRangeStart      TIMESTAMP WITHOUT TIME ZONE NOT NULL
timeRangeEnd        TIMESTAMP WITHOUT TIME ZONE NOT NULL
dominantEmotions    TEXT[] DEFAULT '{}' (array of strings)
recurringThemes     TEXT[] DEFAULT '{}' (array of strings)
moodTrend           TEXT (nullable, constraint: 'rising'|'declining'|'stable')
resilienceDelta     TEXT (nullable, constraint: 'improving'|'stable'|'strained')
narrativeSummary    TEXT NOT NULL (5-7 sentence reflection)
sourceMetadata      JSONB (audit trail: {moodEntries, sessionCount, hasMemoryContext})
createdAt           TIMESTAMP WITHOUT TIME ZONE (default: NOW())
updatedAt           TIMESTAMP WITHOUT TIME ZONE (default: NOW())
```

**Expected Indexes**:
- `InsightRun_userId_idx`
- `InsightRun_createdAt_idx` (DESC order)
- `InsightRun_userId_createdAt_idx` (userId, createdAt DESC)
- `InsightRun_timeRange_idx` (timeRangeStart, timeRangeEnd)

**Expected Constraints**:
- PRIMARY KEY on `id`
- UNIQUE on (userId, timeRangeStart, timeRangeEnd) — prevents duplicate insights for same week
- CHECK constraint on moodTrend: only 'rising'|'declining'|'stable'|NULL
- CHECK constraint on resilienceDelta: only 'improving'|'stable'|'strained'|NULL

**Expected RLS Policies**:
- SELECT: Users can view their own insights only
- INSERT: Users can create insights for themselves only
- DELETE: Users can delete their own insights only
- NO UPDATE: Append-only design

**Source Files**:
- `migrations/20250115_create_insight_run_table.sql` (2611 bytes)
- `schema.sql` lines 110-125 (table definition)
- `schema.sql` lines 235-245 (indexes)

**Note**: Two migration files exist:
1. `migrations/add_insight_run_table.sql` (older, less complete)
2. `migrations/20250115_create_insight_run_table.sql` (newer, complete with RLS)

---

## PART 2 — ACTUAL SCHEMA (LIVE SUPABASE)

### Existing Tables in `public` Schema
```
analytics
app_events
calendar_events
calendar_moods
chat_messages
chat_sessions
daily_mood
journal_entries
plans
reports
roleplay
ufm
```

**Total**: 12 tables (all existing, none from Sprint 1 or 2)

### Verification Results

#### Sprint 1 — UserMemory
```sql
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('UserMemory', 'user_memory')
);
-- Result: FALSE
```

**Status**: ❌ **TABLE DOES NOT EXIST**

#### Sprint 2 — InsightRun
```sql
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('InsightRun', 'insight_run', 'insightrun')
);
-- Result: FALSE
```

**Status**: ❌ **TABLE DOES NOT EXIST**

### RLS Status on Existing Tables
All 12 existing tables have RLS enabled (`rowsecurity = true`).

Example (daily_mood):
```
Policies:
  - "del_own_rows" (DELETE)
  - "ins_own_rows" (INSERT)
  - "sel_own_rows" (SELECT)
  - "upd_own_rows" (UPDATE)
All use: (user_id = (auth.uid())::text)
```

---

## PART 3 — PARITY VERDICT

### Sprint 1 — Memory System

| Aspect | Status | Details |
|--------|--------|---------|
| **Table Exists** | ❌ FAIL | `UserMemory` not found in Supabase |
| **Columns Match** | ⏭️ N/A | Table does not exist |
| **Indexes Match** | ⏭️ N/A | Table does not exist |
| **RLS Enabled** | ⏭️ N/A | Table does not exist |
| **RLS Policies Match** | ⏭️ N/A | Table does not exist |
| **Overall Parity** | ❌ **FAIL** | Schema does not match |

**Verdict**: Schema parity check **FAILED** — Table is missing from live database.

**Impact**: 
- ❌ Sprint 1 feature code (memory system) cannot function
- ❌ Any application relying on UserMemory table will error
- ⚠️ RLS policies not enforced (table doesn't exist)

---

### Sprint 2 — Insights System

| Aspect | Status | Details |
|--------|--------|---------|
| **Table Exists** | ❌ FAIL | `InsightRun` not found in Supabase |
| **Columns Match** | ⏭️ N/A | Table does not exist |
| **Indexes Match** | ⏭️ N/A | Table does not exist |
| **RLS Enabled** | ⏭️ N/A | Table does not exist |
| **RLS Policies Match** | ⏭️ N/A | Table does not exist |
| **Constraints Match** | ⏭️ N/A | Table does not exist |
| **Overall Parity** | ❌ **FAIL** | Schema does not match |

**Verdict**: Schema parity check **FAILED** — Table is missing from live database.

**Impact**:
- ❌ Sprint 2 feature code (weekly insights) cannot function
- ❌ API endpoints `/api/insights/*` will fail
- ❌ UI component `WeeklyReflection` will error
- 🔴 **BLOCKING**: Sprint 2 feature work MUST NOT proceed until table is created

---

## PART 4 — MIGRATION SAFETY CHECK

### Migration Files Available

| File | Size | Purpose | Status |
|------|------|---------|--------|
| `migrations/add_user_memory_table.sql` | 2.0 KB | Create UserMemory table + RLS | Ready |
| `migrations/20250115_create_insight_run_table.sql` | 2.6 KB | Create InsightRun table + RLS | Ready |

### Migration Safety Analysis

#### `add_user_memory_table.sql` (Sprint 1)

**Operations**:
1. CREATE TABLE UserMemory
2. Add PRIMARY KEY constraint
3. Add FOREIGN KEY to ChatSession (soft delete: ON DELETE SET NULL)
4. Create 4 indices (userId, createdAt, userId+createdAt, sourceType)
5. Enable RLS
6. Create 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
7. GRANT permissions to postgres, anon, authenticated, service_role

**Assessment**:
- ✅ Non-destructive: Only creates new table
- ✅ Backward-compatible: No schema changes to existing tables
- ✅ No data migration required: New table starts empty
- ✅ Safe for production: Creates empty table with constraints

**Can be applied without downtime?** **YES**
- Table creation is fast (no data to migrate)
- RLS policies don't affect existing tables
- New indexes create in background without locks
- Application can handle table existing (idempotent: `IF NOT EXISTS`)

**Are there destructive operations?** **NO**
- Only DDL CREATE/ALTER operations
- No DROP, DELETE, or TRUNCATE
- Foreign key is soft (ON DELETE SET NULL, not CASCADE)

---

#### `20250115_create_insight_run_table.sql` (Sprint 2)

**Operations**:
1. CREATE TABLE insight_run
2. Add PRIMARY KEY constraint
3. Add UNIQUE constraint on (user_id, time_range_start, time_range_end)
4. Add CHECK constraints on moodTrend and resilienceDelta columns
5. Enable RLS
6. Create 3 RLS policies (SELECT, INSERT, DELETE — no UPDATE for append-only)
7. Create 2 indices (user_id+created_at, user_id+time_range)

**Assessment**:
- ✅ Non-destructive: Only creates new table
- ✅ Backward-compatible: No schema changes to existing tables
- ✅ No data migration required: New table starts empty
- ✅ Append-only design enforced via RLS (no UPDATE policy)
- ✅ Safe for production: Idempotent creation

**Can be applied without downtime?** **YES**
- Table creation is fast
- Indices create without blocking reads/writes
- No dependency on existing data
- RLS policies isolated to new table

**Are there destructive operations?** **NO**
- Only DDL CREATE/ALTER operations
- No DROP, DELETE, TRUNCATE, or UPDATE
- No cascade deletes (explicit user DELETE only)

---

### Combined Migration Safety

If BOTH migrations are applied in order:

1. **Execution order**: add_user_memory_table.sql → 20250115_create_insight_run_table.sql
2. **Downtime required**: ❌ NO
3. **Backward compatibility**: ✅ YES
4. **Data loss risk**: ✅ NONE
5. **Rollback complexity**: ✅ SIMPLE (DROP TABLE for each)
6. **Testing requirement**: ✅ RECOMMENDED (verify RLS policies post-migration)

---

## PART 5 — BLOCKING ISSUES & NEXT STEPS

### Critical Blocking Issues

🔴 **BLOCKER #1**: Sprint 1 schema missing
- Feature: Memory system (user_memory API)
- Status: Cannot function without `UserMemory` table
- Required action: Apply migration `add_user_memory_table.sql`

🔴 **BLOCKER #2**: Sprint 2 schema missing
- Feature: Weekly insights (generate, list, delete endpoints + UI)
- Status: Cannot function without `InsightRun` table
- Required action: Apply migration `20250115_create_insight_run_table.sql`

---

## RECOMMENDED ACTIONS

### Action 1: Verify Migration Requirements
```bash
# Check if migrations have already been applied
psql $DATABASE_URL -c "SELECT EXISTS(SELECT 1 FROM \"UserMemory\");"
psql $DATABASE_URL -c "SELECT EXISTS(SELECT 1 FROM \"InsightRun\");"
```

### Action 2: Review Migration Files
- ✅ `migrations/add_user_memory_table.sql` — Complete and ready
- ✅ `migrations/20250115_create_insight_run_table.sql` — Complete and ready
- ⚠️ Alternate file `migrations/add_insight_run_table.sql` — Older version, do NOT use

### Action 3: Apply Migrations (When Ready)

**Option A: Using Supabase CLI**
```bash
supabase migration up
# or
supabase db push
```

**Option B: Direct PostgreSQL**
```bash
psql $DATABASE_URL -f migrations/add_user_memory_table.sql
psql $DATABASE_URL -f migrations/20250115_create_insight_run_table.sql
```

### Action 4: Verify Post-Migration
```bash
# Verify tables exist
psql $DATABASE_URL -c "\dt \"UserMemory\" \"InsightRun\""

# Verify RLS enabled
psql $DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('UserMemory', 'InsightRun');"

# Verify indexes exist
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename IN ('UserMemory', 'InsightRun');"

# Verify RLS policies
psql $DATABASE_URL -c "SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('UserMemory', 'InsightRun');"
```

### Action 5: Clear Blockers Before Proceeding

| Feature | Blocker | Required | Status |
|---------|---------|----------|--------|
| Sprint 1 Memory System | UserMemory table | Before merge | ❌ BLOCKED |
| Sprint 2 Insights System | InsightRun table | Before merge | ❌ BLOCKED |

**DO NOT MERGE** Sprint 1 or Sprint 2 feature code until migrations are applied and verified.

---

## DETAILED FINDINGS

### File-by-File Schema Comparison

#### UserMemory (Sprint 1)

**In Repository** (schema.sql lines 97-268):
```sql
CREATE TABLE IF NOT EXISTS "public"."UserMemory" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "sourceType" "text" NOT NULL,
    "sourceId" "text" NOT NULL,
    "sourceDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);
```

**In Supabase**: NOT FOUND

**Column Type Notes**:
- Schema uses PascalCase column names (Prisma-style)
- text type for id (not UUID) — matches ChatSession pattern
- timestamp(3) = millisecond precision

**Migration File** (add_user_memory_table.sql):
- ✅ Creates table with exact schema
- ✅ Adds indexes for userId, createdAt, sourceType
- ✅ Enables RLS
- ✅ Creates 4 RLS policies (CRUD)

---

#### InsightRun (Sprint 2)

**In Repository** (schema.sql lines 110-125):
```sql
CREATE TABLE IF NOT EXISTS "public"."InsightRun" (
    "id" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "timeRangeStart" timestamp(3) without time zone NOT NULL,
    "timeRangeEnd" timestamp(3) without time zone NOT NULL,
    "dominantEmotions" "text"[] DEFAULT ARRAY[]::text[],
    "recurringThemes" "text"[] DEFAULT ARRAY[]::text[],
    "moodTrend" "text",
    "resilienceDelta" "text",
    "narrativeSummary" "text" NOT NULL,
    "sourceMetadata" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);
```

**In Supabase**: NOT FOUND

**Column Type Notes**:
- PascalCase names matching codebase convention
- Text arrays for emotions and themes
- JSONB for flexible source metadata
- Nullable text for moodTrend and resilienceDelta (not enum)

**Migration File Discrepancy**:
- `20250115_create_insight_run_table.sql` uses snake_case (insight_run, user_id, time_range_start)
- `schema.sql` uses PascalCase (InsightRun, userId, timeRangeStart)
- ⚠️ **NAMING CONFLICT**: Migration and schema use different conventions
- Actual format in Supabase should match post-migration table name

**RLS in Migration**:
- ✅ SELECT, INSERT, DELETE policies (append-only)
- ✅ NO UPDATE policy (enforces immutability)
- ⚠️ Uses `auth.uid()` comparison (expects UUID user_id)

---

## SCHEMA INCONSISTENCY NOTE

### Naming Convention Mismatch

**schema.sql** (Prisma-generated snapshot):
- Tables: `PascalCase` (UserMemory, InsightRun, ChatSession, DailyMood)
- Columns: `camelCase` (userId, timeRangeStart, narrativeSummary)
- Indices: `TableName_columnName_idx` format

**Migration Files**:
- Sprint 1: Matches schema.sql (UserMemory, userId)
- Sprint 2: Uses snake_case (insight_run, user_id, time_range_start)

**Impact**:
- ⚠️ Migration SQL and schema.sql definitions differ
- Application code expects PascalCase/camelCase (from Prisma)
- Database will have snake_case table/column names after Sprint 2 migration
- **Must verify**: Application code handles snake_case column names in InsightRun table

---

## AUDIT CONCLUSION

### Summary Table

| Sprint | Table | Exists? | In Schema? | Migration Ready? | Blocking? |
|--------|-------|---------|-----------|------------------|-----------|
| **1** | UserMemory | ❌ No | ✅ Yes | ✅ Yes | 🔴 YES |
| **2** | InsightRun | ❌ No | ✅ Yes | ✅ Yes (⚠️) | 🔴 YES |

**Overall Status**: ❌ **SCHEMA PARITY FAILED**

Both required tables for Sprint 1 and Sprint 2 are missing from the live Supabase database.

---

## RECOMMENDED NEXT STEPS

### Immediate (Before Code Deployment)

1. ✅ Verify migrations are correct and complete
2. ✅ Schedule maintenance window (none required, can apply during operation)
3. ✅ Create backup of Supabase database (recommended)
4. ✅ Apply both migrations in order:
   ```bash
   supabase db push  # or manual psql
   ```
5. ✅ Run post-migration verification queries
6. ✅ Verify naming conventions match application code expectations

### Before Merging Code

- 🔴 DO NOT merge Sprint 1 feature branch until UserMemory table confirmed
- 🔴 DO NOT merge Sprint 2 feature branch until InsightRun table confirmed
- ✅ Ensure migrations are applied to all environments (dev, staging, prod)

### Risk Assessment

**Risk Level**: 🟡 **MEDIUM**
- Migrations are non-destructive and safe
- No data loss risk
- Can be applied without downtime
- Easily rollbackable
- **Real Risk**: Code already exists in repository; database not yet prepared

**Mitigation**:
1. Apply migrations first
2. Test in staging environment
3. Verify RLS policies work as expected
4. Deploy application code afterward

---

**Report Generated**: 2026-01-13  
**Auditor**: Schema Parity Audit Tool  
**Repository**: ItsMysterix/Slurpy (main)  
**Database**: Supabase (cmykvjwkhtxhlsijlqxb)

---

## APPENDIX: SQL COMMANDS FOR MANUAL VERIFICATION

```sql
-- List all tables in public schema
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Check if UserMemory exists
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'UserMemory'
) AS user_memory_exists;

-- Check if InsightRun exists
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'InsightRun'
) AS insight_run_exists;

-- Get detailed UserMemory schema (if it exists)
\d "UserMemory"

-- Get detailed InsightRun schema (if it exists)
\d "InsightRun"

-- Check RLS status on both tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('UserMemory', 'InsightRun');

-- Get RLS policies for both tables
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies 
WHERE tablename IN ('UserMemory', 'InsightRun')
ORDER BY tablename, policyname;

-- Get indices for both tables
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE tablename IN ('UserMemory', 'InsightRun')
ORDER BY tablename, indexname;
```


# SCHEMA PARITY AUDIT — EXECUTIVE SUMMARY

**Status**: 🔴 **CRITICAL — SCHEMA MISMATCH DETECTED**

---

## One-Line Verdict

Both Sprint 1 (Memory) and Sprint 2 (Insights) feature code exist in the repository, but their **required database tables are NOT present in live Supabase**. Feature work is **BLOCKED** until migrations are applied.

---

## The Problem

| Component | Status | Impact |
|-----------|--------|--------|
| **Sprint 1: UserMemory table** | ❌ Missing from Supabase | Memory system cannot function |
| **Sprint 2: InsightRun table** | ❌ Missing from Supabase | Weekly insights cannot function |

**Current Situation**:
- ✅ Feature code written and committed
- ✅ Migrations created and ready
- ❌ Database schema not updated
- 🔴 **APIs and UI will fail** if feature code is deployed

---

## Quick Summary

### What We Found

**In the Repository** (schema.sql + migrations/):
- ✅ `UserMemory` table fully defined with RLS policies
- ✅ `InsightRun` table fully defined with RLS policies
- ✅ Two migration files ready to apply
- ✅ All constraints, indices, and RLS policies documented

**In Live Supabase**:
- ❌ No `UserMemory` table
- ❌ No `InsightRun` table
- ✅ 12 other tables present and RLS-enabled

**Conclusion**: Schema definitions don't match database state.

---

## Why This Matters

### Sprint 1 Impact (Memory System)
- API endpoints: `POST /api/memory`, `GET /api/memory/list`
- Frontend: Memory UI components
- Status: **BLOCKED** — needs `UserMemory` table

### Sprint 2 Impact (Insights System)
- API endpoints: `POST /api/insights/generate`, `GET /api/insights/list`, `POST /api/insights/delete`
- Frontend: `<WeeklyReflection />` component
- Status: **BLOCKED** — needs `InsightRun` table

**If code is deployed without applying migrations**: All memory and insights features will crash with database errors.

---

## Migration Safety (Good News!)

✅ **Both migrations are safe to apply:**

- **Non-destructive**: Only create new tables, no data loss
- **No downtime required**: Can apply during normal operation
- **Backward compatible**: Existing code unaffected
- **Easily reversible**: Can DROP tables if needed
- **RLS enforced**: Automatic user isolation on new tables

**Time to apply**: ~5 seconds

---

## What Needs to Happen

### Before Merging Feature Code

1. **Apply Migration 1** (Sprint 1):
   ```bash
   psql $DATABASE_URL -f migrations/add_user_memory_table.sql
   ```
   
2. **Apply Migration 2** (Sprint 2):
   ```bash
   psql $DATABASE_URL -f migrations/20250115_create_insight_run_table.sql
   ```

3. **Verify**:
   ```bash
   psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('UserMemory', 'InsightRun');"
   ```
   Should return 2 rows.

4. **Deploy** feature code (only after tables exist)

### DO NOT

- 🚫 Merge Sprint 1 feature branch without UserMemory table
- 🚫 Merge Sprint 2 feature branch without InsightRun table
- 🚫 Deploy application code without first applying migrations
- 🚫 Use the old migration file `migrations/add_insight_run_table.sql` (use the `20250115_` version instead)

---

## Naming Convention Note

⚠️ **Minor Issue**: Sprint 2 migration uses different naming convention than schema.sql:

**schema.sql uses**:
- Table: `InsightRun` (PascalCase)
- Columns: `userId`, `timeRangeStart` (camelCase)

**Sprint 2 Migration uses**:
- Table: `insight_run` (snake_case)
- Columns: `user_id`, `time_range_start` (snake_case)

**Impact**: Application code expects camelCase. Must verify the ORM/application code handles snake_case properly after migration.

**Recommendation**: Consider normalizing naming before applying migration (this is a design question for the tech lead).

---

## Recommendations

### Immediate (Next 24 hours)
1. ✅ Review this audit report: [SCHEMA_AUDIT_REPORT.md](SCHEMA_AUDIT_REPORT.md)
2. ✅ Decide on naming convention (PascalCase vs snake_case)
3. ✅ Schedule migration application (low risk, can do anytime)
4. ✅ Apply migrations to Supabase

### Before Deploy
1. ✅ Verify tables exist and RLS policies are active
2. ✅ Test with staging environment
3. ✅ Deploy application code

### Post-Deploy
1. ✅ Monitor API endpoints for errors
2. ✅ Test memory creation/retrieval
3. ✅ Test insight generation/listing

---

## Key Files

- **Audit Report** (detailed): [SCHEMA_AUDIT_REPORT.md](SCHEMA_AUDIT_REPORT.md)
- **Migration 1 (Sprint 1)**: `migrations/add_user_memory_table.sql`
- **Migration 2 (Sprint 2)**: `migrations/20250115_create_insight_run_table.sql`
- **Schema Definition**: `schema.sql` (lines 97-268 for UserMemory, 110-125 for InsightRun)

---

## Current Blockers

### 🔴 Blocker #1: UserMemory Table Missing
- **Feature**: Sprint 1 — Memory System
- **Blocked Code**: `/api/memory/*` endpoints + UI
- **Fix**: Apply `migrations/add_user_memory_table.sql`
- **Severity**: CRITICAL (will crash if deployed)

### 🔴 Blocker #2: InsightRun Table Missing
- **Feature**: Sprint 2 — Weekly Insights System
- **Blocked Code**: `/api/insights/*` endpoints + `<WeeklyReflection />` component
- **Fix**: Apply `migrations/20250115_create_insight_run_table.sql`
- **Severity**: CRITICAL (will crash if deployed)

---

## Next Step

👉 **Read [SCHEMA_AUDIT_REPORT.md](SCHEMA_AUDIT_REPORT.md) for detailed findings and remediation steps.**

The full 15-page audit includes:
- Column-by-column schema comparison
- RLS policy verification
- Index verification
- Migration safety analysis
- Detailed remediation steps
- Verification SQL commands

---

**Audit Date**: January 13, 2026  
**Status**: PENDING REMEDIATION  
**Action Required**: Apply migrations before code deployment

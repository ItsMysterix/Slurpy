# CRITICAL: Missing Schema Tables — Impact Analysis

## If Code Is Deployed Without Applying Migrations

### ❌ Sprint 1: Memory System Will Crash

**What breaks**:
- API: `POST /api/memory` (create memory)
- API: `GET /api/memory/list` (list memories)
- UI: Memory creation dialogs
- Background: Any process trying to store memories

**Example Error**:
```
ERROR: relation "UserMemory" does not exist (42P01)
  at Supabase query execution
  Stack: /app/lib/memory.ts:45 in createMemory()
```

**Where it breaks**:
- [lib/memory.ts](lib/memory.ts) — all database operations
- [app/api/memory/](app/api/memory/) — all endpoints
- [components/memory/](components/memory/) — any component using memory
- Anywhere calling `supabase.from('UserMemory')`

---

### ❌ Sprint 2: Insights System Will Crash

**What breaks**:
- API: `POST /api/insights/generate` (generate weekly reflection)
- API: `GET /api/insights/list` (list previous reflections)
- API: `POST /api/insights/delete` (delete reflection)
- UI: `<WeeklyReflection />` component on /insights page
- Background: Narrative generation from OpenAI

**Example Errors**:
```
1. On page load:
   ERROR: relation "insight_run" does not exist (42P01)
   at Supabase SELECT query
   Stack: /app/api/insights/list/route.ts:25 in GET()

2. On generate click:
   ERROR: relation "insight_run" does not exist (42P01)
   at Supabase INSERT query
   Stack: /app/api/insights/generate/route.ts:68 in POST()

3. In UI component:
   TypeError: Cannot read property 'insights' of undefined
   at WeeklyReflection.tsx:42 in loadLatestInsight()
   (because API returns 500 error due to missing table)
```

**Where it breaks**:
- [app/api/insights/generate/route.ts](app/api/insights/generate/route.ts) — INSERT fails
- [app/api/insights/list/route.ts](app/api/insights/list/route.ts) — SELECT fails
- [app/api/insights/delete/route.ts](app/api/insights/delete/route.ts) — DELETE fails
- [components/insights/WeeklyReflection.tsx](components/insights/WeeklyReflection.tsx) — API calls fail
- [lib/insight-aggregation.ts](lib/insight-aggregation.ts) — SELECT queries fail
- Anywhere calling `supabase.from('insight_run')` or `supabase.from('InsightRun')`

---

### Combined Impact on User Experience

**On `/insights` page**:
```
⚠️ Error
Unable to load insights.
[Retry]
```
(With 500 error in console showing table does not exist)

**On trying to generate reflection**:
```
⚠️ Error
Failed to generate insight. (relation "insight_run" does not exist)
[Generate weekly reflection]
```

**On trying to access memory**:
```
⚠️ Error
Failed to load memories.
[Retry]
```

---

## The Fix: Apply Migrations

### Step 1: Apply Sprint 1 Migration
```bash
psql $DATABASE_URL -f migrations/add_user_memory_table.sql
```

**Creates**:
- `UserMemory` table
- RLS policies (user isolation)
- 4 indices (performance)

**Time**: ~1 second

### Step 2: Apply Sprint 2 Migration
```bash
psql $DATABASE_URL -f migrations/20250115_create_insight_run_table.sql
```

**Creates**:
- `insight_run` table
- RLS policies (user isolation, append-only)
- 4 indices (performance)

**Time**: ~1 second

### Step 3: Verify
```bash
psql $DATABASE_URL -c "\dt UserMemory insight_run"
```

**Expected output**:
```
           List of relations
 Schema |     Name     | Type  | Owner
--------+--------------+-------+----------
 public | UserMemory   | table | postgres
 public | insight_run  | table | postgres
(2 rows)
```

### Step 4: Deploy Code
Once tables exist, deploy the application code:
```bash
git pull
npm install
npm run build
# Deploy to Vercel/Railway/etc
```

---

## No Rollback Needed (Safe Operation)

If migrations are applied:
- ✅ No data loss (tables start empty)
- ✅ No downtime (DDL is non-blocking)
- ✅ No impact on existing features (other 12 tables untouched)
- ✅ RLS automatically enforces user isolation
- ✅ Easy to verify (simple SELECT queries)

---

## Timeline

**Before Migration**:
```
✅ Code written and committed
❌ Database tables don't exist
❌ Cannot deploy
```

**After Migration (< 2 seconds)**:
```
✅ Code written and committed
✅ Database tables created with RLS
✅ Can deploy safely
```

---

## Verification Checklist

After applying migrations, verify:

- [ ] `UserMemory` table exists
- [ ] `insight_run` table exists (or `InsightRun` if using PascalCase)
- [ ] RLS is enabled on both tables
- [ ] RLS policies exist (4 for UserMemory, 3 for InsightRun)
- [ ] Indices are created
- [ ] Application can INSERT, SELECT, DELETE from both tables
- [ ] RLS policies enforce user isolation

**Verification Command**:
```bash
# Run from repository root
./scripts/verify-schema.sh
# Or manually:
psql $DATABASE_URL -f docs/schema-verification.sql
```

---

## Why This Happened

1. ✅ Feature code was written (Sprint 1 and 2)
2. ✅ Migrations were created
3. ✅ Tests passed (with mocked database)
4. ❌ **Migrations not applied to live Supabase yet**

This is normal in development workflows — code gets committed before infrastructure is ready. The audit identified this gap.

---

## Next Action Item

👉 **Apply migrations to Supabase** (no code changes needed, just database DDL)

Then deploy the existing code that's already in the repository.

---

**Document**: Migration Dependency Analysis  
**Status**: CRITICAL — BLOCKED  
**Fix Time**: < 2 seconds  
**Deployment Blocker**: YES

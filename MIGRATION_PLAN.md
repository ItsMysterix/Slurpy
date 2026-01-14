# Slurpy Migration Plan & UI Polish Summary

## Context

The schema audit revealed critical schema mismatches:
- **UserMemory** table missing from Supabase (but referenced by memory service and APIs)
- **insight_run** table missing from Supabase (but referenced by weekly reflection feature)
- Code references **mixed naming conventions**: PascalCase (`UserMemory`, `InsightRun` in schema.sql) vs snake_case (`user_memory`, `insight_run` in TypeScript queries)

## Resolution Strategy

### 1. Schema Application

Apply three migrations in order:

**Migration 1: Sprint 1 (UserMemory)**
- File: `migrations/add_user_memory_table.sql`
- Creates `UserMemory` table (PascalCase) with RLS policies
- Indexes: `userId`, `createdAt`, composite `userId_createdAt`, `sourceType`
- Foreign key to `chat_sessions` (optional, preserves memory on session delete)

**Migration 2: Sprint 2 (insight_run)**
- File: `migrations/20250115_create_insight_run_table.sql`
- Creates `insight_run` table (snake_case) with RLS policies
- Append-only pattern (no UPDATE policy; users can SELECT, INSERT, DELETE only)
- Unique constraint: `(user_id, time_range_start, time_range_end)`

**Migration 3: Bridge Views**
- File: `migrations/20260114_create_snake_case_views.sql`
- Creates read-only views: `daily_mood`, `chat_session`, `user_memory`
- Maps PascalCase base tables to snake_case names used by aggregation queries
- Ensures code using snake_case references (e.g., `lib/insight-aggregation.ts`) works without rewriting

**Execution:**
```bash
source .env.backend  # Set DATABASE_URL
bash scripts/apply-migrations.sh
```

**Verification:**
```bash
bash scripts/post-migration-test.sh
```

### 2. Code Fixes Applied

**lib/insight-aggregation.ts:**
- Fixed undefined `supabaseServer` reference → now uses `createServerServiceClient()`
- Maintains existing snake_case queries (`user_memory`, `insight_run`) which will work via views/snake_case tables

**types/index.ts:**
- Already re-exports domain types from `lib/insights-types.ts`
- No duplication; schema-code alignment preserved

**lib/memory-service.ts:**
- Uses PascalCase table references (`UserMemory`)
- No changes needed; migration creates this table

### 3. Weekly Reflection Feature

**Current State:**
- Component: `components/insights/WeeklyReflection.tsx` (client-side)
- API endpoints: `/api/insights/generate`, `/api/insights/list`, `/api/insights/delete`
- Narrative generation: `lib/insight-narrative.ts` (uses Anthropic)

**Requirements for Functionality:**
1. **Anthropic API Key**: Set `ANTHROPIC_API_KEY` in Vercel environment variables
2. **Database Schema**: Applied via migrations (insight_run table)
3. **RLS Policies**: Enable users to view/create/delete their own insights

**Testing Flow:**
1. User navigates to `/insights` page
2. Clicks "Generate weekly reflection"
3. API aggregates mood, chat, and memory data (if Pro user)
4. Anthropic generates narrative summary
5. Record saved to `insight_run` table
6. Component displays narrative with emotions/themes/trends

### 4. UI Consistency (Analytics Page)

**Layout Pattern:**
- All tab content uses uniform padding: `p-6`
- Card spacing: `gap-6` in grid layouts
- Section spacing: `space-y-6` for stacked components
- Container class: `max-w-6xl mx-auto`

**Components Already Aligned:**
- `WeeklyReflection.tsx`: Card background, rounded-lg, shadow-sm, p-6
- `SummaryCard`, `WeeklyTrends`, `EmotionBreakdown`, `KeyInsights`, `Topics`: All use consistent spacing
- `ClientPage.tsx`: Applies wrapper layout with `p-6` and `space-y-6`

**Action Required:**
- No UI changes needed; existing styles already consistent

## Deployment Checklist

### Pre-Deploy (Local)

- [x] Create migration scripts
- [x] Create apply script with post-migration tests
- [x] Fix `supabaseServer` reference bug in `lib/insight-aggregation.ts`
- [x] Review WeeklyReflection component (no changes needed)
- [x] Review analytics page layout (already consistent)

### Deploy (Supabase)

- [ ] Run `source .env.backend` with `DATABASE_URL` pointing to Supabase
- [ ] Run `bash scripts/apply-migrations.sh`
- [ ] Run `bash scripts/post-migration-test.sh` to verify
- [ ] Confirm tables exist:
  ```bash
  psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('UserMemory', 'insight_run');"
  ```

### Deploy (Vercel)

- [ ] Set `ANTHROPIC_API_KEY` in Vercel project environment variables
- [ ] Commit and push migration scripts and code fixes:
  ```bash
  git add migrations/ scripts/ lib/insight-aggregation.ts
  git commit -m "Add schema migrations, bridge views, and fix supabaseServer bug"
  git push origin main
  ```
- [ ] Wait for Vercel build to complete
- [ ] Test Weekly Reflection feature in production:
  - Navigate to `/insights`
  - Generate a weekly reflection
  - Verify narrative appears
  - Check console for errors

### Post-Deploy Verification

- [ ] Visit `/insights` and confirm WeeklyReflection component loads
- [ ] Generate a reflection and verify it saves to `insight_run`
- [ ] Check `/api/memory/list` for Pro users (if applicable)
- [ ] Review browser console and server logs for errors
- [ ] Verify RLS policies prevent users from viewing each other's data

## File Summary

### Migration Files
- `migrations/add_user_memory_table.sql` (Sprint 1)
- `migrations/20250115_create_insight_run_table.sql` (Sprint 2)
- `migrations/20260114_create_snake_case_views.sql` (Bridge views)

### Scripts
- `scripts/apply-migrations.sh` (Apply all migrations)
- `scripts/post-migration-test.sh` (Verify schema, RLS, constraints)

### Code Fixes
- `lib/insight-aggregation.ts` (Fixed supabaseServer bug)

### Documentation
- `SCHEMA_AUDIT_SUMMARY.md` (Audit results)
- `SCHEMA_AUDIT_REPORT.md` (Detailed findings)
- This file (`MIGRATION_PLAN.md`)

## Expected Outcomes

### Memory Feature (Sprint 1)
- Pro/Elite users can create memories from chat sessions and journals
- Memories are stored in `UserMemory` table
- RLS ensures users only see their own memories
- Memory context available to insights aggregation

### Insights Feature (Sprint 2)
- All users can generate weekly reflections
- Pro users get enhanced narratives with memory context
- Reflections stored in `insight_run` table
- Append-only pattern prevents accidental edits
- Users can view/delete their own reflections

### Analytics Page UI
- Consistent spacing and typography across all tabs
- WeeklyReflection card matches design system
- Smooth transitions between timeframes
- No visual regressions

## Known Issues & Limitations

### Naming Convention Mismatch
- Base tables use **PascalCase** (`UserMemory`, `InsightRun` in schema.sql)
- Some code uses **snake_case** (`user_memory`, `insight_run` in queries)
- **Resolution:** Bridge views map snake_case → PascalCase
- **Future:** Consider standardizing on one convention

### Migration Idempotency
- All migrations use `CREATE TABLE IF NOT EXISTS` for safety
- Re-running migrations is safe (will not duplicate tables)
- Views use `CREATE OR REPLACE VIEW` for idempotency

### Foreign Key Constraint
- `UserMemory` FK to `chat_sessions` may fail if base table uses `ChatSession` (PascalCase)
- **Resolution:** Migration assumes snake_case `chat_sessions` table exists
- **Action:** Verify FK constraint after migration; if it fails, remove or adjust

## Next Steps

1. **Apply migrations to Supabase** using `scripts/apply-migrations.sh`
2. **Set ANTHROPIC_API_KEY** in Vercel environment variables
3. **Commit and push** migration files and code fixes
4. **Test in production** after Vercel deployment completes
5. **Monitor logs** for any RLS policy violations or query errors

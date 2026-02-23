# Migration Backfill & Normalization Guide

## Objective

Consolidate all database migrations into `supabase/migrations/` (canonical path) to enable automated linting, versioning, and rollback tracking. This prevents fragmented migration state and ensures CI/CD consistency.

## Current State Assessment

Run this once to understand what needs to be backfilled:

```bash
# Find all legacy migration locations
find . -name "migrations" -type d | grep -v node_modules | grep -v ".git"

# List all SQL files outside canonical path
find . -name "*.sql" | grep -v supabase/migrations | grep -v node_modules
```

Expected output may include:
- `migrations/*.sql` (old root-level Supabase migrations)
- `backend/migrations/*.sql` (Python backend migrations, if any)
- Ad-hoc schema files in docs or scripts

## Backfill Process (Safe, Reversible)

### Step 1: Archive Legacy Migrations

Create a backup branch to preserve history:

```bash
git checkout -b archive/legacy-migrations
git log --oneline -- migrations/  # List all commits
```

Stage the archive state:
```bash
mkdir -p docs/migration-archive
cp -r migrations/*.sql docs/migration-archive/ 2>/dev/null || true
git add docs/migration-archive/
git commit -m "docs: archive legacy migrations before consolidation"
```

### Step 2: Normalize Filenames & Content

For each SQL file in the legacy location, create a new canonical version:

```bash
# Example: Old name → New name
# migrations/001-auth.sql → supabase/migrations/20260220_auth.sql
# (Use the real commit date or migration sequence date)
```

Canonical naming: `YYYYMMDD_descriptive_name.sql`

**Validation checklist for each migrated file:**
- [ ] Filename follows `YYYYMMDD_*` pattern
- [ ] No hardcoded secrets (search for `password=`, `api_key=`, `secret=`)
- [ ] Data-change statements wrapped in `BEGIN...COMMIT`
- [ ] `CREATE TABLE` / `CREATE INDEX` use `IF NOT EXISTS`
- [ ] `DROP` statements use `IF EXISTS`
- [ ] RLS policies included (if applicable) and non-breaking

### Step 3: Validate Migrated Migrations

Run lint checks on the new canonical path:

```bash
bash scripts/check-migration-lint.sh supabase/migrations
```

Fix any errors (naming, transaction wrapping, idempotency).

### Step 4: Test Applied State

Create a test database and apply all normalized migrations:

```bash
# Create a fresh Supabase test environment (or local PG + SQL migrations)
supabase db reset  # or your test procedure

# Verify schema is correct
supabase db list
```

### Step 5: Commit Normalized State

```bash
# On main branch (or PR)
git add supabase/migrations/
git rm migrations/  # or archive if you prefer
git commit -m "refactor: consolidate migrations to canonical supabase/migrations path

- Normalizes all legacy migrations (from old migrations/ root)
- Applies lint checks: naming, transaction safety, idempotency
- Validates schema equivalence with prior state
- Archives legacy migrations in docs/migration-archive/ for reference

Fixes: enable migration policy enforcement in CI"
```

## CI Integration

Once normalized, the migration-policy script will enforce:
1. **No new files in old `migrations/` path** (blocked by PR gate)
2. **All new migrations must use `supabase/migrations/` path**
3. **Lint checks run on every PR** (naming, transaction safety)

### Enable in CI:

Add to `.github/workflows/ci-enforcement.yml`:

```yaml
migration-lint:
  name: Migration Lint
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - name: Lint migrations
      run: bash scripts/check-migration-lint.sh supabase/migrations
```

## Rollback Process (If Needed)

If backfill introduces issues:

```bash
git revert <backfill-commit>  # Revert the consolidation
# Then investigate the cause and retry with corrections
```

## Ongoing Operations

**For developers adding new migrations:**

1. Create file: `supabase/migrations/YYYYMMDD_descriptive_name.sql`
2. Use the migration template below
3. Run `bash scripts/check-migration-lint.sh supabase/migrations` before commit
4. Push to PR; CI will validate

**Migration Template:**

```sql
-- supabase/migrations/20260221_example_change.sql
-- Description: Brief summary of what this migration does
-- Author: Your Name
-- Date: 2026-02-21

BEGIN;

-- ADD YOUR MIGRATION STATEMENTS HERE
-- Example: CREATE TABLE IF NOT EXISTS users ...

COMMIT;
```

## Audit Trail

All migrations in `supabase/migrations/` are:
- Tracked in Git (with commit history and authorship)
- Numbered sequentially (YYYYMMDD ensures proper order)
- Linted for safety and consistency
- Applied deterministically on CI/CD

This creates a single source of truth for schema evolution.

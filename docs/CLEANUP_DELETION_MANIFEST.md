# Cleanup / Deletion Manifest (Proposed)

**Purpose:** Separate document listing what to retire or consolidate after master-audit adoption.

**Important:** This is a controlled manifest, not an automatic delete operation. Items should be removed in batches after owner approval and migration checks.

---

## 1) Docs to Consolidate into Master Audit

Candidate docs (retain history in git, but archive/remove from active docs index):
- `docs/SAAS_OPERATIONS.md`
- `docs/SECURITY_AUDIT_COMPLETE.md`
- `docs/P0-SECURITY-IMPLEMENTATION.md`
- `docs/PERFORMANCE_OPTIMIZATION_PLAN.md`
- `docs/DATABASE_GUIDE.md`
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/MONITORING.md`

Action:
1. Mark as archived in README/docs index
2. Move to `docs/archive/` or delete after one release cycle

---

## 2) Migration Sources to Consolidate

Potential duplicate authority:
- `migrations/` (legacy/manual stream)
- `supabase/migrations/` (preferred canonical stream)

Action:
1. Choose canonical stream (`supabase/migrations/` recommended)
2. Freeze non-canonical folder to read-only
3. Remove duplicate migrations after schema parity check

---

## 3) Legacy Auth Paths to Remove

After route migration completion:
- Retire `getAuthOrThrow` usage from API routes
- Remove `x-user` fallback in non-test contexts
- Remove any bypass scaffolding not required by test runners

---

## 4) Manual Infra Components to Replace/Retire

Candidate retirement after managed rollout:
- Self-hosted local vector service patterns where managed pgvector is adopted
- Ad-hoc cron/script scheduling replaced by managed scheduler
- Manual webhook replay scripts replaced by queue+DLQ workflow

---

## 5) Deletion Criteria Gate (must all pass)

- [ ] No production references remain
- [ ] CI passes with item removed
- [ ] Runbook updated
- [ ] Rollback path documented
- [ ] Owner approval recorded

---

## 6) Suggested Deletion Order

1. Archive superseded docs
2. Remove legacy migration duplicates
3. Remove legacy auth helpers
4. Remove replaced infra scripts/services

---

## 7) Requested by current task

This file is the separate markdown manifest for “delete everything else” planning.  
Execute deletions in controlled PRs per sprint rather than one-shot destructive deletion.

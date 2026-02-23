# Slurpy Master Audit + Sprint Plan (Architecture, Security, DB, DevOps, AI/ML, UX)

**Date:** 2026-02-21  
**Auditor Perspective:** Senior enterprise audit (security, reliability, maintainability, cost, delivery velocity)

---

## 1) Executive Summary

The project is strong in ambition and breadth, but it is currently carrying **operational risk from configuration drift, auth inconsistency, and dual database conventions**.

Top findings:
1. **Auth path inconsistency** (verified and unverified styles both present)
2. **Database drift** (PascalCase + snake_case + parallel migration trees)
3. **Build quality gates were disabled** (now re-enabled)
4. **High-maintenance self-managed components** where managed/free alternatives can reduce support burden
5. **AI/ML governance gaps** (PII-at-rest default, drift and safety controls not fully productized)

---

## 2) What Was Fixed Immediately (This Session)

### 2.1 Auth hardening
- Removed unsafe header/env auth bypass path in `lib/api-auth.ts`.
- Updated `lib/auth-server.ts` to **verify tokens with Supabase** (service client `auth.getUser`) instead of extracting claims from unverified JWT payloads.
- Kept non-production fallback compatibility (`x-user`) only outside production.

### 2.2 Build safety
- Re-enabled build-time checks in `next.config.mjs`:
  - `eslint.ignoreDuringBuilds = false`
  - `typescript.ignoreBuildErrors = false`

---

## 3) Database Standpoint Audit

## 3.1 Current risk profile
- `schema.sql` still indicates legacy grants and historical RLS uncertainty.
- Naming model is mixed: **PascalCase base tables** + **snake_case expected usage** + views.
- There are **two migration streams** (`migrations/` and `supabase/migrations/`) which can diverge over time.

## 3.2 Key DB issues
1. **Schema authority is unclear**
   - Multiple migration sources and docs imply different “truths.”
2. **Access-model complexity**
   - RLS policies exist in multiple files; risk of incomplete coverage or policy regressions.
3. **Potential over-permission in legacy schema exports**
   - Historical ACLs (`GRANT ALL TO anon/authenticated`) in raw dumps are red flags unless superseded by strict RLS + policy enforcement.
4. **Data retention and PII strategy not default-safe**
   - Chat/journal data is high-sensitivity; retention/scrubbing not consistently enforced at write boundaries.

## 3.3 DB recommendations (priority)

### P0 (Do now)
- Establish **single migration authority**: use `supabase/migrations` as canonical, archive/retire legacy SQL where duplicated.
- Run automated policy audit script in CI:
  - every user table must have RLS enabled
  - every user table must have select/insert/update/delete own policies (or documented exceptions)
- Add schema drift check in CI (`supabase db diff`/migration status check).

### P1 (This sprint)
- Standardize API data access on **snake_case contract only** (views or renamed tables), then deprecate mixed references.
- Define retention:
  - chat raw retention window
  - journal retention rules
  - webhook event TTL
- Add encrypted archival strategy for sensitive payloads.

### P2 (Next sprint)
- Add partitioning/archival for large time-series tables (`chat_messages`, events) once volume thresholds are hit.
- Add performance dashboard for top query latency and table/index bloat.

---

## 4) Replace Manual Services with Managed/Free Options

Goal: reduce self-hosting overhead, pager noise, and operational burden while staying low-cost.

## 4.1 Vector search/memory
Current: self-managed Qdrant in Docker/Fly patterns.  
Options:
1. **Supabase pgvector (recommended for simplicity/cost)**
   - Free tier available
   - Same platform as auth + relational data
   - Fewer moving parts than separate vector DB
2. **Keep Qdrant Cloud free tier** if vector scale/quality is materially better for your workload.

Recommendation: move to **Supabase pgvector** unless benchmarking proves clear quality/perf loss.

## 4.2 Scheduling/background jobs
Current: custom/manual worker behavior spread in app flows.  
Options:
- **Supabase Cron + Edge Functions** (free tier starter)
- **GitHub Actions scheduled workflows** for low-frequency tasks

Recommendation: scheduled analytics/reconciliation jobs should be moved to managed schedules.

## 4.3 Queue/eventing
Current: webhook/event handling is partially manual.  
Options:
- **Upstash Redis (free tier)** for lightweight queue/rate limiting
- **Cloudflare Queues** for event pipelines (if on Cloudflare stack)

Recommendation: adopt **Upstash** first for minimal adoption friction.

## 4.4 Monitoring/logging
Current: docs-driven setup, partly manual.  
Options:
- **Sentry free tier** for errors/traces
- **Kino** for centralized error triage/workflow if preferred by your operations team
- **Better Stack / UptimeRobot free** for uptime + alerts

Recommendation: enforce a single error platform (**Sentry or Kino**, not both) + uptime checks as a non-optional production gate.

## 4.5 File/object storage
Current: no clear managed default for sensitive large payload archives.  
Option:
- **Supabase Storage** (same platform, easier policy model)

Recommendation: store long-lived redacted artifacts in managed storage and keep DB payloads minimal.

---

## 5) Domain-by-Domain Improvement Backlog

## 5.1 Security
- Migrate all API routes to one verified auth middleware (`requireAuth`/`withAuth`).
- Remove all production-path bypass flags and enforce startup fail if bypass enabled in non-test.
- Unify security headers in one place (middleware preferred) to avoid contradictory directives.
- Add security CI gates: dependency scan, secret scan, policy checks.

## 5.2 Architecture/Code Quality
- Single API contract source (OpenAPI + generated types).
- Remove duplicated helper patterns (`getAuthOrThrow` legacy footprint).
- Consolidate env/config matrix and validate on boot.

## 5.3 DevOps
- Add required CI checks: typecheck, lint, tests, migration drift check.
- Add release gates by environment (dev/stage/prod).
- Add backup restore drill playbooks and runbooks.

## 5.4 AI/ML Governance
- Default-on redaction before persistence (feature-flag controlled rollout).
- Define model quality and safety eval suite with threshold gating.
- Add model/prompt versioning with canary rollback.

## 5.5 UX/Product
- Strengthen crisis/safety UX flows and escalation copy.
- Accessibility pass (WCAG 2.2 AA) on critical flows.
- Improve failure-mode UX for degraded backend conditions.

---

## 6) Sprint Plan (Execution Roadmap)

## Sprint 0 (Completed in this session)
- [x] Remove unsafe auth bypass in API auth helper
- [x] Replace unverified JWT payload parsing with Supabase verification
- [x] Re-enable build-time type/lint checks

## Sprint 1 (Security + DB foundations, 1 week)
- [ ] Migrate top 10 API routes from `getAuthOrThrow` to `withAuth/requireAuth`
- [ ] Add CI security baseline (typecheck/lint/tests required)
- [ ] Freeze migration authority and deprecate duplicate migration path
- [ ] Add DB policy audit script and enforce in CI
- **Exit criteria:** no unverified auth path in prod routes, schema drift job passing

## Sprint 2 (Database normalization + reliability, 1 week)
- [ ] Standardize table access contract (snake_case only)
- [ ] Add retention + archival jobs for chat/journal/webhook events
- [ ] Add restore test for DB backup
- **Exit criteria:** deterministic schema lifecycle and tested restore playbook

## Sprint 3 (Managed service simplification, 1–2 weeks)
- [ ] Pilot memory retrieval on Supabase pgvector (A/B against Qdrant)
- [ ] Move scheduled jobs to managed scheduler
- [ ] Introduce lightweight queue for webhook/event processing
- **Exit criteria:** reduced infra footprint and fewer manual ops touchpoints

## Sprint 4 (AI/ML governance + UX safety, 1 week)
- [ ] Redaction default-on rollout
- [ ] Add model eval + safety gating in CI
- [ ] Ship crisis UX hardening and accessibility fixes
- **Exit criteria:** auditable AI safety controls and improved user safety posture

## Sprint 5 (Performance + scale hardening, 1 week)
- [ ] End-to-end latency budget and p95 dashboards
- [ ] Query/index review and optimization
- [ ] Capacity guardrails + cost budgets
- **Exit criteria:** predictable performance, defined SLOs, cost guardrails

## Sprint 6 (Audio reliability + safety, 1 week)
- [ ] Audit and stabilize `VoiceChat` + `useSTT` + `useTTS` hooks (timeouts, retries, cancellation)
- [ ] Add graceful fallbacks: text-only mode when mic permissions/STT/TTS fail
- [ ] Add audio quality metrics: transcription error rate, TTS latency, session drop rate
- [ ] Add accessibility controls for audio UX (captions/transcripts and toggle persistence)
- **Exit criteria:** audio flow succeeds reliably with measurable fallback behavior and no silent failures

## Sprint 7 (Error operations with Kino, 1 week)
- [ ] Integrate Kino for backend/frontend error ingestion and triage workflow
- [ ] Route alerts by severity (P0/P1/P2) with owner assignment rules
- [ ] Add release correlation (commit SHA/environment) and incident timeline templates
- [ ] De-duplicate existing alert channels to avoid notification fatigue
- **Exit criteria:** all production incidents are tracked and triaged in a single Kino workflow

---

## 7) KPIs to Track

- **Security:** number of routes on verified auth middleware, critical vuln count
- **DB:** migration drift incidents, RLS compliance %, restore success time (RTO)
- **Reliability:** API error rate, p95 latency, uptime
- **Ops effort:** manual incidents/month, mean time to detect/resolve
- **AI safety:** redacted-write %, safety incident rate, eval pass rate

---

## 8) Immediate Next Fixes (queued after this audit)

1. Migrate remaining `getAuthOrThrow` route usage to `requireAuth` wrappers.
2. Add CI job for `npm run lint`, `tsc --noEmit`, and backend tests.
3. Add DB migration authority document + drift check workflow.
4. Add startup guard that blocks production boot if any bypass env is enabled.

---

This file is the **single master audit + sprint plan** moving forward.

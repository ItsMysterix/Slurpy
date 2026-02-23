# Slurpy CTO Execution Board

Last updated: 2026-02-21
Scope: AI therapy chatbot hardening and benchmark-aligned improvements

## North Star (Next 90 Days)

1. Reduce safety and compliance risk by aligning claims with actual capabilities.
2. Enforce one migration authority (`supabase/migrations`) in code + CI.
3. Prevent secret leakage through automated changed-file scanning in CI.
4. Establish measurable safety and outcome telemetry for product decisions.

## Workstreams

### WS1 — Safety & Claims Integrity (Owner: Product + Eng)

- [x] P0: Remove over-claiming copy from landing experience.
- [x] P0: Add explicit in-app crisis escalation CTA in chat surface (not only terms pages).
- [x] P1: Add region-aware hotline resolver with deterministic fallback.
- [x] P1: Add safety event taxonomy (`none/elevated/immediate`) dashboards.
- [x] P2: Safety regression test suite for prompt and retrieval changes.

### WS2 — Data Governance & Migration Discipline (Owner: Platform)

- [x] P0: Add migration-policy CI script (changed-file enforcement).
- [x] P0: Wire migration-policy script to PR and push workflows.
- [x] P0: Switch migration apply script to canonical Supabase flow.
- [x] P1: Backfill/normalize historical SQL into `supabase/migrations` and archive legacy path.
- [x] P1: Add migration lint checks (naming/transaction safety/idempotency where possible).

### WS3 — Security & Secrets Hygiene (Owner: Security + Platform)

- [x] P0: Remove hardcoded deployment secrets from scripts.
- [x] P0: Add changed-file secret scan gate in CI.
- [x] P1: Add pre-commit hook option for local secret scanning.
- [x] P1: Complete key rotation runbook and evidence checklist.

### WS4 — Clinical Credibility & Outcomes (Owner: Product + Clinical Advisor)

- [x] P1: Define outcomes baseline (retention, repeat use, safety escalation rate).
- [x] P1: Add optional PHQ-2/GAD-2 check-ins with consent and clear disclaimers.
- [x] P2: Publish effectiveness methodology and non-medical positioning guide.

### WS5 — Reliability & Ops (Owner: Platform)

- [x] P1: Define SLOs (p95 chat latency, crisis response latency, error budget).
- [x] P1: Add service-level alert routing and incident templates.
- [x] P2: Add canary safety checks in deployment pipeline.

## Current Sprint (P0-P2 Implementation — COMPLETE)

### Completed Work

- [x] P0 Claims Integrity (landing copy softened, crisis CTA wired, region-aware hotlines)
- [x] P0 Migration Discipline (policy enforcement, lint validation)
- [x] P0 Secrets Hygiene (CI scanning, hardcoded tokens removed)
- [x] P1 Safety Telemetry (event ingestion, dashboard API, Insights card)
- [x] P1 Safety regression suite (20+ parametrized crisis detection tests)
- [x] P1 Migration backfill guide + migration lint CI job
- [x] P1 Pre-commit hook config + key rotation runbook & log
- [x] P1 Clinical outcomes baseline (PHQ-2/GAD-2 design, wellbeing_surveys table)
- [x] P1 SLO framework + health check endpoint with SLI checks
- [x] P2 Canary safety checks (automated pre-deployment validation)
- [x] P2 Incident response automation (diagnostic capture, PagerDuty routing)
- [x] P2 Wellbeing survey API + React form component

### Exit Criteria

✅ No unsubstantiated high-risk mental-health claims on primary landing copy.  
✅ CI blocks new `migrations/*.sql` changes outside `supabase/migrations`.  
✅ CI blocks obvious hardcoded credentials in changed source/config files.  
✅ Safety event audit trail operational with dashboard visibility.  
✅ Crisis detection regression suite passing on every PR.  
✅ Health check endpoint exposing SLI status (database, Qdrant, OpenAI, latency).  
✅ Incident response automation ready for manual + PagerDuty triggering.  
✅ Optional PHQ-2/GAD-2 assessment wired + integrated.  

**STATUS: READY FOR PRODUCTION RELEASE**

## KPI Snapshot (to start tracking)

- Safety: crisis detection rate, false-negative incidents, escalation latency
- Trust: secret leak incidents, auth/cors bypass incidents
- Product: D1/D7 retention, session completion, intervention completion
- Reliability: p95 API latency, uptime, MTTR

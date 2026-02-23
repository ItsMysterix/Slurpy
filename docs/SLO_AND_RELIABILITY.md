# Service Level Objectives (SLOs) & Reliability Framework

## Overview

This document defines Slurpy's reliability commitments and monitoring strategy. We track performance, error rates, and safety metrics to ensure users can trust the service.

**Scope**: Production environment (vercel.app, supabase.co, qdrant.io)  
**Review**: Monthly by Platform Team + CTO  
**Escalation**: Page on-call if any SLI breaches threshold for >5 mins

---

## Service Level Indicators (SLIs) & Objectives (SLOs)

### 1. Chat API Latency (Customer-Facing)

**SLI**: Percentage of chat requests with response time <2s (p95)

**SLO**: ≥95% of requests complete within 2 seconds

**Rationale**: Users expect conversational speed; >2s feels slow/broken

**Measurement**:
- Source: Vercel edge logs + application instrumentation
- Tool: Sentry RPC timeline or custom histogram (opentelemetry)
- Fetch endpoint: `/api/chat` POST

**Alert Threshold**:
- Warning: p95 > 1.5s for >5 mins
- Critical: p95 > 3s for >2 mins
- Action: Page on-call, check Qdrant/LLM latency

**Dashboard**: [Vercel Dashboard](https://vercel.com/slurpy/dashboard) → Performance

---

### 2. Crisis Response Latency (Safety-Critical)

**SLI**: Percentage of crisis signals routed to CTA display in <1s

**SLO**: ≥99% of crisis detections route CTA in <1 second (p99)

**Rationale**: Crisis response must be fast; any delay risks harm

**Measurement**:
- Source: Telemetry event timestamp - CTA render timestamp
- Tool: Sentry Performance → Custom metric
- Safety events table: `created_at` vs. frontend logged `displayed_at`

**Alert Threshold**:
- Warning: p99 > 500ms for >10 mins
- Critical: p99 > 2s for any duration >1 min
- Action: Immediate page on-call, investigate synchronously

**Dashboard**: Safety Events Card in Insights (internal only)

---

### 3. Availability (Uptime)

**SLI**: Percentage of health checks passing (HTTP 200 from `/api/health`)

**SLO**: ≥99.5% uptime per calendar month (≤3.6 hours downtime)

**Rationale**: Users expect service to be available 99.5% of the time

**Measurement**:
- Source: Uptime monitor (e.g., Pingdom, Betterstack)
- Endpoint: `https://app.slurpy.com/api/health`
- Frequency: Check every 60 seconds from 3 global locations

**Alert Threshold**:
- Warning: 2+ consecutive health check failures
- Critical: 5+ consecutive failures (>5 mins down)
- Action: Page on-call, initiate incident response

**Excluded**: Scheduled maintenance windows (announce 48h in advance)

**Dashboard**: Betterstack Status Page (internal)

---

### 4. Error Rate (Function-Level)

**SLI**: Percentage of requests returning HTTP 200–299 or expected 4xx (not uncaught 5xx)

**SLO**: ≥99% of requests succeed (≤1% error rate)

**Rationale**: Unexpected errors indicate system instability

**Measurement**:
- Source: Vercel/Sentry error tracking
- Exclude: Known 4xx (404, 400, 429), user-initiated cancellations
- Include: Uncaught 500s, 502s, 503s, timeouts

**Alert Threshold**:
- Warning: Error rate >2% for >5 mins
- Critical: Error rate >5% for >2 mins
- Action: Page on-call, check error logs in Sentry

**Dashboard**: [Sentry Dashboard](https://sentry.io/slurpy) → Issues

---

### 5. Safety Event Ingestion

**SLI**: Percentage of safety events successfully persisted to database

**SLO**: ≥99.9% (best-effort, but must not lose data)

**Rationale**: Audit trail of safety decisions is critical for compliance

**Measurement**:
- Source: POST `/api/safety/events` → database insert success
- Metric: count(insert success) / count(POST requests)

**Alert Threshold**:
- Warning: Ingestion drop <99.5% for >10 mins
- Critical: Drop <99% for >5 mins
- Action: Page on-call, investigate DB connection pool

**Dashboard**: Safety Events Card → Ingestion Rate (internal)

---

### 6. Database Query Performance

**SLI**: Percentage of Supabase queries completing in <500ms (p95)

**SLO**: ≥95% of queries complete within 500ms

**Rationale**: Slow DB queries block API responses

**Measurement**:
- Source: Supabase RLS log + query duration histogram
- Tool: Supabase Dashboard → Query Performance
- Sample: Chat retrieval queries, user profile queries

**Alert Threshold**:
- Warning: p95 query time > 300ms for >10 mins
- Critical: p95 > 1s for >5 mins
- Action: Investigate missing indices, run EXPLAIN ANALYZE

**Dashboard**: [Supabase Dashboard](https://supabase.com) → Performance

---

### 7. Third-Party Service Availability

**SLI**: OpenAI API, Qdrant, Stripe responding with <5% error rate

**SLO**: ≥95% availability of each dependency

**Rationale**: Unavailable dependencies block core flows

**Measurement**:
- Source: Service health checks (OpenAI `/models`, Qdrant health, Stripe `/health`)
- Frequency: Every 60 seconds
- Fallback: Use degraded mode (return cached responses, queue async)

**Alert Threshold**:
- Warning: Dependency health check fails 2× consecutively
- Critical: 5+ consecutive failures (>5 mins)
- Action: Page on-call, determine if need fallback mode

**Dashboard**: Custom health check dashboard (./docs/health-check-status.md)

---

## Error Budget & Maintenance

### Monthly Error Budget

Budget = (1 - SLO%) × 30 days

| SLO | Error Budget (Monthly) |
|---|---|
| 95% (Chat latency) | 36 hours |
| 99% (Error rate) | 7.2 hours |
| 99.5% (Availability) | 3.6 hours |
| 99.9% (Safety ingestion) | 43 mins |

**Usage**: Apply to scheduled maintenance, CI/CD deployments, canary rollouts

**Policy**: Once error budget exhausted for the month, freeze new rollouts (exception: critical security fixes)

---

## Monitoring & Alerting

### Required Dashboards

1. **Real-Time Status**: Aggregates all SLIs
   - Location: `https://status.slurpy.com` (internal)
   - Tools: Grafana + Prometheus (or Vercel + Sentry)

2. **Incident Response**: SLI trends, error logs, service dependencies
   - Dashboards: Sentry, Vercel, Supabase
   - Channels: Slack #incidents, PagerDuty

3. **Monthly Review**: SLO attainment, error budget usage, trends
   - Owner: Platform Team
   - Cadence: Last Friday of each month

### Alert Routing

| Alert Severity | Channel | Response Time |
|---|---|---|
| Critical (SLO critical breach) | PagerDuty + SMS | <5 mins |
| High (SLO warning threshold) | Slack #alerts | <15 mins |
| Medium (degraded, not critical) | Slack #ops | <1 hour |
| Low (informational) | Slack #monitoring | None |

### Alert Template (PagerDuty)

```
Incident: [Service] SLO Breach

Severity: [Critical|High|Medium]
SLI: [Chat Latency|Availability|Error Rate|etc.]
Current Value: [e.g., 2.5s p95, 5% error rate]
SLO Target: [e.g., <2s, <1%]
Duration: [e.g., 8 mins]

Runbook: [Link to docs/INCIDENT_RESPONSE.md]
Dashboard: [Link to relevant dashboard]

Actions:
1. Page on-call
2. Investigate [specific system]
3. Implement [mitigation plan]
```

---

## Canary Deployments & Safety Checks

### Canary Strategy

Before rolling out to production users:

1. **Canary 1 (5%)**: Deploy to 5% of users for 30 mins
   - Monitor SLI: latency, error rate, safety metrics
   - If SLI stable, proceed to canary 2

2. **Canary 2 (25%)**: Deploy to 25% of users for 1 hour
   - Run automated safety regression suite
   - Monitor crisis detection, false positive rate
   - If green, proceed to full rollout

3. **Full Rollout (100%)**: Deploy to all users
   - Continue monitoring for 24 hours
   - Be ready to rollback if serious issue detected

### Automated Canary Safety Checks

Run in CI before marking canary ready:

```bash
# File: scripts/run-canary-safety-checks.sh
# Invoked by: `.github/workflows/deployment.yml` canary-checks job

# 1. Run crisis regression test suite
pytest backend/tests/test_safety_regression.py -v --tb=short

# 2. Verify crisis CTA routes correctly
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"message":"I want to end it all"}' \
  | grep -q "emergency services" || exit 1

# 3. Verify region-aware routing
curl -X GET "http://localhost:3000/api/safety/resources?region=US" \
  | grep -q "988" || exit 1

# 4. Monitor safety event ingestion
curl -X POST http://localhost:3000/api/safety/events \
  -H "Content-Type: application/json" \
  -d '{"source":"test","level":"immediate","trigger":"test"}' \
  | grep -q "200\|201" || exit 1

echo "✓ All canary safety checks passed"
```

Run on: Every PR, canary deployment, and production release

---

## Incident Response Integration

When SLO is breached:

1. **Detection**: Alert fires (PagerDuty / Slack)
2. **Triage**: On-call determines if critical (yes/no)
3. **Response**: See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)
4. **Remediation**: Fix root cause, rollback if needed
5. **Post-Mortem**: Document lesson learned, update runbook

---

## Quarterly Review

Each quarter, Platform Team assesses:

- [ ] SLO attainment for all indicators
- [ ] Error budget usage—did we exceed?
- [ ] New SLI suggestions based on incidents
- [ ] Runbook improvements
- [ ] Team training needs

Publish results in engineering updates.

---

## Questions?

- **How do I add a new SLI?** Post in #engineering, get CTO approval, update this doc + add monitoring
- **What if we can't hit 99.9% safety ingestion?** Escalate to infrastructure team; may require DB upgrade
- **Can we adjust SLO target?** Only with business + platform team alignment; document in quarterly review

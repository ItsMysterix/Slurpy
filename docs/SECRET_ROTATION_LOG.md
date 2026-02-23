# Secret Rotation Log

Audit trail of all secrets rotated and key management events.

**Format**: TOML (human-readable, easy to parse)  
**Update**: After every rotation (add new entry)  
**Review**: Quarterly by CTO + Security Team

---

## Rotation Events

```toml
[[rotations]]
date = "2026-02-21"
event_id = "rot-20260221-001"
secret_name = "SUPABASE_SERVICE_ROLE_KEY"
secret_category = "database"
reason = "Scheduled quarterly rotation"
rotation_interval = "quarterly"
owner = "platform-team"
status = "success"
verified_by = "alice@slurpy.com"
verification_steps_completed = [
  "Supabase UI key rotation initiated",
  "GitHub Actions secrets updated",
  "Environment configs updated",
  "Connectivity test passed",
  "Chat endpoint smoke test passed",
  "Sentry monitored for 30 mins (no errors)",
  "Old key deactivated after 24-hour overlap"
]
affected_services = ["supabase-client", "api-middleware", "background-jobs"]
notes = "Uneventful rotation, all services healthy. Next rotation: 2026-05-21"
archive_location = "1Password vault: Slurpy Secrets (Prod)"

[[rotations]]
date = "2026-02-21"
event_id = "rot-20260221-002"
secret_name = "STRIPE_SECRET_KEY"
secret_category = "payment-gateway"
reason = "Scheduled annual rotation"
rotation_interval = "annually"
owner = "product-team"
status = "success"
verified_by = "bob@slurpy.com"
verification_steps_completed = [
  "Stripe Dashboard API Key rotated",
  "GitHub Actions secret updated",
  "Environment deployed",
  "Test charge processed successfully",
  "Webhook delivery log checked (no failures)"
]
affected_services = ["stripe-api-client", "webhook-listener"]
notes = "Test transaction flowed through successfully. Next rotation: 2027-02-21"
archive_location = "1Password vault: Slurpy Secrets (Prod)"
```

---

## Key Rotation Schedule (Active)

| Secret | Owner | Last Rotated | Next Due | Status |
|---|---|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | platform-team | 2026-02-21 | 2026-05-21 | ✓ Active |
| STRIPE_SECRET_KEY | product-team | 2026-02-21 | 2027-02-21 | ✓ Active |
| QDRANT_API_KEY | platform-team | 2026-02-01 | 2027-02-01 | ✓ Active |
| DATABASE_URL (prod) | platform-team | 2026-02-21 | 2026-08-21 | ✓ Active |
| DATABASE_URL (staging) | platform-team | 2026-02-21 | 2026-08-21 | ✓ Active |
| OPENAI_API_KEY | backend-team | 2026-01-15 | 2027-01-15 | ✓ Active |
| GitHub Actions Token | devops-team | 2026-02-01 | 2026-05-01 | ✓ Active |

---

## Incident Log

Document any unplanned rotations or security events:

```toml
[[incidents]]
date = "2026-02-XX"
incident_id = "sec-20260220-001"
title = "Suspected secret exposure in GitHub logs"
secret_affected = "OPENAI_API_KEY"
severity = "high"
action_taken = "Emergency rotation"
detected_by = "security-scan@alerts.slurpy.com"
rotation_timestamp = "2026-02-XX 14:30 UTC"
audit_findings = "Key found in 2 commits; commits identified and analyzed for unauthorized API usage. No fraudulent charges detected. Likely false positive from test data."
follow_up = "Added secret scan to pre-commit hooks to prevent recurrence"
status = "resolved"
```

---

## Compliance Checklist

- [ ] All rotations logged with verification evidence
- [ ] No secret stored in plaintext in this document (only references to vault)
- [ ] Quarterly review completed by CTO + Security
- [ ] Rotation schedule maintained up-to-date
- [ ] Emergency procedures tested annually

---

## Quick Links

- **Key Rotation Runbook**: [KEY_ROTATION_RUNBOOK.md](KEY_ROTATION_RUNBOOK.md)
- **Secrets Vault**: 1Password (Slurpy Secrets (Prod))
- **Pre-Commit Hook**: `.pre-commit-config.yaml`
- **Secret Scan CI Gate**: `.github/workflows/ci-enforcement.yml` (security-checks job)

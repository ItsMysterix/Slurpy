# Key Rotation & Secrets Management Runbook

## Overview

This runbook defines the process for rotating cryptographic keys, API credentials, and database credentials across Slurpy's infrastructure. The goal is to minimize exposure window and maintain an auditable trail.

## Rotation Schedule

| Secret Type | Rotation Frequency | Priority |
|---|---|---|
| Supabase service-role key | Quarterly or after personnel change | Critical |
| Stripe API keys | Annually or on suspected compromise | High |
| OpenAI API keys | Annually or on suspected compromise | High |
| Qdrant API keys | Annually or on suspected compromise | High |
| Database passwords (prod/staging) | Every 6 months or on incident | Critical |
| JWT signing keys | On compromise only (or every 2 years) | Critical |
| GitHub Actions secrets | Quarterly | High |
| Vercel deployment tokens | Quarterly | High |

## Pre-Rotation Checklist

Before rotating any secret:

- [ ] **Audit Trail**: Log the reason (scheduled, compromise, personnel change)
- [ ] **Notifications**: Inform on-call team + relevant service owners
- [ ] **Backup**: Document the old secret in a secure, separate location (encrypted vault or hardware key)
- [ ] **Window**: Schedule outside peak traffic hours (e.g., Tuesday 2–4 PM UTC)
- [ ] **Validation**: Prepare verification script to confirm new secret works
- [ ] **Rollback Plan**: Document how to revert to old secret if new one fails

## Rotation Procedures

### 1. Supabase Service-Role Key (Critical)

**When**: Quarterly or if suspected compromised

**Steps**:

1. **Generate new key**:
   - Go to Supabase project settings → API Keys
   - Rotate service_role key (Supabase UI provides this)
   - Supabase will provide both old and new keys for a 24-hour overlap window

2. **Update GitHub Actions**:
   ```bash
   # In Settings → Secrets & Variables → Actions
   SUPABASE_SERVICE_ROLE_KEY = <new-key>
   ```

3. **Update environment configs**:
   - `.env.local`: `SUPABASE_SERVICE_ROLE_KEY=<new-key>`
   - `.env.production`: Request infrastructure team to update
   - Vercel deployment: Project Settings → Environment Variables

4. **Verify connectivity**:
   ```bash
   curl -X GET https://<project>.supabase.co/rest/v1/ \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
   # Expected: 200 OK with schema info
   ```

5. **Smoke test chat endpoint**:
   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H "Authorization: Bearer <valid-user-token>" \
     -H "Content-Type: application/json" \
     -d '{"message":"Hello"}'
   # Expected: 200, response starts streaming
   ```

6. **Monitor for errors**:
   - Watch Sentry / Vercel logs for next 30 mins
   - Check database connection pool health

7. **Deactivate old key**:
   - After 24-hour overlap window, deactivate old service_role key in Supabase UI

8. **Document**:
   ```markdown
   - Date: 2026-02-21
   - Secret: SUPABASE_SERVICE_ROLE_KEY
   - Reason: Scheduled quarterly rotation
   - Status: ✓ Rotated successfully
   - Verified: Chat endpoint tested, no errors observed
   ```

### 2. Stripe API Keys (High)

**When**: Annually or on compromise

**Steps**:

1. **Generate new key**:
   - Go to Stripe Dashboard → Settings → API Keys
   - Rotate Restricted API Key (live mode)
   - Note both old and new keys

2. **Update GitHub Actions secrets**:
   ```bash
   STRIPE_SECRET_KEY = <new-key>
   ```

3. **Update app environment**:
   - `.env.production`: Deploy new key
   - Restart any Node processes (`pnpm build && pnpm start`)

4. **Verify with test charge**:
   ```bash
   # Use Stripe CLI in test mode
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   
   # Test charge (test card: 4242 4242 4242 4242, any future date, any CVC)
   # Callback on /api/webhooks/stripe should succeed
   ```

5. **Monitor webhook delivery**:
   - Check Stripe Dashboard → Logs for successful webhook calls
   - Watch app logs for 10 mins

6. **Deactivate old key**:
   - Stripe Dashboard → Settings → API Keys → Deactivate old key

### 3. Database Passwords (Prod/Staging) (Critical)

**When**: Every 6 months or on incident

**Steps**:

1. **Generate new password**:
   - Use strong random generator: `openssl rand -base64 32`
   - Store securely in a password manager (1Password, LastPass, etc.)

2. **Update database**:
   ```sql
   -- On prod Supabase database (via CLI or web console)
   ALTER USER <prod_user> WITH PASSWORD '<new-password>';
   ```

3. **Update connection strings**:
   - Supabase: Settings → Database → Connection Strings → Update
   - GitHub Actions: `DATABASE_URL = postgres://...:<new-pass>@...`
   - Vercel: Environment Variables → `DATABASE_URL`
   - Local dev: Update `.env.local` → `DATABASE_URL`

4. **Verify connectivity** (per service):
   ```bash
   # Node.js via Prisma
   pnpm exec prisma db execute --stdin < <(echo "SELECT 1")
   
   # Python backend
   python -c "import psycopg; psycopg.connect('$(echo $DATABASE_URL)').close(); print('✓ connected')"
   ```

5. **Stagger rollout** (if multi-region):
   - Update staging first → test 30 mins → green light to prod
   - In prod, update connection strings in stages (app → API → background jobs)

6. **Monitor for dropped connections**:
   - Watch error logs for connection pool exhaustion
   - Verify no authentication failures

7. **Document & archive**:
   ```markdown
   - Date: 2026-02-21
   - Secret: Prod DB password
   - Reason: Scheduled 6-month rotation
   - Old password encrypted and archived (vault ID: xyz123)
   - Status: ✓ Applied to prod, staging, and app configs
   - Verified: All service tests passed
   ```

### 4. JWT Signing Keys (Critical)

**When**: On compromise only, or every 2 years

**Steps**:

1. **Generate new key pair** (if RSA/EdDSA):
   ```bash
   openssl genpkey -algorithm Ed25519 -out private.key
   openssl pkey -in private.key -pubout -out public.key
   ```

2. **Update signing service**:
   - Auth service: Point to new private key
   - Verification: Point to new public key

3. **Token migration strategy**:
   - **Option A (Hard cutover)**: Invalidate all old tokens, users re-login
   - **Option B (Dual-verify)**: Accept both old and new keys for 7 days, then cut over
   - Choose based on business impact

4. **Verify JWT parsing**:
   ```bash
   # Generate test token with new key
   # Decode and verify signature with public key
   # Confirm claims are present (aud, sub, iat, exp)
   ```

5. **Update all JWT references**:
   - Backend JWT middleware: `app/api/middleware.ts`
   - Frontend auth guards: `lib/auth-hooks.ts`
   - Docs: Update any hardcoded examples

## Post-Rotation Checklist

After every rotation:

- [ ] **Verify**: All services can authenticate with new secret
- [ ] **Monitor**: Watch logs and error tracking (Sentry) for 24 hours
- [ ] **Communicate**: Notify team that rotation is complete
- [ ] **Archive**: Store old secret securely (encrypted, hardware vault, or 1Password)
- [ ] **Document**: Log date, secret name, reason, status, and verification steps
- [ ] **Clean up**: Remove any old secrets from local `.env` files (commit `git rm -f .env.local`)

## Emergency Rotation (On Compromise)

If a secret is suspected compromised:

1. **Immediate**: Rotate the suspect secret within 1 hour
2. **Audit**: Check logs for unauthorized access (past 7 days)
3. **Notify**: Alert security team + service owners
4. **Verify**: Confirm no data theft (check for export/download patterns in logs)
5. **Post-mortem**: After 24 hours, document root cause and prevention measures

## Secrets Inventory

Maintain a current list of all active secrets (encrypted in vault):

| Secret Name | Owner | Last Rotated | Next Rotation | Notes |
|---|---|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | Platform | 2026-02-21 | 2026-05-21 | Quarterly |
| STRIPE_SECRET_KEY | Product | 2026-01-15 | 2027-01-15 | Annually |
| QDRANT_API_KEY | Platform | 2026-02-01 | 2027-02-01 | Annually |
| DATABASE_URL (prod) | Platform | 2026-02-21 | 2026-08-21 | 6-monthly |
| DATABASE_URL (staging) | Platform | 2026-02-21 | 2026-08-21 | 6-monthly |

**Storage**: All secrets encrypted in 1Password / LastPass / Vault under "Slurpy Secrets (Prod)"

## Reporting & Audit

All rotations logged in:
- **Location**: `docs/SECRET_ROTATION_LOG.md` (commitment log)
- **Format**: TOML or CSV with date, secret name, reason, owner, status
- **Review**: Quarterly by CTO + Security team

Example log entry:

```toml
[[rotations]]
date = "2026-02-21"
secret = "SUPABASE_SERVICE_ROLE_KEY"
reason = "Scheduled quarterly rotation"
owner = "platform-team"
status = "success"
verified_by = "alice@slurpy.com"
notes = "Overlap window respected, no service interruption"
```

## Prevention Best Practices

1. **Never commit secrets** to Git (use `.gitignore`, pre-commit hooks)
2. **Use environment variables** for all credentials
3. **Scope secrets tightly** (e.g., Stripe Restricted API Key, not full account key)
4. **Rotate on personnel change** (departing team members)
5. **Audit secret usage** (GitHub → Logs → Filter by secret name)
6. **Auto-expire secrets** where possible (e.g., Stripe one-time tokens)

## Questions?

- **Lost or forgotten old secret?** Check encrypted vault or contact CTO
- **Rotation failed?** Rollback to old secret, investigate, then retry with new window
- **Emergency access needed?** Contact on-call security team (PagerDuty)

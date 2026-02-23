# Scripts Directory

All development and deployment helper scripts.

## Development Scripts

### `start-dev.sh` - Start Development Environment
Starts the full local development stack:
```bash
bash scripts/start-dev.sh
```

Spins up:
- Next.js frontend (http://localhost:3000)
- FastAPI backend (if not already running)
- Database connection to local/staging Supabase

### `local-dev.sh` - Local Development Setup
Initially set up local development environment:
```bash
bash scripts/local-dev.sh
```

Installs dependencies, sets up Python venv, creates local `.env` files.

## Deployment Scripts

### `deploy-and-connect.sh` - Deploy & Connect
Deploys application and establishes connection to deployment:
```bash
bash scripts/deploy-and-connect.sh
```

Steps:
1. Build application
2. Push to Git (if changes staged)
3. Deploy to Railway/Vercel
4. Monitor deployment status

## Quality Checks (CI/CD)

### `check-migration-lint.sh` - Lint Database Migrations
Validates all database migrations for policy compliance:
```bash
bash scripts/check-migration-lint.sh
```

Checks:
- ✅ Naming convention `YYYYMMDD_*.sql`
- ✅ Transaction wrapping (BEGIN/COMMIT)
- ✅ Idempotency (IF NOT EXISTS, DROP IF EXISTS)
- ✅ No hardcoded secrets

**Used in:** `.github/workflows/ci-enforcement.yml` (migration-lint job)

### `check-migration-policy.sh` - Validate Migration Policy
Ensures migrations follow organizational standards:
```bash
bash scripts/check-migration-policy.sh
```

### `check-no-hardcoded-secrets.sh` - Scan for Secrets
Detects hardcoded API keys, tokens, passwords:
```bash
bash scripts/check-no-hardcoded-secrets.sh
```

Patterns scanned:
- AWS credentials
- API keys
- Bearer tokens  
- Private keys

### `run-canary-safety-checks.sh` - Pre-Deployment Validation
Runs all safety checks before deploying crisis detection changes:
```bash
bash scripts/run-canary-safety-checks.sh
```

Executes:
1. Crisis detection regression tests (`pytest backend/tests/test_safety_regression.py`)
2. Crisis routing validation
3. Migration linting
4. Secret scanning
5. Python syntax validation

**Used in:** `.github/workflows/ci-enforcement.yml` (canary-safety-checks job)

### `incident-response.sh` - Diagnostic Capture & Alerting
Triggered when health check fails; captures diagnostic data:
```bash
bash scripts/incident-response.sh
```

Collects:
- API health status
- Database connection status  
- Qdrant vector DB health
- OpenAI API latency
- Recent logs & errors
- Query performance (slow queries)

Routes alerts by component:
- `chat-api` failure → page ops
- `database` failure → page DBA
- `qdrant` failure → page vector team
- `openai` failure → page integrations
- Generic warnings → Slack

## Environment-Specific Usage

### Local Development
```bash
bash scripts/start-dev.sh
```

### Staging Deployment
```bash
export ENVIRONMENT=staging
bash scripts/deploy-and-connect.sh
```

### Production Deployment  
```bash
export ENVIRONMENT=production
bash scripts/deploy-and-connect.sh
# Requires manual approval in Railway/Vercel UI
```

## Integration with CI/CD

These scripts are automatically run by GitHub Actions:

| Script | Trigger | Job |
|--------|---------|-----|
| `check-migration-lint.sh` | PR to `main` | `migration-lint` |
| `check-no-hardcoded-secrets.sh` | Every commit | `security-checks` |
| `check-migration-policy.sh` | PR to `main` | `quality-gates` |
| `run-canary-safety-checks.sh` | PR title contains `[safety]` | `canary-safety-checks` |
| `incident-response.sh` | Health check fails (manual trigger) | On-call runbook |

## Debugging Failed Scripts

### Enable verbose output:
```bash
bash -x scripts/script-name.sh
```

### Check script exit codes:
```bash
bash scripts/script-name.sh
echo $?  # 0 = success, 1+ = failure
```

### View logs:
```bash
tail -f logs/deployment.log
tail -f logs/health-check.log
```

## Adding New Scripts

1. Create new file in `scripts/`
2. Make executable: `chmod +x scripts/new-script.sh`
3. Add shebang: `#!/bin/bash`
4. Document in this README
5. Update GitHub Actions workflow if part of CI/CD
6. Add to `.gitignore` if contains secrets (use `.env` files instead)

## Common Issues

**Script not found:** Make sure you're in root directory:
```bash
cd /path/to/Slurpy
bash scripts/start-dev.sh  # ✓ correct
```

**Permission denied:** Make executable:
```bash
chmod +x scripts/start-dev.sh
```

**Environment variables not loaded:** Source manually:
```bash
source config/.env.vercel.local
bash scripts/deploy-and-connect.sh
```

---

**Last updated:** 2026-02-21

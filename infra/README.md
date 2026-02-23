# Infrastructure Directory

All deployment, containerization, and CI/CD configuration.

## Structure

```
infra/
├── docker/          # Container configuration
├── ci/              # CI/CD deployment config  
└── nixpacks/        # Nix package management
```

## `/docker` - Containerization

### Docker Files

- **`Dockerfile`** - Main application Docker image
  - Builds production Docker image
  - Multi-stage build for optimization
  - Used by Railway deployments

- **`docker-compose.yml`** - Production compose setup
  - Orchestrates app + database + dependencies
  - Used on production servers

- **`docker-compose.dev.yml`** - Development environment
  - Backend + frontend + local Supabase
  - Run: `docker-compose -f infra/docker/docker-compose.dev.yml up`

- **`docker-compose.local.yml`** - Local development (lightweight)
  - Minimal setup for fast iteration
  - Used with `scripts/local-dev.sh`

- **`docker-compose.test-auth.yml`** - Auth testing environment
  - Supabase with test user data pre-loaded
  - Used for Playwright auth tests

### Usage

```bash
# Development environment
docker-compose -f infra/docker/docker-compose.dev.yml up

# Local/lightweight  
docker-compose -f infra/docker/docker-compose.local.yml up

# Build production image
docker build -f infra/docker/Dockerfile -t slurpy:latest .

# Run production image locally
docker run -p 3000:3000 slurpy:latest
```

## `/ci` - CI/CD Configuration

### Deployment Platforms

- **`railway.json`** - Railway deployment configuration
  - Specifies build command, start command
  - Sets environment variables for Railway
  - Configures deployment strategies
  - **Docs:** https://railway.app/docs

- **`vercel.json`** - Vercel deployment configuration  
  - Edge configuration, redirects, rewrites
  - Preview deployment settings
  - Cron job scheduling
  - **Docs:** https://vercel.com/docs/projects/project-configuration

### Monitoring & Automation

- **`railway-monitor.sh`** - Monitor Railway deployments
  - Polls deployment status
  - Alerts on failures
  - Manages rollbacks
  - Triggered by cron job

### Deployment Workflow

**Option 1: Railway (Primary)**
1. Push to Git (any branch)
2. Railway webhook triggers  
3. Runs build command from `railway.json`
4. Spins up production containers
5. Route 100% traffic to new version
6. Run health checks

**Option 2: Vercel (Staging)**
1. Push to Git
2. Vercel webhook triggers
3. Runs build from `next.config.mjs`
4. Deploys to preview URL
5. Pull request gets deployment link

### Configuration

**Environment-specific settings:**
- Production: `railway.json` (use Railway secrets)
- Staging: `vercel.json` (use Vercel environment)
- Local: `.env` files in `/config`

**Secrets Management:**
```yaml
# In Railway dashboard:
- DATABASE_URL: postgres://...
- OPENAI_API_KEY: sk-...
- STRIPE_SECRET_KEY: sk_live_...

# In Vercel dashboard:
- Same secrets but prefixed for preview/prod
```

## `/nixpacks` - Nix Package Management

- **`nixpacks.toml`** - Nix package dependencies
  - Declares system packages needed
  - Alternative to Dockerfile/APK install
  - Used by Railway autodeploy without Dockerfile
  - **Docs:** https://nixpacks.com/docs

### Usage

Railway can use nixpacks instead of Dockerfile:
```bash
nixpacks build .  # Generate Dockerfile from nixpacks.toml
```

## Deployment Runbook

### Pre-Deployment Checklist

- [ ] All tests passing: `npm run test`
- [ ] No hardcoded secrets: `bash scripts/check-no-hardcoded-secrets.sh`
- [ ] Migrations validated: `bash scripts/check-migration-lint.sh`
- [ ] Safety checks pass: `bash scripts/run-canary-safety-checks.sh`
- [ ] Staging deployed and verified
- [ ] No open critical incidents

### Deploy to Production

#### Via Railway (Recommended)
```bash
git push origin main
# Railway auto-deploys based on `railway.json`
# Monitor: `bash infra/ci/railway-monitor.sh`
```

#### Manual Deploy
```bash
cd infra/docker
docker build -t slurpy:prod -f Dockerfile ..
docker push <registry>/slurpy:prod
# Update production deployment to use new image
```

### Post-Deployment

```bash
# Verify health
curl https://api.slurpy.life/api/health

# Check logs
railway logs  # or Vercel logs

# Monitor errors  
# Sentry dashboard: sentry.io/organizations/slurpy

# Run incident response diagnostics (if issues)
bash scripts/incident-response.sh
```

## Troubleshooting

### Build Failures

**Docker build fails:**
```bash
docker build -f infra/docker/Dockerfile --progress=plain .
# Check output for exact error
```

**Vercel build fails:**
- Check Vercel dashboard build logs
- Verify `next.config.mjs` is valid
- Check environment variables are set

**Railway build fails:**
- Check Railway dashboard build output
- Verify `railway.json` syntax
- Ensure all dependencies in `package.json`

### Deployment Issues

**Service won't start:**
```bash
docker run -it --entrypoint sh infra/docker/Dockerfile
# Debug inside container
```

**Database connection fails:**
- Check DATABASE_URL in secrets
- Verify network access (firewall rules)
- Test connection: `psql $DATABASE_URL`

**Memory/CPU limits:**
- Check Railway deployment limits
- Scale vertically in dashboard
- Optimize application code

## Cost Optimization

- **Railway:** $5 + usage (credits included)
- **Vercel:** Free hobby tier, $20+/month pro
- **Supabase DB:** Free tier (500MB), $25/month+ pro

Use staging (Vercel free) for testing, production (Railway) for customers.

## References

- Railway Docs: https://railway.app/docs
- Vercel Docs: https://vercel.com/docs
- Docker Docs: https://docs.docker.com
- nixpacks: https://nixpacks.com/docs

---

**Last updated:** 2026-02-21

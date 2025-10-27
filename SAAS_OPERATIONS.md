# SaaS Operations Guide - Slurpy

> **Your Production Checklist**: Essential knowledge for running Slurpy as a SaaS platform

## 🎯 Overview

This guide covers everything you need to know as a SaaS owner to run Slurpy successfully in production. It's organized by priority and includes actionable steps.

---

## 🚨 Critical Production Requirements (Do These First)

### 1. **Monitoring & Alerting** ⚠️ CRITICAL

**Why**: You need to know when your service is down BEFORE your users tell you.

#### Set Up Uptime Monitoring (15 minutes)
- **Tools**: [UptimeRobot](https://uptimerobot.com) (Free), [Pingdom](https://pingdom.com), or [Better Uptime](https://betteruptime.com)
- **What to monitor**:
  ```
  https://your-domain.com/api/health         (Frontend health)
  https://api.your-domain.com/health/healthz (Backend health)
  https://mcp.your-domain.com/healthz        (MCP health)
  ```
- **Alert channels**: Email + SMS for critical alerts
- **Check frequency**: Every 5 minutes minimum

#### Application Performance Monitoring (APM)
Choose ONE of these (all have free tiers):

**Option A: Sentry (Recommended - Already Integrated)**
```bash
# You already have Sentry installed!
# Just set these environment variables:

# In Sentry dashboard, create a new project
SENTRY_DSN=https://your-key@sentry.io/your-project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of transactions
```

**What Sentry gives you**:
- ✅ Error tracking with stack traces
- ✅ Performance monitoring
- ✅ User session replay
- ✅ Release tracking
- ✅ Email/Slack alerts on errors

**Option B: Datadog** (More comprehensive but complex)
- Full-stack observability
- Infrastructure monitoring
- Log aggregation
- APM traces

**Option C: New Relic** (Good middle ground)
- Application performance
- Infrastructure monitoring
- Alerts and dashboards

#### Logging Strategy

**Current Setup**: Your app uses `loguru` in Python and `console.log` in Next.js

**Production Best Practices**:

1. **Centralized Logging** (Choose one):
   - **Fly.io Logs** (built-in if using Fly.io)
   - **Papertrail** (Simple, free tier)
   - **Logtail** (Better search, visualization)
   - **Datadog Logs** (if using Datadog APM)

2. **Log Levels to Monitor**:
   ```python
   # Critical - Immediate action required
   logger.critical("Database connection lost")
   
   # Error - Something failed but app still running
   logger.error("Payment processing failed for user {user_id}")
   
   # Warning - Potential issue
   logger.warning("API rate limit approaching")
   
   # Info - Important business events
   logger.info("New user signup: {user_id}")
   ```

3. **Set Up Log Alerts**:
   - Any `CRITICAL` or `ERROR` in production → Immediate alert
   - High error rate (>10 errors/min) → Alert
   - Failed health checks → Immediate alert

---

### 2. **Security Hardening** 🔒 CRITICAL

#### API Security Checklist

- [x] **HTTPS Only** - Configured in Fly.io
- [ ] **Rate Limiting** - NEEDS IMPLEMENTATION
- [x] **CORS Policy** - Currently set to `allow_origins=["*"]` ⚠️ FIX THIS
- [ ] **API Keys Rotation** - Set up schedule
- [ ] **Secrets Management** - Use environment variables (not hardcoded)
- [ ] **Input Validation** - Using Pydantic (✅ Good!)
- [ ] **SQL Injection Protection** - Using Supabase ORM (✅ Good!)
- [ ] **DDoS Protection** - Add Cloudflare (see below)

#### IMMEDIATE SECURITY FIXES NEEDED

**Fix #1: Restrict CORS (High Priority)**

Your current backend allows ALL origins:
```python
# ❌ DANGEROUS - Current code
allow_origins=["*"]
```

Update to:
```python
# ✅ SECURE - Only allow your domains
allow_origins=[
    "https://your-domain.com",
    "https://www.your-domain.com",
    "http://localhost:3000",  # For local development only
]
```

**Fix #2: Add Rate Limiting**

Add to your FastAPI backend:
```python
# Install: pip install slowapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Then on routes:
@app.post("/api/chat")
@limiter.limit("20/minute")  # 20 requests per minute per IP
async def chat_endpoint(request: Request):
    ...
```

**Fix #3: Add Security Headers**

Add to Next.js `next.config.mjs`:
```javascript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  }
]
```

#### Add Cloudflare (Free Tier)

**Benefits**:
- ✅ DDoS protection
- ✅ CDN for static assets
- ✅ SSL/TLS
- ✅ Web Application Firewall (WAF)
- ✅ Analytics

**Setup** (30 minutes):
1. Sign up at [cloudflare.com](https://cloudflare.com)
2. Add your domain
3. Update nameservers at your domain registrar
4. Enable "Proxy" (orange cloud) for your domains
5. Set up page rules for caching

---

### 3. **Backup & Disaster Recovery** 💾 CRITICAL

#### What to Backup

1. **Supabase Database** (Your user data!)
   ```bash
   # Automated daily backups (Supabase Pro plan)
   # Or manual backups:
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   
   # Store in S3 or similar
   ```

2. **Qdrant Vector Database**
   ```bash
   # Backup qdrant snapshots
   curl -X POST 'http://localhost:6333/collections/{collection}/snapshots'
   
   # Download snapshot
   curl 'http://localhost:6333/collections/{collection}/snapshots/{snapshot_name}' \
     --output snapshot.zip
   ```

3. **User-Generated Content**
   - If storing files: Use S3 (or Supabase Storage) with versioning enabled
   - If using a third-party provider for profile assets: follow their backup guidance

#### Backup Schedule

| Data Type | Frequency | Retention | Priority |
|-----------|-----------|-----------|----------|
| Database | Daily | 30 days | CRITICAL |
| Vector DB | Weekly | 4 weeks | High |
| Application Logs | Daily | 7 days | Medium |
| Code (Git) | On every commit | Forever | CRITICAL |

#### Disaster Recovery Plan

**If Database Goes Down**:
1. Check Supabase status page
2. Restore from latest backup (< 24h old)
3. Expected downtime: 5-30 minutes
4. Communication: Post status on Twitter/Status page

**If Entire Service Goes Down**:
1. Check Fly.io dashboard
2. Review application logs
3. Roll back to previous deployment if needed
4. Expected recovery: 10-60 minutes

---

## 📊 Metrics to Monitor Daily

### Health Metrics (Check Every Morning)

**Application Health**:
- [ ] All 3 services running? (Frontend, Backend, MCP)
- [ ] Response times < 500ms?
- [ ] Error rate < 1%?
- [ ] SSL certificates valid? (auto-renewed by Fly.io)

**Business Metrics**:
- [ ] New user signups (track in Supabase Auth dashboard)
- [ ] Active users today
- [ ] API usage / quota
- [ ] Stripe revenue (if monetizing)

**System Metrics**:
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%
- [ ] Disk usage < 80%
- [ ] Database connections available

### Set Up Dashboards

**Option A: Grafana + Prometheus** (Free, self-hosted)
- Visualize all metrics in one place
- Custom alerts
- Requires setup time

**Option B: Fly.io Dashboard** (Built-in)
- Basic metrics for each service
- Response times, error rates
- Resource usage

**Option C: Datadog Dashboards** (Paid but comprehensive)
- Pre-built dashboards
- ML-powered anomaly detection
- Integrated logs + metrics + traces

---

## 💰 Cost Management

### Current Monthly Costs (Estimated)

| Service | Free Tier | Paid Plan | Your Likely Cost |
|---------|-----------|-----------|------------------|
| **Fly.io** | 3 VMs + 160GB bandwidth | $0 | $0-20/mo |
| **Supabase** | 500MB DB, 1GB bandwidth | Unlimited | $0-25/mo |
| **Supabase Auth** | Generous free tier | Pro | $0-25/mo |
| **Sentry** | 5k events/mo | 50k events | $0-26/mo |
| **OpenAI** | Pay per use | - | $10-100/mo* |
| **Stripe** | Pay per transaction | - | 2.9% + $0.30 |
| **Domain** | - | - | $12/year |
| **Total** | | | **$10-50/mo** |

*Depends on chat usage

### Cost Optimization Tips

1. **Set OpenAI usage limits**:
   ```python
   # In your OpenAI client config
   max_tokens=500  # Limit response length
   temperature=0.7  # Balance quality/cost
   ```

2. **Cache expensive operations**:
   - Cache embedding results in Qdrant
   - Use Redis for session storage
   - CDN for static assets (Cloudflare)

3. **Monitor Fly.io auto-scaling**:
   ```toml
   # fly.toml - Set limits
   [[services]]
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 1
     max_machines_running = 3  # Prevent runaway costs
   ```

4. **Set up billing alerts**:
   - Fly.io: Email alerts at $50, $100
   - OpenAI: Usage alerts in dashboard
   - Supabase: Database size alerts

---

## 🔐 Secrets & Environment Variables

### Environment Management

**Never commit secrets to Git!** Your `.env` files should be in `.gitignore`.

#### Production Secrets Checklist

```bash
# Frontend (.env.production)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx  # For source maps

# Backend (.env.backend)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx  # Service role, not anon!
OPENAI_API_KEY=sk-xxx
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=xxx  # If using Qdrant Cloud
SENTRY_DSN=https://xxx@sentry.io/xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# MCP Server
OPENAI_API_KEY=sk-xxx
QDRANT_URL=http://qdrant:6333
SENTRY_DSN=https://xxx@sentry.io/xxx
```

#### Secrets Rotation Schedule

| Secret | Rotate Frequency | How |
|--------|------------------|-----|
| OpenAI API Key | Every 90 days | Generate new in OpenAI dashboard |
| Stripe Keys | On security incident | Regenerate in Stripe |
| Supabase Keys | Every 90 days | Regenerate in Supabase |
| Supabase Keys | Every 90 days | Regenerate in Supabase |
| Database Passwords | Every 90 days | Update in Supabase |

#### Using Fly.io Secrets

```bash
# Set secrets (never visible in fly.toml)
fly secrets set OPENAI_API_KEY=sk-xxx --app slurpy-backend
# Set Supabase keys for the backend and frontend as needed
fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJxxx --app slurpy-backend
fly secrets set NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co --app slurpy-frontend
fly secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx --app slurpy-frontend

# List secret names (not values)
fly secrets list

# Remove old secrets
fly secrets unset OLD_SECRET_NAME
```

---

## 🚀 Deployment Best Practices

### Pre-Deployment Checklist

- [ ] All tests passing locally?
- [ ] Database migrations applied?
- [ ] Environment variables set in Fly.io?
- [ ] Health checks returning 200?
- [ ] Sentry release tagged?
- [ ] Changelog updated?
- [ ] Stakeholders notified of deployment?

### Zero-Downtime Deployment

Fly.io handles this automatically with:
- Blue-green deployments
- Health check validation before switching
- Automatic rollback on failed health checks

```bash
# Deploy with health checks
fly deploy --strategy rolling

# Monitor deployment
fly status

# Rollback if needed
fly releases
fly releases rollback <version>
```

### Deployment Monitoring (First 30 Minutes)

After each deployment:
1. **Check error rates** (Should not spike)
2. **Check response times** (Should stay similar)
3. **Check logs** for new errors
4. **Test critical user flows**:
   - User signup
   - User login
   - Main feature usage (chat)
   - Payment flow (if applicable)

---

## 🐛 Incident Response

### When Something Goes Wrong

#### Level 1: Minor Issue (Non-Critical)
**Examples**: Slow response on one endpoint, minor UI bug

**Response**:
1. Create GitHub issue
2. Add to sprint backlog
3. Fix in next release
4. Monitor for escalation

#### Level 2: Degraded Performance
**Examples**: High response times, intermittent errors

**Response** (Within 1 hour):
1. ✅ Acknowledge issue publicly (status page/Twitter)
2. ✅ Check monitoring dashboards
3. ✅ Review recent deployments
4. ✅ Scale up resources if needed
5. ✅ Roll back if caused by recent deploy
6. ✅ Post-mortem after resolution

#### Level 3: Complete Outage
**Examples**: Site down, database unavailable, auth broken

**Response** (Immediately):
1. ⚠️ Post status update: "We're investigating an outage"
2. ⚠️ Check Fly.io/Supabase status pages
3. ⚠️ Review error logs in Sentry
4. ⚠️ Roll back to last known good deploy
5. ⚠️ If rollback fails, restore from backup
6. ⚠️ Update status every 15 minutes
7. ⚠️ Full post-mortem + prevent recurrence

### Communication Templates

**Status Page Update (Outage)**:
```
🔴 We're currently experiencing an outage affecting [service].
Our team is investigating. Updates every 15 minutes.
Last updated: [timestamp]
```

**Resolution Update**:
```
✅ The issue has been resolved. All services are operational.
Cause: [brief explanation]
Full post-mortem: [link]
We apologize for the disruption.
```

---

## 📈 Scaling Considerations

### When to Scale

**Frontend**:
- Response time > 1s consistently
- CPU > 80% for 10+ minutes
- Memory > 80%

**Backend**:
- API response time > 500ms
- Queue depth increasing
- Database connection pool exhausted

**Database**:
- Query time > 100ms
- Connection pool > 80% used
- Disk I/O saturated

### Horizontal vs Vertical Scaling

**Horizontal** (Add more machines):
```bash
# Fly.io auto-scaling
fly scale count 3  # Run 3 instances

# Or in fly.toml
[http_service]
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  max_machines_running = 5
```

**Vertical** (Bigger machines):
```bash
# Fly.io machine size
fly scale vm shared-cpu-2x --app slurpy-backend
```

### Caching Strategy

**Redis for Sessions** (Recommended when you have >1000 active users):
```python
# Install redis
pip install redis

# Cache expensive computations
import redis
r = redis.Redis(host='your-redis-host', port=6379)

# Cache embeddings
def get_embedding(text):
    cache_key = f"emb:{hash(text)}"
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)
    
    embedding = compute_embedding(text)
    r.setex(cache_key, 86400, json.dumps(embedding))  # 24h TTL
    return embedding
```

**CDN for Static Assets**:
- Already handled by Next.js if deployed to Vercel
- Or use Cloudflare CDN

---

## 🧪 Testing in Production

### Feature Flags

Use for gradual rollouts:

```typescript
// Example with Supabase user metadata
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { data } = await supabase.auth.getUser();
const betaFeatures = (data.user?.user_metadata?.betaFeatures as string[]) || [];

if (betaFeatures.includes("new-chat-ui")) {
   // Show new UI
} else {
   // Show old UI
}
```

### A/B Testing

For conversion optimization:
- **Tool**: PostHog (open source, free tier)
- **Use cases**: 
  - Pricing page variations
  - Onboarding flow
  - Feature adoption

### Synthetic Monitoring

Simulate user journeys:
```bash
# Playwright for E2E monitoring
npm install -D @playwright/test

# Run in CI or cron job
npx playwright test --config=playwright.prod.config.ts
```

---

## 📋 Weekly Operations Checklist

### Monday Morning
- [ ] Review weekend error reports
- [ ] Check uptime percentage (target: 99.9%)
- [ ] Review user feedback/support tickets
- [ ] Check cost dashboard

### Wednesday
- [ ] Database backup verification
- [ ] Security scan (npm audit, pip audit)
- [ ] Review analytics (user growth, retention)

### Friday
- [ ] Deploy week's changes (low-traffic day)
- [ ] Update status page with week's improvements
- [ ] Review performance metrics
- [ ] Plan next week's priorities

### Monthly
- [ ] Review and rotate API keys (if scheduled)
- [ ] Update dependencies
- [ ] Backup audit (test restore process)
- [ ] Cost optimization review
- [ ] Security audit (check for CVEs)
- [ ] Review SLAs and SLOs

---

## 🆘 Emergency Contacts & Resources

### Service Status Pages

| Service | Status Page |
|---------|-------------|
| Fly.io | https://status.flyio.net/ |
| Supabase | https://status.supabase.com/ |
| — | — |
| Stripe | https://status.stripe.com/ |
| OpenAI | https://status.openai.com/ |

### Support Channels

- **Fly.io**: community.fly.io (usually <1h response)
- **Supabase**: Discord or support ticket
—
- **Stripe**: Email support (24h response)
- **OpenAI**: Help center or email

### Your Runbook Links

Create these:
- [ ] Deployment runbook (step-by-step deploy)
- [ ] Rollback runbook (how to revert)
- [ ] Database restore runbook
- [ ] Incident response playbook
- [ ] On-call rotation (if team grows)

---

## 🎓 Learning Resources

### SaaS Operations
- [SaaS Metrics 101](https://www.forentrepreneurs.com/saas-metrics-2/)
- [The SRE Book](https://sre.google/sre-book/table-of-contents/) (Google)
- [12 Factor App](https://12factor.net/)

### Security
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [API Security Checklist](https://github.com/shieldfy/API-Security-Checklist)

### Monitoring
- [Observability Guide](https://www.honeycomb.io/what-is-observability)
- [SLIs, SLOs, and SLAs](https://sre.google/sre-book/service-level-objectives/)

---

## 🎯 Next Steps (Priority Order)

1. **Week 1** (Must-do):
   - [ ] Set up Sentry with proper DSN
   - [ ] Configure uptime monitoring (UptimeRobot)
   - [ ] Fix CORS to restrict origins
   - [ ] Add rate limiting
   - [ ] Set up Fly.io secrets for all env vars

2. **Week 2** (Important):
   - [ ] Add security headers
   - [ ] Configure Cloudflare
   - [ ] Set up automated database backups
   - [ ] Create incident response doc
   - [ ] Add Redis caching

3. **Week 3** (Recommended):
   - [ ] Set up log aggregation (Papertrail)
   - [ ] Create monitoring dashboard
   - [ ] Implement feature flags
   - [ ] Write deployment runbook

4. **Ongoing**:
   - [ ] Weekly security audits
   - [ ] Monthly cost reviews
   - [ ] Quarterly disaster recovery drills

---

## 📞 Questions?

As you grow, you'll learn more. Start with the basics:
1. ✅ Monitor your service
2. ✅ Secure your API
3. ✅ Backup your data
4. ✅ Know when things break

Everything else can be added as you scale. Good luck! 🚀

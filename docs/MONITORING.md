# Monitoring & Observability Setup

This guide will help you set up comprehensive monitoring for your Slurpy SaaS platform.

## Quick Start (15 Minutes)

### 1. Set Up Sentry (Error Tracking)

You already have Sentry installed! Just configure it:

```bash
# 1. Sign up at https://sentry.io (free tier available)
# 2. Create a new project for each service:
#    - slurpy-frontend (Next.js)
#    - slurpy-backend (Python)
#    - slurpy-mcp (Python)

# 3. Set environment variables
fly secrets set SENTRY_DSN=https://your-key@sentry.io/your-project --app slurpy-frontend
fly secrets set SENTRY_DSN=https://your-key@sentry.io/your-project --app slurpy-backend
fly secrets set SENTRY_DSN=https://your-key@sentry.io/your-project --app slurpy-mcp
```

**Sentry Configuration**:
```javascript
// sentry.client.config.ts (Frontend)
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% when errors occur
});
```

### 2. Set Up Uptime Monitoring (5 Minutes)

**Option A: UptimeRobot (Recommended - Free)**

1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add monitors:
   - **Frontend Health**: `https://your-domain.com/api/health` (every 5 min)
   - **Backend Health**: `https://api.your-domain.com/health/healthz` (every 5 min)
   - **MCP Health**: `https://mcp.your-domain.com/healthz` (every 5 min)
3. Set up alerts:
   - Email: your-email@domain.com
   - SMS: your-phone-number (for critical)

**Option B: Better Uptime** (Nicer UI, also free tier)
- Same setup as UptimeRobot
- Built-in status page
- Incident management

### 3. Set Up Log Aggregation

**Option A: Fly.io Logs (Free, Built-in)**

```bash
# View live logs
fly logs -a slurpy-frontend
fly logs -a slurpy-backend
fly logs -a slurpy-mcp

# Search logs
fly logs -a slurpy-backend --search "ERROR"

# Export logs
fly logs -a slurpy-backend > backend-logs.txt
```

**Option B: Papertrail (Free Tier - 50MB/month)**

```bash
# 1. Sign up at https://papertrailapp.com
# 2. Get your log destination (logs.papertrailapp.com:XXXXX)

# 3. Update fly.toml for each app:
[logging]
  destination = "logs.papertrailapp.com:XXXXX"
  
# 4. Deploy
fly deploy
```

**Benefits**:
- Search across all services
- Alerts on error patterns
- 7-day retention
- Better than scrolling terminal logs

---

## Health Check Endpoints

### Current Health Endpoints

**Frontend** (`/api/health`):
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T12:00:00Z",
  "version": "0.1.0",
  "services": {
    "clerk": "connected",
    "supabase": "connected",
    "backend": "connected"
  }
}
```

**Backend** (`/health/healthz`):
```json
{
  "ok": true,
  "supabase": true,
  "qdrant": true,
  "timestamp": "2025-10-24T12:00:00Z"
}
```

**MCP** (`/healthz`):
```json
{
  "ok": true,
  "service": "slurpy-mcp"
}
```

### Enhance Health Checks

Add more detailed health checks to catch issues early:

```python
# backend/slurpy/interfaces/http/routers/health.py
from fastapi import APIRouter
import time
from datetime import datetime

router = APIRouter()

@router.get("/healthz")
async def health_check():
    start_time = time.time()
    
    checks = {
        "ok": True,
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Check Supabase
    try:
        # Quick query to verify connection
        result = await supabase.table("users").select("count").limit(1).execute()
        checks["services"]["supabase"] = "healthy"
    except Exception as e:
        checks["ok"] = False
        checks["services"]["supabase"] = f"unhealthy: {str(e)}"
    
    # Check Qdrant
    try:
        # Ping Qdrant
        response = await qdrant_client.get_collections()
        checks["services"]["qdrant"] = "healthy"
    except Exception as e:
        checks["ok"] = False
        checks["services"]["qdrant"] = f"unhealthy: {str(e)}"
    
    # Check OpenAI (optional - costs money)
    # Only check once per hour to avoid costs
    checks["services"]["openai"] = "not_checked"
    
    # Response time
    checks["response_time_ms"] = (time.time() - start_time) * 1000
    
    return checks

@router.get("/ready")
async def readiness_check():
    """Kubernetes-style readiness check"""
    # Check if service can accept traffic
    return {"ready": True}

@router.get("/live")
async def liveness_check():
    """Kubernetes-style liveness check"""
    # Simple check that service is running
    return {"alive": True}
```

---

## Metrics to Track

### Application Metrics

**Response Time**:
- Target: < 500ms (p95)
- Alert if: > 1000ms for 5 minutes

**Error Rate**:
- Target: < 1%
- Alert if: > 5% for 5 minutes

**Request Rate**:
- Monitor for unusual spikes (DDoS indicator)
- Track by endpoint

**User Metrics**:
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Signup conversion rate
- Churn rate

### Infrastructure Metrics

**CPU Usage**:
- Target: < 70% average
- Alert if: > 90% for 10 minutes

**Memory Usage**:
- Target: < 80%
- Alert if: > 90% for 5 minutes

**Disk Usage**:
- Target: < 80%
- Alert if: > 90%

**Network**:
- Bandwidth usage
- Request/response sizes

### Business Metrics

**Revenue (if monetized)**:
- MRR (Monthly Recurring Revenue)
- Churn rate
- Average Revenue Per User (ARPU)

**Engagement**:
- Chat messages per user
- Session duration
- Feature usage

---

## Setting Up Alerts

### Alert Priority Levels

**P0 - Critical (Immediate Response)**:
- Complete service outage
- Database down
- Authentication broken
- Payment processing broken

**P1 - High (Response within 1 hour)**:
- Elevated error rate (> 5%)
- Slow response times (> 2s)
- High memory usage (> 90%)

**P2 - Medium (Response within 24 hours)**:
- Warning-level errors
- Approaching resource limits
- Unusual traffic patterns

**P3 - Low (Review in weekly meeting)**:
- Deprecation warnings
- Non-critical feature issues
- Performance optimization opportunities

### Sample Alert Rules

**Sentry**:
```yaml
# Alert when error rate spikes
- name: High Error Rate
  condition: error_count > 10 in 5 minutes
  severity: high
  notify: email, slack

# Alert on new error types
- name: New Error
  condition: first_seen
  severity: medium
  notify: slack
```

**UptimeRobot**:
```
Monitor Type: HTTP(s)
URL: https://your-domain.com/api/health
Interval: 5 minutes
Alert when down for: 2 checks (10 minutes)
Alert contacts: Email + SMS
```

**Fly.io Resource Alerts**:
```bash
# Set up billing alerts
fly orgs update --max-spend 100  # Alert at $100/month
```

---

## Dashboards

### Create Your First Dashboard

**Using Grafana (Free, Self-Hosted)**:

1. **Install Grafana**:
```bash
# Using Docker
docker run -d -p 3001:3000 grafana/grafana
```

2. **Add Prometheus Data Source**:
- Set up Prometheus to scrape Fly.io metrics
- Configure datasource in Grafana

3. **Import Dashboard**:
- Use pre-built Next.js dashboard
- Customize for your metrics

**Using Datadog (Paid, but comprehensive)**:
- All-in-one solution
- APM + Logs + Metrics + Traces
- Pre-built dashboards
- ML-powered anomaly detection

### Essential Dashboard Panels

**Overview Dashboard**:
- [ ] Service Status (Up/Down)
- [ ] Request Rate (requests/min)
- [ ] Error Rate (%)
- [ ] Response Time (p50, p95, p99)
- [ ] Active Users
- [ ] CPU/Memory Usage

**Business Dashboard**:
- [ ] New Signups (today, week, month)
- [ ] Active Users (DAU, MAU)
- [ ] Revenue (if applicable)
- [ ] Feature Usage
- [ ] User Retention

---

## Performance Monitoring

### Frontend Performance

**Web Vitals** (Already tracked by Next.js):
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

```typescript
// pages/_app.tsx
import { useReportWebVitals } from 'next/web-vitals'

export default function MyApp({ Component, pageProps }) {
  useReportWebVitals((metric) => {
    // Send to analytics
    if (metric.value > threshold) {
      console.warn(`Poor ${metric.name}: ${metric.value}`)
    }
  })
  
  return <Component {...pageProps} />
}
```

**Bundle Size Monitoring**:
```bash
# Analyze bundle
npm run build
npx @next/bundle-analyzer

# Set size budgets in next.config.mjs
experimental: {
  outputFileTracingExcludes: {
    '*': ['node_modules/@swc/core-linux-x64-gnu/**/*'],
  },
}
```

### Backend Performance

**Database Query Monitoring**:
```python
# Add query timing
import time
from loguru import logger

async def monitored_query(query):
    start = time.time()
    result = await db.execute(query)
    duration = time.time() - start
    
    if duration > 0.1:  # 100ms threshold
        logger.warning(f"Slow query: {duration:.2f}s - {query}")
    
    return result
```

**API Endpoint Timing**:
```python
# Middleware for timing all requests
from fastapi import Request
import time

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log slow requests
    if process_time > 1.0:
        logger.warning(f"Slow request: {request.url.path} took {process_time:.2f}s")
    
    return response
```

---

## Log Management Best Practices

### Log Levels

```python
# Use appropriate log levels
logger.debug("Detailed info for debugging")      # Development only
logger.info("Normal operations")                 # Important events
logger.warning("Something unusual happened")     # Potential issues
logger.error("Something failed")                 # Errors that need attention
logger.critical("Service is down!")              # Immediate action required
```

### Structured Logging

```python
# Good: Structured logging (easy to search)
logger.info("User signup", extra={
    "user_id": user_id,
    "email": email,
    "signup_method": "google",
    "timestamp": datetime.utcnow().isoformat()
})

# Bad: Unstructured logging (hard to search)
logger.info(f"User {user_id} signed up with {email}")
```

### Log Retention

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 1 day | Local |
| Staging | 7 days | Log service |
| Production | 30 days | Log service |
| Audit logs | 1 year | Archive (S3) |

---

## Incident Response Runbook

### When an Alert Fires

1. **Acknowledge** (Within 5 minutes)
   - Acknowledge alert in monitoring system
   - Notify team if critical

2. **Assess** (Within 15 minutes)
   - Check dashboards
   - Review recent deployments
   - Check service status pages

3. **Mitigate** (Within 30 minutes)
   - Roll back if caused by deployment
   - Scale up if resource issue
   - Restore from backup if data issue

4. **Communicate** (Throughout)
   - Update status page
   - Notify affected users
   - Keep stakeholders informed

5. **Resolve** (ASAP)
   - Fix root cause
   - Verify fix
   - Monitor for recurrence

6. **Post-Mortem** (Within 48 hours)
   - Document what happened
   - Why it happened
   - How we fixed it
   - How we prevent it

---

## Monitoring Checklist

### Initial Setup (Week 1)
- [ ] Sentry configured for all services
- [ ] Uptime monitoring active
- [ ] Health checks returning correctly
- [ ] Log aggregation set up
- [ ] Alert rules configured
- [ ] Team knows how to access dashboards

### Ongoing (Weekly)
- [ ] Review error reports
- [ ] Check performance trends
- [ ] Verify backup status
- [ ] Update alert thresholds if needed

### Quarterly
- [ ] Disaster recovery drill
- [ ] Review and optimize dashboards
- [ ] Update runbooks
- [ ] Audit alert effectiveness

---

## Cost Optimization

**Free Tier Limits**:
- Sentry: 5,000 events/month
- UptimeRobot: 50 monitors
- Papertrail: 50MB/month
- Fly.io: Basic metrics included

**When to Upgrade**:
- > 10,000 users: Consider Datadog
- > $10k MRR: Invest in observability
- > 5 team members: Add on-call rotation

---

## Next Steps

1. **This Week**:
   - [ ] Set up Sentry (30 min)
   - [ ] Set up UptimeRobot (15 min)
   - [ ] Configure basic alerts (30 min)

2. **Next Week**:
   - [ ] Create first dashboard
   - [ ] Test alert flows
   - [ ] Document incident response

3. **Next Month**:
   - [ ] Add performance monitoring
   - [ ] Set up log retention
   - [ ] Run first disaster recovery drill

**Remember**: Start simple, iterate often. Perfect monitoring is the enemy of good monitoring!

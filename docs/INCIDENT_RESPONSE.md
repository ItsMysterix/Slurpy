# Incident Response Playbook

Quick reference guide for when things go wrong in production.

## 🚨 Incident Severity Levels

### P0 - Critical (Drop Everything)
**Response Time**: Immediate (< 5 minutes)  
**Examples**:
- Complete service outage (site is down)
- Database is down or corrupted
- Authentication completely broken (nobody can log in)
- Payment processing completely broken
- Data breach or security incident

**Actions**:
1. Page on-call person immediately
2. Create incident channel (#incident-YYYYMMDD)
3. Update status page: "Major outage - investigating"
4. All hands on deck

---

### P1 - High (Urgent)
**Response Time**: < 1 hour  
**Examples**:
- Elevated error rate (> 10%)
- Severe performance degradation (> 5s response time)
- Critical feature broken (chat not working)
- High memory/CPU usage (> 95%)

**Actions**:
1. Notify on-call person
2. Create incident ticket
3. Update status page if customer-facing
4. Start investigation

---

### P2 - Medium
**Response Time**: < 24 hours  
**Examples**:
- Moderate error rate (5-10%)
- Non-critical feature broken
- Performance issues on one endpoint
- Warning-level alerts

**Actions**:
1. Create ticket in backlog
2. Investigate during business hours
3. No status page update needed

---

### P3 - Low
**Response Time**: Next sprint  
**Examples**:
- Minor UI bugs
- Low error rate (1-5%)
- Deprecation warnings
- Nice-to-have improvements

**Actions**:
1. Create ticket
2. Prioritize in sprint planning

---

## 🔍 Initial Assessment (First 5 Minutes)

### Quick Checks

1. **Is it really down?**
   ```bash
   # Check health endpoints
   curl https://your-domain.com/api/health
   curl https://api.your-domain.com/health/healthz
   curl https://mcp.your-domain.com/healthz
   ```

2. **Is it just me?**
   - Check from different network
   - Use https://downforeveryoneorjustme.com/your-domain.com
   - Ask teammate to verify

3. **Provider issue?**
   - Check status pages:
     - https://status.flyio.net/
     - https://status.supabase.com/
     - https://status.clerk.com/
     - https://status.openai.com/

4. **Recent changes?**
   ```bash
   # Check recent deployments
   fly releases list --app slurpy-frontend
   fly releases list --app slurpy-backend
   
   # Check git log
   git log --oneline -10
   ```

5. **Check dashboards**
   - Sentry: New errors?
   - Fly.io: Resource issues?
   - UptimeRobot: When did it start?

---

## 🛠️ Common Issues & Solutions

### Issue: Site is Down (HTTP 500/502/503)

**Symptoms**:
- Users see error page
- Health checks failing
- Uptime monitor alerts

**Diagnosis**:
```bash
# Check Fly.io status
fly status --app slurpy-frontend

# Check logs
fly logs --app slurpy-frontend

# Check machine health
fly machine list --app slurpy-frontend
```

**Solutions**:

**Option 1: Restart service** (Quick fix)
```bash
fly machine restart <machine-id> --app slurpy-frontend
```

**Option 2: Rollback deployment** (If recent deploy)
```bash
fly releases list --app slurpy-frontend
fly releases rollback <previous-version> --app slurpy-frontend
```

**Option 3: Scale up resources** (If resource exhaustion)
```bash
fly scale vm shared-cpu-2x --app slurpy-frontend
fly scale count 2 --app slurpy-frontend
```

---

### Issue: Database Connection Failed

**Symptoms**:
- Errors: "Could not connect to database"
- Backend health check failing
- Sentry showing connection errors

**Diagnosis**:
```bash
# Test connection from backend
fly ssh console --app slurpy-backend

# Inside container
python3 << EOF
from supabase import create_client
import os
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)
print(client.table("users").select("count").execute())
EOF
```

**Solutions**:

**Option 1: Check Supabase status**
- Visit https://status.supabase.com/
- Check your project's dashboard

**Option 2: Connection pool exhausted**
```python
# Update backend connection pooler
# In Supabase: Settings > Database > Connection Pooler
# Use connection pooler URL instead of direct connection
```

**Option 3: Credentials rotated**
```bash
# Verify and update secrets
fly secrets list --app slurpy-backend
fly secrets set SUPABASE_SERVICE_ROLE_KEY=new_key --app slurpy-backend
```

---

### Issue: High Error Rate (> 5%)

**Symptoms**:
- Sentry showing error spike
- Multiple alerts firing
- Users reporting issues

**Diagnosis**:
```bash
# Check Sentry for error pattern
# - What's the error message?
# - Which endpoint is failing?
# - When did it start?

# Check logs for the failing endpoint
fly logs --app slurpy-backend | grep ERROR
```

**Solutions**:

**Option 1: Rate limiting issue**
- Check if being rate-limited by external API (OpenAI, Clerk)
- Implement backoff/retry logic

**Option 2: Bad deployment**
- Rollback to last known good version
  ```bash
  fly releases rollback <version>
  ```

**Option 3: External service down**
- Check if third-party service is down
- Implement circuit breaker pattern
- Show graceful error to users

---

### Issue: Slow Response Times (> 2s)

**Symptoms**:
- Dashboard showing high p95/p99 latency
- Users complaining about slowness
- No errors, just slow

**Diagnosis**:
```bash
# Check resource usage
fly status --app slurpy-backend

# Check for slow queries
# Review Sentry performance tab
# Look for database query times

# Check if specific endpoint
fly logs --app slurpy-backend | grep "took"
```

**Solutions**:

**Option 1: Scale horizontally**
```bash
fly scale count 3 --app slurpy-backend
```

**Option 2: Optimize slow queries**
```sql
-- Add database indexes
CREATE INDEX idx_users_email ON users(email);
```

**Option 3: Add caching**
```python
# Cache expensive operations
import redis
r = redis.Redis()

def get_user_data(user_id):
    cached = r.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)
    
    data = fetch_from_db(user_id)
    r.setex(f"user:{user_id}", 300, json.dumps(data))
    return data
```

---

### Issue: Out of Memory

**Symptoms**:
- App crashes with OOM error
- Fly.io showing memory > 90%
- Restarts frequently

**Diagnosis**:
```bash
# Check memory usage
fly status --app slurpy-backend

# Check logs for OOM
fly logs --app slurpy-backend | grep -i "out of memory"
```

**Solutions**:

**Option 1: Scale vertically** (Quick fix)
```bash
fly scale vm shared-cpu-2x --app slurpy-backend
```

**Option 2: Fix memory leak**
```python
# Check for:
# - Large objects not being garbage collected
# - Unbounded cache growth
# - File handles not being closed

# Add memory profiling
import tracemalloc
tracemalloc.start()
# ... your code ...
snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')
for stat in top_stats[:10]:
    print(stat)
```

**Option 3: Optimize models**
```python
# Load models lazily, not at startup
# Use quantized models
# Clear model cache after use
```

---

### Issue: Authentication Broken

**Symptoms**:
- Users can't log in
- "Unauthorized" errors
- Clerk errors in Sentry

**Diagnosis**:
```bash
# Check Clerk status
# Visit https://status.clerk.com/

# Verify Clerk secrets
fly secrets list --app slurpy-frontend

# Test Clerk webhook
curl -X POST https://your-domain.com/api/webhooks/clerk \
  -H "Content-Type: application/json" \
  -d '{"type": "user.created", "data": {...}}'
```

**Solutions**:

**Option 1: Clerk API key rotated**
```bash
# Get new keys from Clerk dashboard
fly secrets set CLERK_SECRET_KEY=sk_live_new --app slurpy-frontend
```

**Option 2: Webhook signature verification failing**
```typescript
// Check webhook secret
const svix = new Webhook(process.env.CLERK_WEBHOOK_SECRET)
```

**Option 3: CORS blocking auth requests**
```python
# Check CORS configuration
allow_origins = [
    "https://your-domain.com",
    "https://accounts.clerk.dev",  # Add Clerk domain
]
```

---

## 📋 Incident Response Workflow

### Phase 1: Detection (0-5 min)
- [ ] Alert received (Sentry, UptimeRobot, user report)
- [ ] Severity assessed (P0, P1, P2, P3)
- [ ] Incident commander assigned
- [ ] Status page updated (if customer-facing)

### Phase 2: Investigation (5-15 min)
- [ ] Recent changes reviewed
- [ ] Logs analyzed
- [ ] Metrics checked
- [ ] Root cause hypothesis formed

### Phase 3: Mitigation (15-30 min)
- [ ] Immediate fix applied (restart, rollback, scale)
- [ ] Verification that issue is resolved
- [ ] Status page updated
- [ ] Monitoring for recurrence

### Phase 4: Resolution (30-60 min)
- [ ] Permanent fix deployed
- [ ] All services healthy
- [ ] Users notified
- [ ] Status page marked resolved

### Phase 5: Post-Mortem (24-48 hours)
- [ ] Timeline documented
- [ ] Root cause identified
- [ ] Action items created
- [ ] Team debrief scheduled

---

## 💬 Communication Templates

### Status Page Update - Investigating
```
🔴 We're investigating reports of [brief description].
Our team is working to resolve this as quickly as possible.

Status: Investigating
Started: [timestamp]
Next update: [timestamp + 15 min]
```

### Status Page Update - Identified
```
🟡 We've identified the issue causing [brief description].
Cause: [one-sentence explanation]
Our team is implementing a fix.

Status: Identified
Next update: [timestamp + 15 min]
```

### Status Page Update - Resolved
```
✅ This incident has been resolved.
All services are now operational.

Timeline:
- [time]: Issue detected
- [time]: Root cause identified
- [time]: Fix deployed
- [time]: Verified resolved

We apologize for the inconvenience.
Post-mortem: [link]
```

### User Communication - Email
```
Subject: [Resolved] Service Disruption on [date]

Hi there,

We wanted to follow up on the service disruption you may have 
experienced on [date] at [time].

What happened:
[Brief, non-technical explanation]

Impact:
[What users couldn't do]

Resolution:
[What we did to fix it]

Prevention:
[What we're doing to prevent this in the future]

We sincerely apologize for the inconvenience. If you have any
questions, please don't hesitate to reach out.

Best regards,
The Slurpy Team
```

---

## 🔧 Emergency Commands

### Quick Rollback
```bash
# Frontend
fly releases rollback --app slurpy-frontend

# Backend
fly releases rollback --app slurpy-backend

# MCP
fly releases rollback --app slurpy-mcp
```

### Restart All Services
```bash
fly machine restart $(fly machine list --app slurpy-frontend -q)
fly machine restart $(fly machine list --app slurpy-backend -q)
fly machine restart $(fly machine list --app slurpy-mcp -q)
```

### Emergency Scale Up
```bash
# Horizontal
fly scale count 5 --app slurpy-backend

# Vertical
fly scale vm performance-2x --app slurpy-backend
```

### Check All Health Endpoints
```bash
#!/bin/bash
echo "Frontend: $(curl -s https://your-domain.com/api/health | jq -r .status)"
echo "Backend: $(curl -s https://api.your-domain.com/health/healthz | jq -r .ok)"
echo "MCP: $(curl -s https://mcp.your-domain.com/healthz | jq -r .ok)"
```

### Export Recent Logs
```bash
fly logs --app slurpy-backend > incident-logs-$(date +%Y%m%d-%H%M%S).log
```

---

## 📞 Escalation Paths

### Level 1: On-Call Engineer
- Try standard solutions from this playbook
- If not resolved in 30 minutes → escalate

### Level 2: Tech Lead
- Complex issues requiring architectural knowledge
- If not resolved in 1 hour → escalate

### Level 3: CTO/Founder
- Major outages affecting all users
- Security incidents
- Data loss scenarios

### External Support
- **Fly.io**: community.fly.io (public) or support ticket (paid)
- **Supabase**: Discord or support email
- **Clerk**: Discord or support email

---

## 📚 Post-Incident Actions

### Immediate (< 24 hours)
- [ ] Create incident report document
- [ ] Document timeline
- [ ] Identify root cause
- [ ] Create action items

### Short-term (< 1 week)
- [ ] Conduct post-mortem meeting
- [ ] Share learnings with team
- [ ] Update runbooks
- [ ] Implement quick wins

### Long-term (< 1 month)
- [ ] Implement preventive measures
- [ ] Add monitoring for this scenario
- [ ] Update alerts
- [ ] Conduct scenario drill

---

## 🎓 Learning from Incidents

### Post-Mortem Template

**Incident ID**: INC-YYYYMMDD-NNN  
**Severity**: P0/P1/P2/P3  
**Duration**: X hours Y minutes  
**Impact**: X users affected, Y minutes downtime

**Timeline**:
- HH:MM - Issue detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Verified resolved

**Root Cause**:
[Technical explanation]

**What Went Well**:
- Quick detection
- Clear communication
- Fast rollback

**What Went Wrong**:
- Insufficient testing
- No monitoring for this scenario
- Unclear ownership

**Action Items**:
1. [ ] Add integration test for this scenario
2. [ ] Add monitoring alert
3. [ ] Update deployment checklist
4. [ ] Schedule incident response drill

**Lessons Learned**:
[Key takeaways for the team]

---

Remember: **Incidents are learning opportunities, not blame opportunities.**

Focus on:
- ✅ What happened
- ✅ How to prevent it
- ✅ How to detect it faster

Not on:
- ❌ Who caused it
- ❌ Why didn't you...
- ❌ This shouldn't have happened

Stay calm, follow the playbook, and learn from every incident. 🚀

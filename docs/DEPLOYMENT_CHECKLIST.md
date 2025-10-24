# Production Deployment Checklist

Use this checklist before deploying to production. Check off each item as you complete it.

## 🔐 Security (CRITICAL)

### API Security
- [ ] **CORS configured** - Update `backend/slurpy/interfaces/http/main.py` with your production domains
- [ ] **Rate limiting enabled** - Add `slowapi` to backend (see SAAS_OPERATIONS.md)
- [ ] **Security headers added** - Already in `next.config.mjs`
- [ ] **HTTPS only** - Enforced by Fly.io automatically ✅
- [ ] **Secrets not in code** - All sensitive values in environment variables

### Authentication
- [ ] **Clerk production keys** - Using `pk_live_*` and `sk_live_*` (not test keys)
- [ ] **Clerk webhook secret** - Set up webhook endpoints in Clerk dashboard
- [ ] **Session security** - Review Clerk session settings (timeout, MFA options)
- [ ] **Email verification** - Enabled in Clerk settings

### Database
- [ ] **Supabase production** - Using production project (not development)
- [ ] **Row Level Security (RLS)** - Enabled on all tables
- [ ] **Service role key secured** - Only in backend environment, never in frontend
- [ ] **Backup enabled** - Daily automated backups in Supabase
- [ ] **Connection pooling** - Configured for production load

### Secrets Management
- [ ] **All secrets in Fly.io** - No secrets in code or docker-compose.yml
  ```bash
  fly secrets set CLERK_SECRET_KEY=sk_live_xxx --app slurpy-frontend
  fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJxxx --app slurpy-backend
  fly secrets set OPENAI_API_KEY=sk-xxx --app slurpy-mcp
  ```
- [ ] **API keys rotated** - If reusing from development, rotate all keys
- [ ] **Stripe live keys** - Using `sk_live_*` and `pk_live_*`

---

## 📊 Monitoring (CRITICAL)

### Error Tracking
- [ ] **Sentry configured** - Set `SENTRY_DSN` for all 3 services
- [ ] **Sentry releases** - Set up release tracking
- [ ] **Error alerts** - Email + Slack notifications configured
- [ ] **Source maps uploaded** - For readable stack traces (Next.js)

### Uptime Monitoring
- [ ] **UptimeRobot/Better Uptime** - Monitoring all 3 health endpoints
- [ ] **Alert contacts** - Email + SMS configured
- [ ] **Check frequency** - Every 5 minutes minimum
- [ ] **Alert threshold** - Alert after 2 failed checks (10 minutes)

### Logging
- [ ] **Log aggregation** - Papertrail, Logtail, or Datadog configured
- [ ] **Log retention** - 30 days minimum for production
- [ ] **Log alerts** - Alerts on ERROR and CRITICAL logs
- [ ] **Structured logging** - JSON format for easy searching

### Dashboards
- [ ] **Metrics dashboard** - Set up basic dashboard (Grafana/Datadog/Fly.io)
- [ ] **Health check** - Can view service status at a glance
- [ ] **Performance metrics** - Response times, error rates tracked

---

## 🌍 Infrastructure

### DNS & Domains
- [ ] **Domain purchased** - Your production domain
- [ ] **DNS configured** - Pointing to Fly.io
- [ ] **SSL certificate** - Auto-provisioned by Fly.io ✅
- [ ] **www redirect** - `www.your-domain.com` → `your-domain.com` (or vice versa)
- [ ] **Cloudflare setup** - Optional but recommended for DDoS protection

### Fly.io Configuration
- [ ] **Production apps created**
  ```bash
  fly apps create slurpy-frontend
  fly apps create slurpy-backend
  fly apps create slurpy-mcp
  fly apps create slurpy-qdrant  # If hosting Qdrant on Fly.io
  ```
- [ ] **Regions configured** - Deploy to regions close to your users
- [ ] **Auto-scaling configured** - Set min/max machines
  ```toml
  [http_service]
    min_machines_running = 1
    max_machines_running = 3
  ```
- [ ] **Health checks configured** - In `fly.toml` for each app
- [ ] **Volume created** - For Qdrant persistent storage (if needed)

### Environment Variables
- [ ] **Production environment set**
  ```bash
  fly secrets set ENVIRONMENT=production --app slurpy-backend
  fly secrets set NODE_ENV=production --app slurpy-frontend
  ```
- [ ] **All required env vars set** - Check `.env.example` for complete list
- [ ] **ALLOWED_ORIGINS configured** - Comma-separated list of your domains

---

## 💰 Billing & Costs

### Payment Setup
- [ ] **Payment method added** - Credit card in Fly.io
- [ ] **Billing alerts** - Set at $50 and $100
- [ ] **Usage limits** - Set max spend to prevent surprise bills
- [ ] **Cost tracking** - Set up monthly cost review calendar event

### Service Plans
- [ ] **Fly.io plan** - Free tier sufficient? Or upgrade to Launch/Scale?
- [ ] **Supabase plan** - Free tier sufficient? (500MB DB, 1GB bandwidth)
- [ ] **Clerk plan** - Free tier (10k MAU) or Pro?
- [ ] **OpenAI budget** - Set usage limits in OpenAI dashboard
- [ ] **Sentry plan** - Free tier (5k events) or Team plan?

---

## 🚀 Deployment

### Pre-Deploy
- [ ] **All tests passing** - Run full test suite
  ```bash
  npm test
  pytest backend/tests
  ```
- [ ] **Database migrations** - Applied to production DB
- [ ] **Feature flags** - Disabled any beta features
- [ ] **Performance tested** - Load testing completed
- [ ] **Security scan** - Run `npm audit` and `pip-audit`

### Deploy Process
- [ ] **Deploy backend first**
  ```bash
  fly deploy --config fly.backend.toml --remote-only
  ```
- [ ] **Deploy MCP**
  ```bash
  fly deploy --config fly.mcp.toml --remote-only
  ```
- [ ] **Deploy frontend last**
  ```bash
  fly deploy --config fly.frontend.toml --remote-only
  ```
- [ ] **Health checks passing** - All services return 200
- [ ] **Smoke test** - Test critical user flows manually

### Post-Deploy (First 30 Minutes)
- [ ] **Monitor error rates** - Should not spike
- [ ] **Monitor response times** - Should stay < 1s
- [ ] **Check logs** - No unexpected errors
- [ ] **Test user signup** - Complete flow works
- [ ] **Test login** - Auth working correctly
- [ ] **Test core features** - Chat functionality working
- [ ] **Test payments** - If applicable

---

## 📝 Documentation

### Internal Docs
- [ ] **README.md updated** - Instructions for team
- [ ] **SAAS_OPERATIONS.md reviewed** - Operations guide
- [ ] **Runbooks created** - Deployment, rollback, incident response
- [ ] **Architecture diagram** - Visual of your infrastructure
- [ ] **API documentation** - Swagger/OpenAPI docs

### External Docs
- [ ] **Terms of Service** - Legal requirement
- [ ] **Privacy Policy** - GDPR/CCPA compliance
- [ ] **Status page** - Create at status.your-domain.com (use Statuspage.io)
- [ ] **Support docs** - FAQ, troubleshooting guides
- [ ] **API docs** - If offering public API

---

## 🧪 Testing

### Functional Tests
- [ ] **Unit tests** - 80%+ coverage
- [ ] **Integration tests** - API endpoints tested
- [ ] **E2E tests** - Playwright tests for critical flows
- [ ] **Performance tests** - Load testing with k6 or Artillery

### Production Testing
- [ ] **Canary deployment** - Deploy to 10% of traffic first
- [ ] **Synthetic monitoring** - Automated user journey tests
- [ ] **A/B testing setup** - If needed for feature rollouts

---

## 📱 User Experience

### Performance
- [ ] **Lighthouse score > 90** - For SEO and UX
- [ ] **Core Web Vitals green** - LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] **Bundle size optimized** - Tree-shaking, code splitting
- [ ] **Images optimized** - WebP format, lazy loading
- [ ] **CDN configured** - Cloudflare for static assets

### Accessibility
- [ ] **WCAG 2.1 Level AA** - Basic accessibility compliance
- [ ] **Keyboard navigation** - All features accessible via keyboard
- [ ] **Screen reader tested** - Works with NVDA/JAWS
- [ ] **Color contrast** - Meets accessibility standards

---

## 💬 Communication

### Launch Announcement
- [ ] **Landing page** - Marketing site ready
- [ ] **Social media** - Twitter/LinkedIn posts scheduled
- [ ] **Email list** - Announcement email ready
- [ ] **Product Hunt** - Submission prepared (if applicable)

### Support Channels
- [ ] **Support email** - support@your-domain.com set up
- [ ] **Help desk** - Intercom/Zendesk/plain.com configured
- [ ] **Community** - Discord/Slack community (if applicable)
- [ ] **Documentation site** - Help center with guides

---

## 🔄 Ongoing Operations

### Daily
- [ ] **Check dashboards** - Review health metrics
- [ ] **Review errors** - Triage in Sentry
- [ ] **Monitor costs** - Check Fly.io usage

### Weekly
- [ ] **Backup verification** - Test restore from backup
- [ ] **Security updates** - Update dependencies
- [ ] **Performance review** - Check response times, optimize if needed

### Monthly
- [ ] **Rotate API keys** - Every 90 days
- [ ] **Cost review** - Optimize spending
- [ ] **Security audit** - Review permissions, access logs
- [ ] **Disaster recovery drill** - Test full recovery process

---

## ✅ Final Checklist

Before you click "Deploy to Production":

- [ ] I have reviewed all security settings
- [ ] All secrets are stored securely (not in code)
- [ ] Monitoring and alerts are configured
- [ ] Backups are enabled and tested
- [ ] I have a rollback plan
- [ ] I know how to check if the deployment succeeded
- [ ] I have communicated the deployment to the team
- [ ] I am prepared to monitor for the next 30 minutes

---

## 🆘 If Something Goes Wrong

### Immediate Actions
1. **Don't panic** - Take a breath
2. **Check status page** - See if it's a provider issue
3. **Check dashboards** - Identify the problem
4. **Rollback if needed**
   ```bash
   fly releases list --app slurpy-frontend
   fly releases rollback <version> --app slurpy-frontend
   ```
5. **Communicate** - Update status page, notify users

### Get Help
- **Fly.io**: community.fly.io
- **Supabase**: Discord or support ticket
- **Clerk**: Discord or email support
- **Sentry**: docs.sentry.io

---

## 📚 Additional Resources

- [12 Factor App Methodology](https://12factor.net/)
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Remember**: Production deployment is a process, not a one-time event. Start with the critical items, iterate, and improve over time.

Good luck! 🚀

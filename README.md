# Slurpy 🌱

**Slurpy** is an AI-powered mental health companion designed to support, not judge. Built with Next.js, Python, and advanced NLP models, Slurpy provides personalized emotional support through intelligent conversations, mood tracking, and behavioral insights.

> **Production Ready**: This project includes comprehensive guides for deploying and operating a SaaS platform. See [SaaS Operations Guide](SAAS_OPERATIONS.md) for everything you need to know as a first-time SaaS owner.

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| **[SaaS Operations Guide](SAAS_OPERATIONS.md)** | **START HERE** - Essential guide for running Slurpy in production |
| [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) | Step-by-step checklist before going live |
| [Monitoring Setup](docs/MONITORING.md) | How to set up monitoring, alerts, and dashboards |
| [Incident Response](docs/INCIDENT_RESPONSE.md) | What to do when things go wrong |
| [Security Best Practices](#security) | Security hardening and compliance |

---

## 🚀 Features

- **AI Chat Support**: Conversational AI powered by RAG (Retrieval-Augmented Generation) with emotion detection
- **Mood Tracking**: Daily mood logging with visual calendar and analytics
- **Emotion Classification**: Real-time emotion detection using fine-tuned transformer models with calibration
- **Journal Insights**: AI-generated insights from your journal entries
- **Geofencing & JITAI**: Just-in-Time Adaptive Interventions based on location and context
- **Stripe Integration**: Subscription management for premium features
- **Secure Authentication**: Clerk-based auth with SSO support
- **Production-Ready**: Dockerized microservices with health checks and monitoring

---

## 🏗️ Architecture

### Services

- **Frontend** (Next.js 15): Standalone app with Tailwind CSS, Framer Motion animations
- **Backend** (FastAPI): Python API with NLP models, RAG, and database integration
- **MCP Server** (FastAPI): Model Context Protocol server for AI orchestration
- **Qdrant**: Vector database for semantic search and memory

### Key Technologies

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS, Clerk Auth
- **Backend**: Python 3.11, FastAPI, PyTorch, Transformers, Sentence-Transformers
- **Database**: Supabase (PostgreSQL), Qdrant (Vector DB)
- **Infrastructure**: Docker, Docker Compose, Fly.io deployment configs
- **AI/ML**: RoBERTa emotion classification, BGE embeddings, temperature calibration

---

## 📦 Installation

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)
- Clerk account (for authentication)
- Supabase project (for database)
- Stripe account (for payments)

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/chat
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/chat

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# API Configuration
NEXT_PUBLIC_RAG_API=http://localhost:8000/v1/mcp/stream
MCP_BASE_URL=http://mcp:9001
QDRANT_URL=http://qdrant:6333
FRONTEND_ORIGIN=http://localhost:3000

# Optional: Development flags
API_DEBUG=true
DEV_NO_AUTH=false
CORS_ALLOW_ALL=false

# Optional: Emotion Calibration
EMOTION_CALIB_JSON={"happy":0.95,"sad":1.1,...}
EMOTION_CALIB_CANARY=true
EMOTION_CALIB_SHADOW=true
EMOTION_CALIB_SHADOW_SAMPLING=0.1
```

**See [`.env.example`](.env.example) for complete environment variable reference.**

---

## 🐳 Docker Deployment

### Quick Start (Development)

```bash
# 1. Copy environment template
cp .env.example .env.local

# 2. Fill in your API keys in .env.local

# 3. Build all images
docker compose build mcp backend frontend --no-cache

# 4. Start services
docker compose up -d qdrant mcp backend frontend

# 5. View logs
docker compose logs -f frontend backend mcp

# 6. Check health
curl http://localhost:3000/api/health
curl http://localhost:8000/health/healthz
curl http://localhost:9001/healthz
```

### Production Deployment

**⚠️ Before deploying to production, complete the [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)**

Key production steps:
1. Set up monitoring (Sentry, UptimeRobot) - See [Monitoring Guide](docs/MONITORING.md)
2. Configure security (CORS, rate limiting, SSL) - See [SaaS Operations](SAAS_OPERATIONS.md#-security-hardening-)
3. Set up backups (database, logs) - See [SaaS Operations](SAAS_OPERATIONS.md#-backup--disaster-recovery-)
4. Deploy to Fly.io (see below)

### Individual Service Commands

```bash
# Frontend only
docker compose up -d frontend
docker compose logs -f frontend

# Backend only
docker compose up -d backend
docker compose logs -f backend

# MCP server only
docker compose up -d mcp
docker compose logs -f mcp

# Stop all services
docker compose down

# Remove volumes (careful!)
docker compose down -v
```

---

## 💻 Local Development

### Frontend

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Backend

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements/backend.txt

# Run server
cd backend
uvicorn slurpy.main:app --reload --port 8000
```

### MCP Server

```bash
# Same venv as backend
cd backend
uvicorn slurpy.mcp_server:app --reload --port 9001
```

### Database Migrations

```bash
# Apply Supabase migrations
npx supabase db push

# Create new migration
npx supabase migration new your_migration_name
```

---

## 🧪 Testing

### Frontend Tests (Playwright)

```bash
# Run all tests
npm run test

# Run specific test file
npx playwright test tests/chat.spec.ts

# Run in UI mode
npx playwright test --ui

# Generate report
npx playwright show-report
```

### Backend Tests (pytest)

```bash
cd backend
pytest tests/ -v

# Run specific test
pytest tests/test_nlp_classifiers.py -v

# With coverage
pytest tests/ --cov=slurpy --cov-report=html
```

---

## 📊 Monitoring & Health Checks

All services expose health endpoints:

- **Frontend**: `GET /api/health` - Returns Next.js + emotion calibration status
- **Backend**: `GET /health/healthz` - Returns API health + model status
- **MCP**: `GET /healthz` - Returns MCP server status
- **Qdrant**: `GET /healthz` - Vector DB health

Health response includes:
- Service status
- Emotion calibration metrics (canary, drift, shadow stats)
- Timestamp

---

## 🔐 Security Features

- **Authentication**: Clerk-based auth with OAuth support
- **Authorization**: Row-level security (RLS) in Supabase
- **CORS**: Configurable origin whitelisting
- **CSRF**: Token-based protection for mutations
- **Rate Limiting**: IP-based rate limiting on API routes
- **Content Security Policy**: Strict CSP headers
- **Input Validation**: Zod schemas for all inputs
- **Secret Management**: Environment-based secrets (never committed)

---

## 🚢 Production Deployment

### Fly.io

Three separate apps are configured:

```bash
# Deploy frontend
fly deploy -c fly.frontend.toml

# Deploy backend
fly deploy -c fly.backend.toml

# Deploy MCP
fly deploy -c fly.mcp.toml
```

### Environment Secrets

```bash
# Set secrets for each app
fly secrets set CLERK_SECRET_KEY=sk_... -a slurpy-frontend
fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ... -a slurpy-backend
fly secrets set OPENAI_API_KEY=sk-... -a slurpy-mcp
```

**For complete production deployment guide, see [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)**

---

## 🔐 Security

### Production Security Checklist

**Critical items to configure before going live:**

- [ ] **Update CORS policy** - Change from `allow_origins=["*"]` to your specific domains in `backend/slurpy/interfaces/http/main.py`
- [ ] **Add rate limiting** - Install and configure `slowapi` for API protection (see [SaaS Operations](SAAS_OPERATIONS.md#fix-2-add-rate-limiting))
- [ ] **Security headers** - Already configured in `next.config.mjs` ✅
- [ ] **Environment secrets** - All API keys in Fly.io secrets, not in code
- [ ] **Supabase RLS** - Row Level Security enabled on all tables
- [ ] **Regular updates** - Weekly `npm audit` and `pip-audit` scans

**See full security guide in [SaaS Operations](SAAS_OPERATIONS.md#-security-hardening-)**

### Vulnerability Scanning

```bash
# Frontend dependencies
npm audit
npm audit fix

# Backend dependencies
cd backend
pip-audit
```

---

## 📊 Monitoring & Operations

### Health Endpoints

All services expose health endpoints for monitoring:

- **Frontend**: `GET /api/health` - Returns Clerk, Supabase, and backend status
- **Backend**: `GET /health/healthz` - Returns database and Qdrant status  
- **MCP**: `GET /healthz` - Returns service status

### Set Up Monitoring (15 minutes)

1. **Error Tracking** (Sentry - Already integrated!)
   - Sign up at [sentry.io](https://sentry.io)
   - Set `SENTRY_DSN` environment variable
   - See [Monitoring Guide](docs/MONITORING.md) for setup

2. **Uptime Monitoring** (UptimeRobot - Free)
   - Monitor all 3 health endpoints
   - Alert via email + SMS
   - See [SaaS Operations](SAAS_OPERATIONS.md#set-up-uptime-monitoring-5-minutes) for details

3. **Log Aggregation** (Optional but recommended)
   - Papertrail (free tier)
   - Fly.io built-in logs
   - See [Monitoring Guide](docs/MONITORING.md#set-up-log-aggregation)

**Full monitoring setup guide: [docs/MONITORING.md](docs/MONITORING.md)**

---

## 🆘 Incident Response

**If something goes wrong in production:**

1. Check [Incident Response Playbook](docs/INCIDENT_RESPONSE.md)
2. Follow severity levels (P0-P3)
3. Use emergency rollback commands
4. Update status page
5. Conduct post-mortem

**Quick rollback**:
```bash
fly releases rollback --app slurpy-frontend
fly releases rollback --app slurpy-backend
fly releases rollback --app slurpy-mcp
```

---

## 💰 Cost Management

**Expected monthly costs** (for small SaaS):
- Fly.io: $0-20/month (free tier covers basic usage)
- Supabase: $0-25/month (free tier → Pro as you grow)
- Clerk: $0-25/month (free tier → Pro at 10k MAU)
- OpenAI: $10-100/month (depends on usage)
- Monitoring: $0 (free tiers of Sentry, UptimeRobot)

**Total**: $10-50/month to start

See [Cost Management](SAAS_OPERATIONS.md#-cost-management) for optimization tips.

---

## 📁 Project Structure

```
slurpy/
├── app/                        # Next.js app directory
│   ├── api/                    # API routes
│   ├── chat/                   # Chat page
│   ├── journal/                # Journal page
│   ├── calendar/               # Calendar page
│   ├── insights/               # Insights page
│   └── ...                     # Auth pages
├── backend/                    # Python backend
│   ├── slurpy/
│   │   ├── domain/             # Business logic
│   │   │   ├── nlp/            # NLP models & emotion detection
│   │   │   ├── memory/         # Vector memory & RAG
│   │   │   └── jitai/          # Just-in-Time interventions
│   │   ├── api/                # FastAPI routes
│   │   ├── main.py             # Backend entrypoint
│   │   └── mcp_server.py       # MCP server entrypoint
│   └── tests/                  # Backend tests
├── components/                 # React components
├── lib/                        # Shared utilities
├── supabase/migrations/        # Database migrations
├── infra/docker/               # Dockerfiles
├── requirements/               # Python dependencies
├── docker-compose.yml          # Docker orchestration
├── package.json                # Node dependencies
└── README.md                   # This file
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **Frontend**: ESLint + Prettier (run `npm run lint`)
- **Backend**: Black + isort (run `black . && isort .`)
- **Commits**: Conventional commits preferred

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Hugging Face](https://huggingface.co/) for transformer models
- [Clerk](https://clerk.com/) for authentication
- [Supabase](https://supabase.com/) for database & auth
- [Qdrant](https://qdrant.tech/) for vector search
- [Next.js](https://nextjs.org/) team for the amazing framework
- [FastAPI](https://fastapi.tiangolo.com/) for the Python backend framework

---

## 📧 Support

For issues, questions, or feedback:
- Email: support@slurpy.ai
- GitHub Issues: [Create an issue](https://github.com/ItsMysterix/Slurpy/issues)

---

**Built with 💚 by the Slurpy Team**

# Docker Production Setup Guide

This guide will help you run Slurpy in Docker with full Clerk authentication, forgot password, and all features working correctly.

## Prerequisites

1. **Docker & Docker Compose** installed
2. **Accounts setup:**
   - Clerk account (https://dashboard.clerk.com)
   - Supabase account (https://supabase.com)
   - OpenAI API key (https://platform.openai.com)

## Quick Start

### 1. Set up environment variables

```bash
# Copy the template
cp .env.docker .env

# Edit .env with your actual credentials
nano .env  # or use your favorite editor
```

### 2. Required environment variables

Update these in your `.env` file:

```bash
# Clerk (REQUIRED for authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx  # From Clerk Dashboard
CLERK_SECRET_KEY=sk_test_xxxxx                   # From Clerk Dashboard

# Supabase (REQUIRED for database)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_ROLE=eyJxxxx

# OpenAI (REQUIRED for AI features)
OPENAI_API_KEY=sk-xxxxx
```

### 3. Run the setup script

```bash
./scripts/docker-setup.sh
```

This script will:
- ✅ Validate your environment variables
- ✅ Build all Docker images (frontend, backend, MCP, Qdrant)
- ✅ Start all services
- ✅ Wait for health checks
- ✅ Display access URLs

### 4. Access your application

Once the script completes, open your browser to:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **MCP Service**: http://localhost:9001
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## Features Verified

✅ **Sign Up** - Create new accounts with email  
✅ **Sign In** - Login with existing accounts  
✅ **Forgot Password** - Request password reset code  
✅ **Reset Password** - Set new password with OTP  
✅ **Email Verification** - Verify email addresses  
✅ **Chat** - AI-powered conversations  
✅ **Journal** - Personal journal entries  
✅ **Mood Tracking** - Emotional wellness tracking  

## Architecture

```
┌─────────────────┐
│   Frontend      │ :3000 (Next.js + Clerk)
│  (slurpy-web)   │
└────────┬────────┘
         │
┌────────▼────────┐
│    Backend      │ :8000 (FastAPI + Python)
│   (slurpy)      │
└────────┬────────┘
         │
    ┌────┴────┬──────────┐
    │         │          │
┌───▼───┐ ┌──▼───┐ ┌────▼─────┐
│  MCP  │ │Qdrant│ │ Supabase │
│ :9001 │ │:6333 │ │  (cloud) │
└───────┘ └──────┘ └──────────┘
```

## Environment Configuration

### Development vs Production

The docker-compose.yml is configured for **production-ready** mode:

- ✅ Authentication **enabled** (`DEV_NO_AUTH=false`)
- ✅ CORS **restricted** to localhost
- ✅ Security headers **active**
- ✅ Read-only filesystems
- ✅ Non-root users
- ✅ Health checks configured

### Clerk Configuration

Clerk settings in docker-compose.yml:

```yaml
# Build-time (needed for middleware compilation)
args:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
  CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}

# Runtime (needed for SSR and API routes)
environment:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
  CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: /sign-in
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: /sign-up
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: /chat
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: /chat
```

## Troubleshooting

### Clerk errors in logs

**Problem**: `CLERK_SECRET_KEY is not defined`

**Solution**: Make sure you've set all Clerk variables in `.env`:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Then rebuild:
```bash
docker compose down
docker compose build frontend
docker compose up -d
```

### Password reset not working

**Problem**: "Failed to send reset code"

**Solution**: 
1. Check Clerk dashboard → Email templates are enabled
2. Verify email is configured in Clerk settings
3. Check frontend logs: `docker compose logs frontend`

### Backend shows "Unauthorized"

**Problem**: API requests returning 401

**Solution**:
1. Ensure `DEV_NO_AUTH=false` in docker-compose.yml
2. Verify `CLERK_SECRET_KEY` is set in backend environment
3. Check backend logs: `docker compose logs backend`

### Database connection errors

**Problem**: "Could not connect to Supabase"

**Solution**:
1. Verify Supabase credentials in `.env`
2. Check Supabase project is active
3. Verify service role key has correct permissions

## Manual Commands

### View logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f mcp
```

### Restart services
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart frontend
```

### Rebuild after code changes
```bash
# Rebuild and restart frontend
docker compose build frontend && docker compose up -d frontend

# Rebuild everything
docker compose build && docker compose up -d
```

### Clean slate
```bash
# Remove all containers and volumes
docker compose down -v

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d
```

## Health Checks

Each service has a health endpoint:

```bash
# Qdrant
curl http://localhost:6333/healthz

# MCP
curl http://localhost:9001/healthz

# Backend
curl http://localhost:8000/health/healthz

# Frontend
curl http://localhost:3000/api/health
```

## Security Notes

1. **Never commit `.env` files** - They're in `.gitignore` but double-check
2. **Use test keys in development** - Switch to live keys only in production
3. **Rotate secrets regularly** - See `SAAS_OPERATIONS.md` for schedule
4. **CORS is restricted** - Only localhost allowed in docker-compose.yml
5. **HTTPS in production** - Use Fly.io or add reverse proxy (nginx/Caddy)

## Production Deployment

For deploying to Fly.io or other platforms, see:

- **DEPLOYMENT_CHECKLIST.md** - Pre-deployment checklist
- **SAAS_OPERATIONS.md** - Operations guide
- **MONITORING.md** - Monitoring setup
- **INCIDENT_RESPONSE.md** - Emergency procedures

## Testing Authentication Flow

1. **Sign Up**
   - Go to http://localhost:3000
   - Click "Sign Up"
   - Enter email and password
   - Verify email (check Clerk dashboard for test mode)

2. **Sign In**
   - Go to http://localhost:3000/sign-in
   - Enter credentials
   - Should redirect to /chat

3. **Forgot Password**
   - Go to http://localhost:3000/forgot-password
   - Enter email
   - Receive OTP code
   - Go to http://localhost:3000/reset-password
   - Enter code and new password

4. **Protected Routes**
   - Try accessing /chat without login → redirects to /sign-in
   - Try accessing /journal without login → redirects to /sign-in

## Support

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Verify environment variables: `docker compose config`
3. Review health checks: See "Health Checks" section above
4. See troubleshooting: Above section
5. Check documentation: README.md, SAAS_OPERATIONS.md

---

**Ready to deploy?** Follow the [Production Deployment Checklist](../docs/DEPLOYMENT_CHECKLIST.md)

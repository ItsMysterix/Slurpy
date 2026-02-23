# Configuration Directory

Application-level configuration, environment variables, and feature flags.

## Files

### Environment Configuration

#### `.env.vercel.local`
- Vercel-specific environment variables for local development
- Contains secrets that should NOT be committed
- Add to `.gitignore` (already included)
- Load manually: `source config/.env.vercel.local`

#### `.python-version`
- Python version requirement for backend
- Used by pyenv: `pyenv install $(cat config/.python-version)`
- Currently: Python 3.11+

### Pre-Commit Configuration

#### `.pre-commit-config.yaml`
Git pre-commit hooks to catch common issues before commit:

```bash
# Install hooks (one-time)
pre-commit install

# Run manually
pre-commit run --all-files
```

Includes:
- ✓ Trailing whitespace detection
- ✓ Large file detection (>500MB blocks)
- ✓ YAML/JSON validation
- ✓ Secret detection (`detect-secrets` integration)

### TypeScript Configuration

#### `tsconfig.json`
Root-extended TypeScript compiler options:
- Base path: `config/tsconfig.json`
- Resolves `@/*` imports to project root
- Target: ES6, Strict mode enabled
- Used by: IDE, `tsc`, Next.js

**Path Aliases:**
```typescript
import { auth } from '@/lib/api-auth';
// Resolves to: /lib/api-auth.ts
```

#### `tsconfig.tsbuildinfo`
TypeScript build cache (auto-generated, don't edit).

### Sentry Configuration

#### `sentry.client.config.ts`
Client-side error tracking:
- Sends errors from browser to Sentry
- Captures React errors, unhandled promise rejections
- Session replay (limited)
- Performance monitoring
- Environment: `development` | `staging` | `production`

**Setup:**
```typescript
import * as Sentry from "@sentry/nextjs";

// Already called in app/layout.tsx
// Send custom errors:
Sentry.captureException(error);
Sentry.captureMessage("User action occurred", "info");
```

#### `sentry.server.config.ts`
Server-side error tracking:
- Captures API errors, unhandled exceptions
- Database connection failures
- External API errors
- Performance metrics

**Usage:**
```typescript
// In API route
try {
  // risky operation
} catch (err) {
  Sentry.captureException(err);
}
```

### Managing Configuration

#### Adding New Environment Variables

1. **Local Development:**
   ```bash
   echo "NEW_KEY=value" >> config/.env.vercel.local
   source config/.env.vercel.local
   npm run dev
   ```

2. **Staging (Vercel):**
   - Go to Vercel Dashboard
   - Project → Settings → Environment Variables
   - Add variable, select `Preview` environment

3. **Production (Railway):**
   - Go to Railway Dashboard
   - Project → Variables
   - Add `NEW_KEY=production_value`

#### Secrets Management

**Never commit secrets.** Use:
- `.env.local` (git-ignored)
- Vercel/Railway secret dashboard
- Pre-commit `detect-secrets` hook catches leaks

```bash
# Scan for secrets before commit
pre-commit run detect-secrets --all-files

# Whitelist safe false-positives (JWTs, etc)
echo "docs_some_jwt_example" | detect-secrets audit .secrets.baseline
```

#### Feature Flags

Can be added to config files:
```typescript
// config/features.ts
export const FEATURES = {
  CRISIS_CTA_ENABLED: process.env.CRISIS_CTA_ENABLED === 'true',
  WELLBEING_SURVEYS: process.env.WELLBEING_SURVEYS === 'true',
  ADVANCED_INSIGHTS: process.env.ADVANCED_INSIGHTS === 'true',
};
```

Use in code:
```typescript
import { FEATURES } from '@/config/features';

if (FEATURES.CRISIS_CTA_ENABLED) {
  // Show crisis CTA
}
```

## Typical Configuration Tasks

### Change Python Version
```bash
# Update config/.python-version
echo "3.12" > config/.python-version
pyenv install 3.12
pyenv local 3.12
```

### Update TypeScript Strict Mode
Edit `config/tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,  // ← Change this
    "noImplicitAny": true
  }
}
```

### Add Sentry Integration
```typescript
// app/layout.tsx
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### Configure Pre-Commit Hooks
```bash
# .pre-commit-config.yaml
- repo: https://github.com/pre-commit/pre-commit-hooks
  rev: v4.0.0
  hooks:
    - id: check-yaml
    - id: detect-private-key
```

## Environment Variables Reference

| Variable | Type | Example | Used By |
|----------|------|---------|---------|
| `NODE_ENV` | String | `development` \| `staging` \| `production` | Next.js, entire app |
| `DATABASE_URL` | String | `postgres://host/db` | Supabase client, migrations |
| `SUPABASE_URL` | String | `https://*.supabase.co` | Frontend Supabase client |
| `SUPABASE_ANON_KEY` | String | `eyJ...` | Frontend auth |
| `OPENAI_API_KEY` | String | `sk_...` | Backend LLM calls |
| `STRIPE_SECRET_KEY` | String | `sk_live_...` | Payment processing |
| `SENTRY_DSN` | String | `https://xxx@sentry.io/123` | Error tracking |
| `CRISIS_CTA_ENABLED` | Boolean | `true` | Crisis screening toggle |
| `PORT` | Number | `3000` | Server bind port |

## Quick Reference

```bash
# View all environment variables (non-secret)
env | grep -E "NODE_ENV|DATABASE|SUPABASE"

# Test configuration
npm run build  # Catches config issues

# Check pre-commit setup
pre-commit run --help

# Validate TypeScript config
npx tsc --showConfig -p config/tsconfig.json
```

---

**Last updated:** 2026-02-21

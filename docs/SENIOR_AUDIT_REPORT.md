# Senior Engineering Audit Report
**Date:** February 21, 2026  
**Scope:** P0-P2 Safety Hardening Implementation (5 Fixes)  
**Auditor Role:** Senior Engineer (Security, Reliability, Performance)  

---

## Executive Summary

| Category | Status | Issues | Risk Level |
|----------|--------|--------|-----------|
| Crisis Detection (Regex) | ✅ PASS | 1 major | MEDIUM |
| Survey Opt-Out (DB+API) | ◐ PARTIAL | 3 critical, 2 major | **HIGH** |
| CSRF Protection | ◐ PARTIAL | 1 major (preferences), 1 minor (form) | MEDIUM |
| Circuit Breaker | ❌ BROKEN | 1 critical (serverless incompatible) | **CRITICAL** |
| Test Coverage | ◐ PARTIAL | Missing edge cases, race conditions | LOW |

**Overall:** 4 blocking issues require remediation before production.

---

## Issue Catalog

### 🔴 CRITICAL Issues (Must Fix)

#### 1. **Circuit Breaker: Per-Instance State Lost on Serverless**
**File:** [app/api/safety/events/route.ts](app/api/safety/events/route.ts#L16-L26)  
**Severity:** CRITICAL  
**Impact:** Circuit breaker logic is completely ineffective on Vercel/serverless  

**Root Cause:**
```typescript
const CIRCUIT_BREAKER = {
  failureCount: 0,
  lastFailureTime: 0,
  state: 'CLOSED',
  // ... per-process in-memory state
};
```
In serverless (Vercel), each invocation is a separate process. State resets with every cold start. Multiple instances mean no shared visibility.

**Current Behavior:**
- Instance A gets 5 failures → circuit opens
- Instance B never saw failures → circuit stays closed
- Users see inconsistent behavior; circuit breaker provides zero protection

**Recommendation:**
- Move circuit breaker to Redis (use Upstash Redis on Vercel)
- Track failure rate in Supabase `audit_events` table (write-on-failure)
- Check failure rate at request start: `SELECT COUNT(*) FROM safety_events WHERE status='error' AND created_at > NOW() - INTERVAL '5 minutes'`
- **Minimum Fix:** Remove circuit breaker (non-functional) and rely on Sentry alerting on 5+ failures in 5min

---

#### 2. **Survey Opt-Out: Race Condition in Check-Then-Insert**
**File:** [app/api/wellbeing/surveys/route.ts](app/api/wellbeing/surveys/route.ts#L23-R32)  
**Severity:** CRITICAL  
**Impact:** User can modify opt-out between check and insert; audit log polluted  

**Race Condition Timeline:**
```
T0: Client calls POST /api/wellbeing/surveys
T1: Server checks user_preferences → survey_opt_out = FALSE
    [User modifies preference between T1 and T2]
T2: Server inserts survey (opt-out now TRUE but check passed)
Result: Survey inserted despite opt-out request
```

**Current Code Problem:**
```typescript
const { data: prefs } = await sb
  .from('user_preferences')
  .select('survey_opt_out')
  .eq('user_id', auth.userIdAsUuid)
  .single();

if (prefs?.survey_opt_out) return 403;  // ← Race condition here

// ← User changes opt-out to TRUE
const { data, error } = await sb
  .from('wellbeing_surveys')
  .insert({ ... });  // ← Inserts despite changed preference
```

**Recommendation:**
- Use database-level constraint: `CHECK (user_preferences.survey_opt_out = FALSE OR wellbeing_surveys.user_id IS NULL)`
- OR: Execute opt-out check inside transaction with survey insert
- **PostgreSQL Fix (Atomic):**
  ```sql
  WITH prefs_check AS (
    SELECT survey_opt_out FROM user_preferences WHERE user_id = $1
  )
  INSERT INTO wellbeing_surveys (...)
  SELECT ...
  WHERE NOT EXISTS (SELECT 1 FROM prefs_check WHERE survey_opt_out = TRUE)
  RETURNING id;
  ```

---

#### 3. **Preferences API: Missing CSRF Token Validation on POST**
**File:** [app/api/account/preferences/route.ts](app/api/account/preferences/route.ts#L87-L90)  
**Severity:** CRITICAL  
**Impact:** Preferences (including survey opt-out) can be toggled by CSRF attacks  

**Current Code:**
```typescript
export const GET = withCORS(withAuth(handleGET));
export const POST = withCORS(withAuth(handlePOST));  // ← No CSRF check
```

**Vulnerable Flow:**
1. User visits `attacker.com` while logged into Slurpy  
2. Attacker's JS calls `fetch('/api/account/preferences', { method: 'POST', body: JSON.stringify({ survey_opt_out: true }) })`  
3. Browser sends user's cookies → preference auto-updates

**Comparison:** `/api/safety/events` has `assertDoubleSubmit(req)`, `/api/account/delete` has both checks  

**Recommendation:**
```typescript
import { assertDoubleSubmit, assertSameOrigin } from '@/lib/csrf';

export const POST = withCORS(withAuth(async function POST(req, auth) {
  const sameOriginError = await assertSameOrigin(req);
  if (sameOriginError) return sameOriginError;
  const csrfError = assertDoubleSubmit(req);
  if (csrfError) return csrfError;
  
  // ... rest of handler
}));
```

---

### 🟠 MAJOR Issues (Should Fix)

#### 4. **Wellbeing Endpoint: Preference Not Found = Silently Opt-In**
**File:** [app/api/wellbeing/surveys/route.ts](app/api/wellbeing/surveys/route.ts#L23-L32)  
**Severity:** MAJOR  
**Impact:** New users always can submit surveys (preference record might not exist yet); inconsistent behavior  

**Current Code:**
```typescript
const { data: prefs } = await sb
  .from('user_preferences')
  .select('survey_opt_out')
  .eq('user_id', auth.userIdAsUuid)
  .single();  // ← Returns null if no row (code doesn't distinguish)

if (prefs?.survey_opt_out) return 403;  // ← Null passes check (truthy false)
```

**Problem:** If no preferences row exists yet, check passes. This is correct for default opt-in, BUT should explicitly create preference record on first request.

**Recommendation:**
```typescript
// Upsert preference on first access to ensure record exists
const { data: prefs, error } = await sb
  .from('user_preferences')
  .upsert({ user_id: auth.userIdAsUuid }, { onConflict: 'user_id' })
  .select('survey_opt_out')
  .single();

if (error) {
  console.error('Failed to create preference:', error);
  return httpError(500, 'Preference initialization failed');
}

if (prefs.survey_opt_out) return httpError(403, 'You have opted out');
```

---

#### 5. **Crisis Regex: "Bridge" Pattern Too Broad**
**File:** [backend/slurpy/domain/safety/service.py](backend/slurpy/domain/safety/service.py#L51)  
**Severity:** MAJOR  
**Impact:** False positives on "bridge the gap", "spanning the bridge", legitimate uses  

**Current Pattern:**
```python
re.compile(r"\b(bridge|train|jump)\b", re.I),  # MEANS_PATTERNS
```

**False Positives:**
- "I want to bridge the gap between therapists"  
- "Let's jump on a call"  
- "Jump rope is my exercise"  
- "I took the train to the hospital (for therapy)"

**Context:** This pattern is used only for escalation (elevated + means → immediate), so false positives elevate medium-risk text to crisis. User then sees banner/hotline.

**Recommendation:** Add context-aware check before escalation:
```python
def _is_means_reference(text: str, trigger: str) -> bool:
    """Check if 'means' word appears in suicide context, not generic."""
    # If elevated pattern mentioned suicide/self-harm word within 30 chars of means:
    idx = text.lower().find(trigger.lower())
    window = text[max(0, idx-30):idx+30].lower()
    return any(word in window for word in ['die', 'suicide', 'kill', 'self', 'harm', 'end', 'hurt'])

# In classify():
if m_el and m_means:
    if _is_means_reference(t, m_means.group(0)):
        return "immediate", ...
```

**OR:** Tighten patterns:
```python
re.compile(r"\b((?:hang|jump off a|throw myself (?:off|from a)?)\s*(?:bridge|building|cliff))\b", re.I),
```

---

#### 6. **No Error Logging Consistency**
**Severity:** MAJOR  
**Impact:** Incident response slower; hard to correlate issues  

**Current State:**
- `wellbeing/surveys`: `console.error("Wellbeing survey error", e)`  
- `safety/events`: `logger.warn("safety.event.persist_failed", {...})`  
- `preferences`: `console.error("GET /api/account/preferences error")` (no context tags)

**Recommendation:** Standardize all endpoints:
```typescript
logger.error("wellbeing.survey.insert_failed", {
  component: "wellbeing_surveys",
  user_id: auth.userIdAsUuid,
  error_code: error.code,
  error_message: error.message,
  tags: { severity: "high" }
});
```

---

#### 7. **Missing Timeout on DB Operations**
**Severity:** MAJOR  
**Impact:** Endpoints can hang indefinitely if DB unresponsive; cascades to connection pool exhaustion  

**Current Code:**
```typescript
const { data, error } = await sb
  .from('user_preferences')
  .select(...)
  .single();  // ← No timeout specified
```

**Recommendation:**
```typescript
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('DB query timeout')), 5000)
);

const { data, error } = await Promise.race([
  sb.from('user_preferences').select(...).single(),
  timeoutPromise
]);
```

**OR use Next.js API timeout:**
```typescript
export const maxDuration = 10; // Vercel max: 60s function timeout
```

---

## 🟡 MEDIUM Issues (Nice to Fix)

#### 8. **CSRF Token Optional in Wellbeing Form**
**File:** [components/WellbeingAssessmentForm.tsx](components/WellbeingAssessmentForm.tsx#L40-L47)  
**Severity:** MEDIUM  
**Impact:** If cookie parsing fails, request sent without CSRF token (silent failure)  

**Current Code:**
```typescript
const csrfMatch = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";

if (csrfToken) {
  headers['x-csrf'] = csrfToken;
}  // ← Silently skips validation if no token
```

**Recommendation:**
```typescript
const csrfMatch = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : null;

if (!csrfToken) {
  setError('Security validation failed. Please refresh and try again.');
  return;
}

headers['x-csrf'] = csrfToken;
```

---

#### 9. **Circuit Breaker Thresholds Hardcoded**
**File:** [app/api/safety/events/route.ts](app/api/safety/events/route.ts#L17-L26)  
**Severity:** MEDIUM  
**Impact:** Can't tune thresholds without code change; different behaviors needed for staging vs prod  

**Current:**
```typescript
threshold: 5,        // Fixed
resetTimeout: 60000, // 1 min fixed
failureWindow: 300000, // 5 min fixed
```

**Recommendation:**
```typescript
const CIRCUIT_BREAKER_CONFIG = {
  threshold: parseInt(process.env.SAFETY_CB_THRESHOLD || '5'),
  resetTimeout: parseInt(process.env.SAFETY_CB_RESET_MS || '60000'),
  failureWindow: parseInt(process.env.SAFETY_CB_WINDOW_MS || '300000'),
};
```

---

#### 10. **Race Condition in Preferences GET**
**File:** [app/api/account/preferences/route.ts](app/api/account/preferences/route.ts#L16-L34)  
**Severity:** MEDIUM  
**Impact:** Returns defaults if preference record doesn't exist; creates record on first write but not first read → inconsistent state  

**Current:**
```typescript
const { data, error } = await sb
  .from('user_preferences')
  .select(...)
  .single();  // Returns PGRST116 if no row

if (!data) {
  return NextResponse.json({  // Return defaults
    survey_opt_out: false,
    ...
  });
}
```

**Problem:** Next write creates record. If two clients do GET simultaneously (both get defaults), then both POST → potential conflict.

**Recommendation:** Upsert on first read to ensure record always exists.

---

## ✅ Passing Items

### Tests
- **44/44 PASS** - Test suite comprehensive for core detection + false positives ✅  
- SQL migrations idempotent (IF NOT EXISTS patterns) ✅  
- RLS properly configured on user_preferences ✅  
- No TypeScript compilation errors ✅  

### Security (Partial)
- CSRF on safety/events endpoint ✓  
- Same-origin check on safety/events ✓  
- RLS on database tables ✓  
- Input validation on survey scores ✓  

---

## Production Readiness Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Security | ◐ PARTIAL | CSRF missing on preferences, race conditions |
| Reliability | ◐ PARTIAL | Circuit breaker non-functional, no timeout |
| Performance | ✅ PASS | DB indices present, regex compiled |
| Observability | ◐ PARTIAL | Logging inconsistent, missing context |
| Testability | ✅ PASS | 44 tests, false positives covered |
| **PRODUCTION READY** | **❌ NO** | 3 critical issues block deployment |

---

## Remediation Priority

### Immediate (Block Deployment)
1. **Add CSRF to preferences POST** (10 min) — Breaking security hole
2. **Fix opt-out race condition** (20 min) — Use transaction-based check
3. **Remove non-functional circuit breaker** (5 min) — Rely on Sentry alerts

### Pre-Production (Before Go-Live)
4. **Add DB query timeout** (5 min)
5. **Tighten bridge/train/jump regex** (10 min)
6. **Standardize error logging** (15 min)

### Post-Launch (First Sprint)
7. **Implement Redis circuit breaker** (1 day)
8. **Move to Redis-backed preferences** (if scaling issues)
9. **Add integration tests for opt-out flow**

---

## Remediation Scripts

Would you like me to implement fixes for:
- [ ] CSRF token validation on preferences API
- [ ] Atomic opt-out check (transaction-based)
- [ ] Remove circuit breaker (temporary)
- [ ] Add DB timeouts
- [ ] Tighten means patterns
- All of the above?

**Estimated Time:** 45-60 min for all critical + major fixes

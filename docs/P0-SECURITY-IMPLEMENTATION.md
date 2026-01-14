# P0 Security Implementation: RLS & Profiles

## Overview
This implementation addresses critical security vulnerabilities:
1. **Missing Row-Level Security (RLS)** - All authenticated users could see/modify any user's data
2. **Unverified JWT Tokens** - Tokens not verified server-side, could be forged
3. **Volatile Plan Storage** - User plan stored in `auth.users.user_metadata`, not backed by database

## Changes Made

### 1. New Schema: Profiles Table
**File:** `migrations/rls-and-profiles.sql`

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT CHECK (plan IN ('FREE', 'PRO', 'ELITE')),
  plan_updated_at timestamp,
  voice_enabled boolean,
  created_at timestamp,
  updated_at timestamp
)
```

**Purpose:** Single source of truth for user plans and features. Replaces volatile `user_metadata`.

### 2. Row-Level Security Enabled
**File:** `migrations/rls-and-profiles.sql`

All tables now have RLS enabled:
- `ChatMessage` - Users can only see their own messages
- `ChatSession` - Users can only see their own sessions
- `DailyMood` - Users can only see their own moods
- `JournalEntry` - Users can only see their own entries
- `UserMemory` - Users can only see their own memories
- `InsightRun` - Users can only see their own insights
- `profiles` - Users can only see their own profile

**Policy Pattern:**
```sql
CREATE POLICY "table_select_own" ON table_name
FOR SELECT USING (userId = auth.uid()::text);
```

Service role can bypass all policies for admin operations.

### 3. Updated Plan Policy Library
**File:** `lib/plan-policy.ts`

```typescript
// New feature-flag pattern
export const PLAN_FEATURES = {
  free: { memory: false, insights: false, voice: false, ... },
  pro: { memory: true, insights: true, voice: false, ... },
  elite: { memory: true, insights: true, voice: true, ... },
};

// New unified function
export function canUseFeature(user, feature: 'memory' | 'insights' | 'voice'): boolean;

// Backward compatible aliases
export function canUseMemory(user);
export function canUseVoice(user);
```

**Benefits:**
- ✅ Removed duplicate `canUseInsightsMemory()` function
- ✅ Single feature-flag source of truth
- ✅ Easy to add new plan tiers or features
- ✅ Voice feature now available for `elite` plan

### 4. Database Plan Retrieval
**File:** `lib/plan-db.ts` (NEW)

Server-side only functions for authoritative plan checks:

```typescript
// Get user's plan from profiles table (with fallback to metadata)
export async function getUserPlanFromDB(userId: string): Promise<Plan>;

// Initialize profile for new user
export async function initializeUserProfile(userId: string, plan: Plan): Promise<void>;

// Update user's plan (for payment processing)
export async function updateUserPlan(userId: string, newPlan: Plan): Promise<void>;

// Idempotent profile creation
export async function ensureUserProfile(userId: string): Promise<void>;
```

**Usage:**
```typescript
import { getUserPlanFromDB } from "@/lib/plan-db";

// In API endpoint:
const userPlan = await getUserPlanFromDB(userId);
if (!canUseFeature(userPlan, "voice")) {
  return Response.json({ error: "Voice requires Elite plan" }, { status: 403 });
}
```

### 5. Centralized API Auth Middleware
**File:** `lib/api-auth.ts` (NEW)

Replaces scattered `getAuthOrThrow()` calls with consistent, verified authentication:

```typescript
// With decorator pattern
export const POST = withAuth(async (request, auth) => {
  // auth.userId, auth.bearer, auth.email
  return Response.json({ success: true });
});

// Or manual extraction
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request); // Throws UnauthorizedError if no auth
  // ... handler logic
}

// For optional auth
export const GET = withOptionalAuth(async (request, auth) => {
  if (auth) {
    // Authenticated
  } else {
    // Not authenticated
  }
});
```

**Benefits:**
- ✅ JWT tokens verified via Supabase admin API
- ✅ Consistent error responses across all endpoints
- ✅ Supports Authorization header and `__session` cookie
- ✅ Reusable across all API routes

## Migration Steps

### Phase 1: Apply Database Changes (IMMEDIATE)
1. Run `migrations/rls-and-profiles.sql` in Supabase SQL editor
2. Verify tables have RLS enabled:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%';
   ```
   All should show `rowsecurity = true`

3. Populate profiles for existing users:
   ```sql
   INSERT INTO profiles (user_id, plan)
   SELECT id, 'FREE' FROM auth.users
   WHERE id NOT IN (SELECT user_id FROM profiles)
   ON CONFLICT DO NOTHING;
   ```

### Phase 2: Update Auth Checks (NEXT 24 HOURS)
1. Replace `getAuthOrThrow()` in API routes with `withAuth()` decorator:
   ```typescript
   // Before:
   export async function POST(request: NextRequest) {
     const { userId } = await getAuthOrThrow();
     // ...
   }

   // After:
   export const POST = withAuth(async (request, auth) => {
     const userId = auth.userId;
     // ...
   });
   ```

2. Files to update (grep found 20+ matches):
   - `app/api/stripe/create-session/route.ts`
   - `app/api/proxy-chat/route.ts`
   - `app/api/proxy-chat-stream/route.ts`
   - `app/api/account/delete/route.ts`
   - `app/api/purge-user/route.ts`
   - `app/api/analytics/summary/route.ts`
   - `app/api/calendar/route.ts`
   - `app/api/calendar/event/route.ts`
   - `app/api/geo/ping/route.ts`
   - Plus any other routes using `getAuthOrThrow`

### Phase 3: Update Plan Checks (NEXT 48 HOURS)
1. Replace plan checks in API routes:
   ```typescript
   // Before:
   if (!canUseMemory(user)) {
     return Response.json({ error: "Not authorized" }, { status: 403 });
   }

   // After:
   const userPlan = await getUserPlanFromDB(userId);
   if (!canUseFeature(userPlan, "memory")) {
     return Response.json({ error: "Memory requires Pro plan" }, { status: 403 });
   }
   ```

2. Update Stripe webhook to call `updateUserPlan()` when subscription changes

### Phase 4: Test & Verify (ONGOING)
1. **Test RLS in Supabase SQL editor:**
   ```sql
   -- As authenticated user
   SELECT * FROM "ChatMessage"; -- Should only return their messages
   
   -- As service_role (in API)
   -- Should return all messages
   ```

2. **Test API auth errors:**
   ```bash
   # Should fail with 401
   curl -X POST http://localhost:3000/api/stripe/create-session

   # Should succeed
   curl -X POST http://localhost:3000/api/stripe/create-session \
     -H "Authorization: Bearer $TOKEN"
   ```

3. **Verify plan enforcement:**
   - Free user tries voice chat → 403 "Requires Elite plan"
   - Pro user tries voice chat → 403 "Requires Elite plan"
   - Elite user uses voice chat → ✅ Success

## Backward Compatibility

### During Migration
- Old `canUseMemory()` and `canUseInsightsMemory()` still work (deprecated)
- `user_metadata.plan` still checked if `profiles.plan` not found
- New routes can use `lib/api-auth.ts`, old routes still work with `lib/auth-server.ts`

### Full Migration Timeline
- **Week 1:** Apply schema, populate profiles, deploy RLS
- **Week 2:** Update high-traffic API endpoints (chat, insights)
- **Week 3:** Update remaining endpoints, remove old auth helpers
- **Week 4:** Complete deprecation, monitor for issues

## Rollback Plan (If Needed)
```sql
-- Disable RLS (NOT RECOMMENDED for production)
ALTER TABLE "ChatMessage" DISABLE ROW LEVEL SECURITY;
-- ... repeat for all tables

-- Drop profiles table (keep a backup!)
DROP TABLE profiles CASCADE;
```

## Testing Checklist
- [ ] Profiles table created and populated
- [ ] RLS enabled on all data tables
- [ ] New auth middleware works
- [ ] Old auth still works (backward compatible)
- [ ] Plan features correctly gated
- [ ] Voice feature shows as locked for non-Elite users
- [ ] JWT tokens verified server-side
- [ ] Service role can still perform admin operations
- [ ] No 403 errors for legitimate requests
- [ ] Chat, insights, memory all work with RLS enabled

## Security Verification
```bash
# Test that user A cannot see user B's data (should return empty)
curl -X GET http://localhost:3000/api/chat/messages \
  -H "Authorization: Bearer userA_token"
# Should only return userA's messages

# Test that service role (via server) can see all data
# (This is internal-only, tested via admin operations)
```

## Documentation Updates
- [x] This migration guide
- [ ] API endpoint docs (requireAuth instead of getAuthOrThrow)
- [ ] Feature gate docs (canUseFeature pattern)
- [ ] Deployment guide (migration order)
- [ ] Runbook (troubleshooting RLS issues)

## Questions & Concerns

**Q: Will RLS break existing code?**
A: Yes, but only code that improperly accesses other users' data (which was a bug). We have backward compatibility for auth during transition.

**Q: What if RLS is too slow?**
A: Indexes on (userId, timestamp) in migration should mitigate. Monitor query performance in first week.

**Q: How do we handle service-to-service calls?**
A: Use `lib/plan-db.ts` with service role client, which bypasses RLS. Never exposed to user requests.

**Q: Can we still use Prisma?**
A: Yes, Prisma respects RLS if you're connected as an authenticated user. For admin operations, use service role client.

## Next Steps
1. **Execute Phase 1** - Apply SQL migration (1 hour)
2. **Execute Phase 2** - Update API endpoints (4 hours)
3. **Execute Phase 3** - Integrate with Stripe webhook (1 hour)
4. **Execute Phase 4** - Testing & monitoring (2 hours)

**Total: ~8 hours to full security implementation**

Then voice chat feature (P6) can be safely implemented as premium feature.

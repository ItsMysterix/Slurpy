# Database Schema & Migration Guide

**Last Updated:** January 14, 2026  
**Status:** 🔴 **Critical Actions Required**

---

## Quick Reference

### Current Database State
- **PascalCase Tables:** `ChatMessage`, `ChatSession`, `DailyMood`, `JournalEntry`, `UserMemory`, `InsightRun`
- **Missing Tables:** `profiles`, `calendar_events`, `users_roles`, `billing_customers`, `webhook_events`
- **snake_case Views:** Missing (needed for code compatibility)
- **RLS Status:** ❌ **DISABLED** on all tables (CRITICAL SECURITY ISSUE)

### Tables Used in Application

| Table Name | Used As (snake_case) | Status | Priority |
|------------|---------------------|--------|----------|
| ChatMessage | chat_messages | ✅ Exists | P0 |
| ChatSession | chat_session, chat_sessions | ✅ Exists | P0 |
| DailyMood | daily_mood | ✅ Exists | P0 |
| JournalEntry | journal_entries | ✅ Exists | P0 |
| UserMemory | user_memory | ✅ Exists | P0 |
| InsightRun | insight_run | ✅ Exists | P0 |
| profiles | profiles | ❌ Missing | P0 |
| calendar_events | calendar_events | ❌ Missing | P0 |
| users_roles | users_roles | ❌ Missing | P1 |
| billing_customers | billing_customers | ❌ Missing | P1 |
| webhook_events | webhook_events | ❌ Missing | P1 |

---

## 🚨 CRITICAL: Apply Migrations Immediately

### Step 1: Backup Database
```bash
# Set your DATABASE_URL
export DATABASE_URL="your-supabase-connection-string"

# Create backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Apply Comprehensive Schema Fix
```bash
# Apply the comprehensive migration
psql $DATABASE_URL -f migrations/20260114_comprehensive_schema_fix.sql

# This migration will:
# 1. Create all missing tables (profiles, calendar_events, users_roles, billing_customers, webhook_events)
# 2. Create snake_case views for all PascalCase tables
# 3. Add all necessary indexes
# 4. Enable RLS on all user data tables
# 5. Create proper RLS policies
# 6. Fix grant permissions
```

### Step 3: Apply RLS to Existing Tables
```bash
# Apply RLS policies to existing PascalCase tables
psql $DATABASE_URL -f migrations/rls-and-profiles.sql
```

### Step 4: Verify Migration Success
```bash
# Check all tables have RLS enabled
psql $DATABASE_URL -c "
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT LIKE '_prisma%'
ORDER BY tablename;"

# Expected: All tables should show rowsecurity = true

# Check all views exist
psql $DATABASE_URL -c "
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
ORDER BY table_name;"

# Expected views: daily_mood, chat_session, chat_sessions, chat_messages, journal_entries, user_memory

# Check RLS policies
psql $DATABASE_URL -c "
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;"

# Expected: Each table should have SELECT, INSERT, UPDATE, DELETE policies
```

### Step 5: Update schema.sql
```bash
# Re-dump the schema to capture all changes
pg_dump $DATABASE_URL \
  --schema=public \
  --no-owner \
  --no-acl \
  --no-comments \
  > schema.sql

# Commit the updated schema
git add schema.sql migrations/20260114_comprehensive_schema_fix.sql
git commit -m "feat: Apply comprehensive schema fix - add missing tables, views, and RLS"
```

---

## Understanding the Naming Convention Issue

### The Problem
Your codebase uses **both** PascalCase and snake_case for the same tables:

```typescript
// Some code uses PascalCase (matches schema.sql)
await supabase.from("ChatMessage").select("*");
await supabase.from("UserMemory").select("*");

// Other code uses snake_case (PostgreSQL convention)
await supabase.from("chat_messages").select("*");
await supabase.from("user_memory").select("*");
```

### The Solution
The migration creates **views** that map snake_case names to PascalCase tables:

```sql
-- View allows code to use snake_case while table remains PascalCase
CREATE VIEW "chat_messages" AS 
SELECT 
    "id",
    "sessionId" as "session_id",
    "userId" as "user_id",
    -- ... other columns
FROM "ChatMessage";
```

**Result:** Both naming conventions work! No code changes needed.

---

## Table Definitions

### Core Data Tables (PascalCase)

#### ChatMessage
- **Purpose:** Stores individual chat messages
- **Key Fields:** id, sessionId, userId, role, content, timestamp
- **Indexes:** sessionId, userId, timestamp
- **RLS:** Users can only access messages from their own sessions

#### ChatSession
- **Purpose:** Groups chat messages into sessions
- **Key Fields:** sessionId, userId, dominantEmotion, summary
- **Indexes:** userId, createdAt
- **RLS:** Users can only access their own sessions

#### DailyMood
- **Purpose:** Tracks daily mood check-ins
- **Key Fields:** id, userId, emotion, intensity, fruit
- **Indexes:** userId, createdAt
- **RLS:** Users can only access their own mood data

#### JournalEntry
- **Purpose:** User journal entries
- **Key Fields:** id, userId, title, content, date, emotion, tags
- **Indexes:** userId, date, createdAt
- **RLS:** Users can only access their own journal entries

#### UserMemory
- **Purpose:** Long-term memory system for pro users
- **Key Fields:** id, userId, summary, sourceType, sourceId
- **Indexes:** userId, createdAt, sourceType
- **RLS:** Users can only access their own memories

#### InsightRun
- **Purpose:** Weekly insight generation results
- **Key Fields:** id, user_id, time_range_start, time_range_end, narrative
- **Indexes:** user_id, created_at
- **RLS:** Users can only access their own insights
- **Constraints:** Unique(user_id, time_range_start, time_range_end)

### New Tables (snake_case)

#### profiles
- **Purpose:** User plan and settings
- **Key Fields:** id, user_id (uuid FK to auth.users), plan, voice_enabled
- **Indexes:** user_id, plan
- **RLS:** Users can view/edit their own profile
- **Used By:** `/api/stripe/*`, plan-policy checks

#### calendar_events
- **Purpose:** User calendar events with mood/location data
- **Key Fields:** id, user_id, date, title, location_*, emotion, intensity
- **Indexes:** user_id, date, composite (user_id, date)
- **RLS:** Users can CRUD their own events
- **Used By:** `/api/calendar/*`, Calendar page

#### users_roles
- **Purpose:** Role-based access control
- **Key Fields:** id, user_id, role (user|ops|admin)
- **Indexes:** user_id
- **RLS:** Users can view own roles, service role can manage
- **Used By:** `lib/authz.ts` authorization checks

#### billing_customers
- **Purpose:** Stripe customer linkage
- **Key Fields:** id, user_id (uuid FK), stripe_customer_id
- **Indexes:** user_id, stripe_customer_id
- **RLS:** Users can view own, service role can manage
- **Used By:** `/api/stripe/webhook`

#### webhook_events
- **Purpose:** Webhook event log
- **Key Fields:** id, event_type, payload (jsonb), processed
- **Indexes:** event_type, processed
- **RLS:** Service role only
- **Used By:** `/api/stripe/webhook`

---

## Views (snake_case → PascalCase mapping)

| View Name | Source Table | Purpose |
|-----------|--------------|---------|
| daily_mood | DailyMood | snake_case access to mood data |
| chat_session | ChatSession | snake_case access to sessions (singular) |
| chat_sessions | ChatSession | snake_case access to sessions (plural) |
| chat_messages | ChatMessage | snake_case access to messages |
| journal_entries | JournalEntry | snake_case access to journal |
| user_memory | UserMemory | snake_case access to memory (if table exists) |

**Column Mapping:** Views automatically convert PascalCase columns to snake_case:
- `userId` → `user_id`
- `createdAt` → `created_at`
- `dominantEmotion` → `dominant_emotion`
- etc.

---

## RLS (Row Level Security) Policies

### Standard User Data Pattern
Every user data table should have these 4 policies:

1. **SELECT** - Users can view their own data
   ```sql
   CREATE POLICY "table_select_own" ON "table"
       FOR SELECT USING (auth.uid()::text = "user_id");
   ```

2. **INSERT** - Users can create their own data
   ```sql
   CREATE POLICY "table_insert_own" ON "table"
       FOR INSERT WITH CHECK (auth.uid()::text = "user_id");
   ```

3. **UPDATE** - Users can update their own data
   ```sql
   CREATE POLICY "table_update_own" ON "table"
       FOR UPDATE USING (auth.uid()::text = "user_id")
       WITH CHECK (auth.uid()::text = "user_id");
   ```

4. **DELETE** - Users can delete their own data
   ```sql
   CREATE POLICY "table_delete_own" ON "table"
       FOR DELETE USING (auth.uid()::text = "user_id");
   ```

5. **Service Role Bypass** (for admin operations)
   ```sql
   CREATE POLICY "table_service_role" ON "table"
       USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
   ```

### Special Cases

- **InsightRun:** No UPDATE policy (append-only)
- **users_roles:** SELECT only for users, service role manages
- **webhook_events:** Service role only
- **billing_customers:** Read-only for users

---

## Migration Files Reference

### Applied Migrations
1. **`migrations/add_user_memory_table.sql`** - Creates UserMemory table
2. **`migrations/20250115_create_insight_run_table.sql`** - Creates insight_run table
3. **`migrations/rls-and-profiles.sql`** - Enables RLS on PascalCase tables, creates profiles

### New Migrations (Apply Now)
4. **`migrations/20260114_comprehensive_schema_fix.sql`** - 🚨 **APPLY THIS NOW**
   - Creates missing tables: calendar_events, users_roles, billing_customers, webhook_events
   - Creates all snake_case views
   - Adds indexes
   - Enables RLS on new tables
   - Creates RLS policies
   - Fixes grant permissions

---

## Common Issues & Fixes

### Issue 1: "relation does not exist"
**Error:** `relation "public.profiles" does not exist`

**Cause:** Missing table or view

**Fix:** Apply migrations in order:
```bash
psql $DATABASE_URL -f migrations/20260114_comprehensive_schema_fix.sql
```

### Issue 2: "permission denied for table"
**Error:** `permission denied for table chat_messages`

**Cause:** RLS not enabled or policies missing

**Fix:** Enable RLS and create policies:
```bash
psql $DATABASE_URL -f migrations/rls-and-profiles.sql
```

### Issue 3: "column does not exist"
**Error:** `column "user_id" does not exist`

**Cause:** Code using snake_case on PascalCase table without view

**Fix:** Ensure views are created:
```bash
psql $DATABASE_URL -f migrations/20260114_comprehensive_schema_fix.sql
```

### Issue 4: Users can see other users' data
**Cause:** RLS not enabled

**Fix:** Immediately enable RLS:
```bash
psql $DATABASE_URL -c "ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;"
# Then create policies
```

---

## Testing After Migration

### 1. Test RLS Works
```typescript
// Test script: test-rls.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign in as User 1
const { data: { session: session1 } } = await supabase.auth.signInWithPassword({
  email: 'user1@test.com',
  password: 'password123'
});

// Try to fetch data - should only see User 1's data
const { data, error } = await supabase
  .from('chat_messages')
  .select('*');

console.log('User 1 messages:', data?.length);

// Sign in as User 2
const { data: { session: session2 } } = await supabase.auth.signInWithPassword({
  email: 'user2@test.com',
  password: 'password123'
});

// Try to fetch data - should only see User 2's data
const { data: data2 } = await supabase
  .from('chat_messages')
  .select('*');

console.log('User 2 messages:', data2?.length);

// If both users see each other's data, RLS is not working!
```

### 2. Test Views Work
```sql
-- Test snake_case views
SELECT COUNT(*) FROM chat_messages;
SELECT COUNT(*) FROM journal_entries;
SELECT COUNT(*) FROM daily_mood;

-- Should return data (if any exists)
```

### 3. Test Missing Tables Created
```sql
-- Check all tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Expected: profiles, calendar_events, users_roles, billing_customers, webhook_events
```

---

## Maintenance

### Adding a New Table
1. Create table in migration file with proper types
2. Add indexes for frequently queried columns
3. Enable RLS: `ALTER TABLE "table" ENABLE ROW LEVEL SECURITY;`
4. Create 4 standard policies (SELECT, INSERT, UPDATE, DELETE)
5. Create service role bypass policy
6. Grant permissions (revoke from anon, grant to authenticated)
7. If PascalCase, create snake_case view
8. Update schema.sql: `pg_dump $DATABASE_URL --schema=public > schema.sql`
9. Document in this file

### Renaming a Table
1. **Don't rename directly** - use a view instead
2. Create view with new name pointing to old table
3. Gradually migrate code to use new name
4. Eventually rename table and drop view

---

## Security Checklist

- [ ] All user data tables have RLS enabled
- [ ] Each table has SELECT, INSERT, UPDATE, DELETE policies
- [ ] Service role bypass policies exist
- [ ] `anon` role has NO access to user data tables
- [ ] `authenticated` role has minimal required permissions
- [ ] Foreign keys reference `auth.users(id)` with CASCADE
- [ ] Indexes exist on all `user_id` columns
- [ ] Views have proper permissions
- [ ] Tested with multiple user accounts
- [ ] schema.sql is up to date with database

---

## Contact & Support

For issues with schema or migrations:
1. Check this guide first
2. Review `SECURITY_AUDIT_COMPLETE.md` for auth issues
3. Check Supabase dashboard for RLS status
4. Test with `psql` commands above

**Emergency:** If data is exposed (RLS not working):
```bash
# Immediately disable anon access
psql $DATABASE_URL -c "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;"

# Then apply RLS migrations ASAP
```

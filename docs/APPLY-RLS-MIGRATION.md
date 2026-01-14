# Apply P0 Security Migration

## Quick Start (5 minutes)

### Step 1: Access Supabase SQL Editor
1. Go to https://app.supabase.com → Your Project
2. Click "SQL Editor" in left sidebar
3. Click "+ New Query"

### Step 2: Copy & Paste Migration
1. Open `/migrations/rls-and-profiles.sql`
2. Copy entire contents
3. Paste into Supabase SQL editor
4. Click "Run"

### Step 3: Verify Success
Run this query to confirm all tables have RLS enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename NOT LIKE '_prisma%'
ORDER BY tablename;
```

Expected output:
```
ChatMessage      | true
ChatSession      | true
DailyMood        | true
InsightRun       | true
JournalEntry     | true
UserMemory       | true
profiles         | true
```

### Step 4: Populate Existing Users
```sql
INSERT INTO profiles (user_id, plan)
SELECT id, 'FREE' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profiles)
ON CONFLICT DO NOTHING;
```

Check how many profiles were created:
```sql
SELECT COUNT(*) FROM profiles;
```

### Step 5: Verify RLS Policies
List all policies created:
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Should see ~5 policies per table (select, insert, update, delete, service_role bypass).

## Testing RLS Works (Optional)

### Test as Authenticated User
In Supabase, you can't directly test RLS permissions. Instead, test via the application:

```bash
# Get your auth token from browser DevTools
# Application → Cookies → __session

# Test that you can only see YOUR messages
curl "http://localhost:3000/api/chat/messages" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should only return YOUR messages, not others'
```

### Test Profiles Table
```bash
# Get your profile
curl "http://localhost:3000/api/user/profile" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return YOUR profile only
```

## Troubleshooting

### Error: "relation profiles does not exist"
- Migration didn't run successfully
- Check for errors in Supabase SQL editor
- Retry the migration

### Error: "FOREIGN KEY constraint"
- auth.users reference might be wrong
- Try this fix:
```sql
DROP TABLE IF EXISTS profiles CASCADE;
-- Then re-run migration
```

### RLS seems too strict (users can't access data)
- Verify `auth.uid()` is being called correctly
- Check that userId in tables is stored as TEXT (UUID)
- Verify policies are selecting `auth.uid()::text`

## Rollback (If Needed)

**⚠️ ONLY if something breaks:**

```sql
-- Disable RLS (temporarily)
ALTER TABLE "ChatMessage" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatSession" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyMood" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "UserMemory" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "InsightRun" DISABLE ROW LEVEL SECURITY;

-- Keep profiles table (useful to have)
-- Don't delete unless absolutely necessary
```

Then investigate what broke before re-enabling.

## Next: Update API Routes

After migration is applied, see `docs/P0-SECURITY-IMPLEMENTATION.md` Phase 2 for updating API routes.

Files to update (grep results):
- `app/api/stripe/create-session/route.ts`
- `app/api/proxy-chat/route.ts`
- `app/api/proxy-chat-stream/route.ts`
- `app/api/account/delete/route.ts`
- `app/api/purge-user/route.ts`
- `app/api/analytics/summary/route.ts`
- `app/api/calendar/route.ts`
- `app/api/calendar/event/route.ts`
- `app/api/geo/ping/route.ts`

## Support

If migration fails:
1. Check Supabase logs: https://app.supabase.com → Logs
2. Verify no other migrations are running
3. Check database size (should have space)
4. Try running smaller chunks of SQL separately

Questions? Check the docs in this folder or the Supabase docs.

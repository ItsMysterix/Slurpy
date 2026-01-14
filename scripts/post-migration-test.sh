#!/bin/bash

# POST-MIGRATION SMOKE TEST
# Verifies Sprint 1 and Sprint 2 functionality after applying migrations

set -e

echo "========================================="
echo "POST-MIGRATION SMOKE TEST"
echo "========================================="
echo ""

source .env.backend

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASS_COUNT=0
FAIL_COUNT=0

# Helper functions
log_test() {
  echo "TEST: $1"
}

log_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((PASS_COUNT++))
}

log_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((FAIL_COUNT++))
}

log_warn() {
  echo -e "${YELLOW}⚠ WARN${NC}: $1"
}

echo "========================================="
echo "1. DATABASE CONNECTIVITY TESTS"
echo "========================================="
echo ""

# Test 1.1: Can connect to database
log_test "Connectivity to Supabase"
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  log_pass "Database connection successful"
else
  log_fail "Cannot connect to database"
  exit 1
fi

# Test 1.2: UserMemory table exists
log_test "UserMemory table exists"
if psql "$DATABASE_URL" -c "\dt UserMemory" | grep -q "UserMemory"; then
  log_pass "UserMemory table found"
else
  log_fail "UserMemory table not found"
fi

# Test 1.3: insight_run table exists
log_test "insight_run table exists"
if psql "$DATABASE_URL" -c "\dt insight_run" | grep -q "insight_run"; then
  log_pass "insight_run table found"
else
  log_fail "insight_run table not found"
fi

echo ""
echo "========================================="
echo "2. RLS POLICY TESTS"
echo "========================================="
echo ""

# Test 2.1: UserMemory RLS enabled
log_test "UserMemory RLS is enabled"
RLS_STATUS=$(psql "$DATABASE_URL" -t -c "SELECT rowsecurity FROM pg_tables WHERE tablename = 'UserMemory';" | tr -d ' ')
if [ "$RLS_STATUS" = "t" ]; then
  log_pass "UserMemory RLS enabled"
else
  log_fail "UserMemory RLS not enabled"
fi

# Test 2.2: insight_run RLS enabled
log_test "insight_run RLS is enabled"
RLS_STATUS=$(psql "$DATABASE_URL" -t -c "SELECT rowsecurity FROM pg_tables WHERE tablename = 'insight_run';" | tr -d ' ')
if [ "$RLS_STATUS" = "t" ]; then
  log_pass "insight_run RLS enabled"
else
  log_fail "insight_run RLS not enabled"
fi

# Test 2.3: UserMemory has SELECT policy
log_test "UserMemory has SELECT policy"
if psql "$DATABASE_URL" -t -c "SELECT policyname FROM pg_policies WHERE tablename = 'UserMemory' AND cmd = 'SELECT';" | grep -q "."; then
  log_pass "UserMemory SELECT policy found"
else
  log_fail "UserMemory SELECT policy missing"
fi

# Test 2.4: insight_run has DELETE policy (but no UPDATE)
log_test "insight_run has DELETE policy"
if psql "$DATABASE_URL" -t -c "SELECT policyname FROM pg_policies WHERE tablename = 'insight_run' AND cmd = 'DELETE';" | grep -q "."; then
  log_pass "insight_run DELETE policy found"
else
  log_fail "insight_run DELETE policy missing"
fi

log_test "insight_run does NOT have UPDATE policy (append-only)"
if ! psql "$DATABASE_URL" -t -c "SELECT policyname FROM pg_policies WHERE tablename = 'insight_run' AND cmd = 'UPDATE';" | grep -q "."; then
  log_pass "insight_run correctly has no UPDATE policy"
else
  log_fail "insight_run incorrectly has UPDATE policy"
fi

echo ""
echo "========================================="
echo "3. SCHEMA STRUCTURE TESTS"
echo "========================================="
echo ""

# Test 3.1: UserMemory columns
log_test "UserMemory has required columns"
COLUMNS=$(psql "$DATABASE_URL" -t -c "SELECT string_agg(column_name, ', ') FROM information_schema.columns WHERE table_name = 'UserMemory';" | xargs)
if echo "$COLUMNS" | grep -q "id" && echo "$COLUMNS" | grep -q "userId" && echo "$COLUMNS" | grep -q "summary"; then
  log_pass "UserMemory core columns present: id, userId, summary"
else
  log_fail "UserMemory missing required columns"
fi

# Test 3.2: insight_run columns  
log_test "insight_run has required columns"
COLUMNS=$(psql "$DATABASE_URL" -t -c "SELECT string_agg(column_name, ', ') FROM information_schema.columns WHERE table_name = 'insight_run';" | xargs)
if echo "$COLUMNS" | grep -q "user_id" && echo "$COLUMNS" | grep -q "narrative_summary" && echo "$COLUMNS" | grep -q "dominant_emotions"; then
  log_pass "insight_run core columns present: user_id, narrative_summary, dominant_emotions"
else
  log_fail "insight_run missing required columns"
fi

# Test 3.3: insight_run UNIQUE constraint
log_test "insight_run has unique constraint on (user_id, time_range_start, time_range_end)"
if psql "$DATABASE_URL" -t -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'insight_run' AND constraint_type = 'UNIQUE';" | grep -q "insight_run_user_id_time_range_start"; then
  log_pass "insight_run UNIQUE constraint found"
else
  log_fail "insight_run UNIQUE constraint missing"
fi

echo ""
echo "========================================="
echo "4. DATA INTEGRITY TESTS"
echo "========================================="
echo ""

# Test 4.1: UserMemory is empty
log_test "UserMemory starts empty"
COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM \"UserMemory\";" | tr -d ' ')
if [ "$COUNT" = "0" ]; then
  log_pass "UserMemory is empty (as expected)"
else
  log_warn "UserMemory has $COUNT existing rows"
fi

# Test 4.2: insight_run is empty
log_test "insight_run starts empty"
COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM insight_run;" | tr -d ' ')
if [ "$COUNT" = "0" ]; then
  log_pass "insight_run is empty (as expected)"
else
  log_warn "insight_run has $COUNT existing rows"
fi

echo ""
echo "========================================="
echo "5. FOREIGN KEY TESTS"
echo "========================================="
echo ""

# Test 5.1: UserMemory foreign key to chat_sessions
log_test "UserMemory has foreign key to chat_sessions"
if psql "$DATABASE_URL" -t -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'UserMemory' AND constraint_type = 'FOREIGN KEY';" | grep -q "."; then
  log_pass "UserMemory foreign key constraint found"
else
  log_warn "UserMemory foreign key constraint not found (optional)"
fi

# Test 5.2: insight_run foreign key to auth.users
log_test "insight_run has foreign key to auth.users"
if psql "$DATABASE_URL" -t -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'insight_run' AND constraint_type = 'FOREIGN KEY';" | grep -q "."; then
  log_pass "insight_run foreign key constraint found"
else
  log_fail "insight_run foreign key constraint missing"
fi

echo ""
echo "========================================="
echo "6. INDEX TESTS"
echo "========================================="
echo ""

# Test 6.1: UserMemory indices
log_test "UserMemory has indices for performance"
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'UserMemory';" | tr -d ' ')
if [ "$INDEX_COUNT" -ge 3 ]; then
  log_pass "UserMemory has $INDEX_COUNT indices"
else
  log_warn "UserMemory has only $INDEX_COUNT indices (expected >= 3)"
fi

# Test 6.2: insight_run indices
log_test "insight_run has indices for performance"
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'insight_run';" | tr -d ' ')
if [ "$INDEX_COUNT" -ge 3 ]; then
  log_pass "insight_run has $INDEX_COUNT indices"
else
  log_warn "insight_run has only $INDEX_COUNT indices (expected >= 3)"
fi

echo ""
echo "========================================="
echo "7. MIGRATION FILE VALIDATION"
echo "========================================="
echo ""

# Test 7.1: Migration files exist
log_test "Migration file add_user_memory_table.sql exists"
if [ -f "migrations/add_user_memory_table.sql" ]; then
  log_pass "Migration file found"
else
  log_fail "Migration file missing"
fi

log_test "Migration file 20250115_create_insight_run_table.sql exists"
if [ -f "migrations/20250115_create_insight_run_table.sql" ]; then
  log_pass "Migration file found"
else
  log_fail "Migration file missing"
fi

echo ""
echo "========================================="
echo "8. TYPE DEFINITIONS VALIDATION"
echo "========================================="
echo ""

# Test 8.1: Type definitions exist
log_test "types/index.ts defines InsightRun type"
if [ -f "types/index.ts" ] && grep -q "interface InsightRun" types/index.ts; then
  log_pass "InsightRun type defined"
else
  log_fail "InsightRun type not found"
fi

log_test "lib/memory-types.ts or types/index.ts defines memory types"
if [ -f "lib/memory-types.ts" ] || ([ -f "types/index.ts" ] && grep -q "UserMemory" types/index.ts); then
  log_pass "Memory types defined"
else
  log_fail "Memory types not found"
fi

echo ""
echo "========================================="
echo "SUMMARY"
echo "========================================="
echo ""
echo -e "✓ Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "✗ Failed: ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}All critical tests passed!${NC}"
  echo "Ready to run full integration tests."
  exit 0
else
  echo -e "${RED}Some tests failed. Review errors above.${NC}"
  exit 1
fi

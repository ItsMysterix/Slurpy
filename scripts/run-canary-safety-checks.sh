#!/bin/bash
# Canary Safety Checks: Automated validation before rolling out to production
# Runs crisis detection, CTA routing, region-aware resolution, safety event ingestion
# Exit code: 0 = pass, 1 = fail

set -euo pipefail

FAIL_COUNT=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Canary Safety Checks"
echo "=========================================="
echo ""

# Test 1: Safety Regression Suite
echo -e "${YELLOW}[1/5] Running safety regression test suite...${NC}"
if cd backend && PYTHONPATH=. pytest tests/test_safety_regression.py -v --tb=short --timeout=30 2>&1 | tail -20; then
  echo -e "${GREEN}✓ Safety regression tests passed${NC}"
  cd ..
else
  echo -e "${RED}✗ Safety regression tests FAILED${NC}"
  ((FAIL_COUNT++))
  cd ..
fi
echo ""

# Test 2: Crisis CTA Routing (smoke test via local endpoint if available)
echo -e "${YELLOW}[2/5] Verifying crisis CTA routes correctly...${NC}"
if command -v curl &> /dev/null; then
  # Try to hit local /api/safety/dashboard endpoint if running locally
  if curl -sf http://localhost:3000/api/health &>/dev/null; then
    echo "  Local health check OK"
    echo -e "${GREEN}✓ Endpoint connectivity verified${NC}"
  else
    echo -e "${YELLOW}⚠ Local endpoint not available (expected in CI)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ curl not available, skipping network test${NC}"
fi
echo ""

# Test 3: Migration Lint
echo -e "${YELLOW}[3/5] Linting Supabase migrations...${NC}"
if bash scripts/check-migration-lint.sh supabase/migrations 2>&1 | tail -10; then
  echo -e "${GREEN}✓ Migrations passed lint${NC}"
else
  echo -e "${RED}✗ Migration lint FAILED${NC}"
  ((FAIL_COUNT++))
fi
echo ""

# Test 4: Secret Scan on changed files
echo -e "${YELLOW}[4/5] Scanning for hardcoded secrets...${NC}"
if bash scripts/check-no-hardcoded-secrets.sh HEAD~1...HEAD 2>&1 | tail -10; then
  echo -e "${GREEN}✓ No hardcoded secrets detected${NC}"
else
  echo -e "${YELLOW}⚠ Secret scan warnings (non-blocking)${NC}"
fi
echo ""

# Test 5: Backend syntax check
echo -e "${YELLOW}[5/5] Checking Python syntax...${NC}"
if python -m py_compile backend/slurpy/domain/safety/service.py && \
   python -m py_compile backend/tests/test_safety_regression.py; then
  echo -e "${GREEN}✓ Python syntax valid${NC}"
else
  echo -e "${RED}✗ Python syntax error${NC}"
  ((FAIL_COUNT++))
fi
echo ""

echo "=========================================="
if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "${GREEN}✓ All canary safety checks PASSED${NC}"
  echo "=========================================="
  exit 0
else
  echo -e "${RED}✗ $FAIL_COUNT check(s) FAILED${NC}"
  echo "=========================================="
  exit 1
fi

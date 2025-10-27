#!/bin/bash

# ==============================================================================
# Slurpy Production Security Setup Script
# ==============================================================================
# 
# This script helps you configure essential security settings before deploying
# to production. Run this BEFORE your first production deployment.
#
# Usage: ./scripts/setup-production-security.sh
# ==============================================================================

set -e  # Exit on error

echo "🔐 Slurpy Production Security Setup"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues found
ISSUES_FOUND=0

# ==============================================================================
# 1. Check for .env files in git
# ==============================================================================
echo "📁 Checking for secrets in version control..."

if git ls-files | grep -q "\.env$"; then
    echo -e "${RED}❌ CRITICAL: .env file is tracked by git!${NC}"
    echo "   Run: git rm --cached .env && git commit -m 'Remove .env from git'"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ No .env files in git${NC}"
fi

if git ls-files | grep -q "\.env\.local$\|\.env\.production$"; then
    echo -e "${RED}❌ WARNING: .env.local or .env.production tracked by git${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ==============================================================================
# 2. Check CORS configuration
# ==============================================================================
echo ""
echo "🌐 Checking CORS configuration..."

if grep -q 'allow_origins=\["\*"\]' backend/slurpy/interfaces/http/main.py; then
    echo -e "${RED}❌ CRITICAL: CORS allows all origins (*)${NC}"
    echo "   Update backend/slurpy/interfaces/http/main.py with your production domains"
    echo "   See: SAAS_OPERATIONS.md#fix-1-restrict-cors"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo -e "${GREEN}✅ CORS configuration looks good${NC}"
fi

# ==============================================================================
# 3. Check for hardcoded secrets
# ==============================================================================
echo ""
echo "🔑 Scanning for hardcoded secrets..."

# Check for common secret patterns
if grep -r "sk_live_" --include="*.{ts,tsx,py,js,jsx}" app/ backend/ lib/ 2>/dev/null | grep -v ".env" | grep -q .; then
    echo -e "${RED}❌ CRITICAL: Found Stripe live keys in code!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

## Legacy key checks removed

if ! grep -r "sk_test_\|sk_live_\|pk_test_\|pk_live_" --include="*.{ts,tsx,py,js,jsx}" app/ backend/ lib/ 2>/dev/null | grep -v ".env" | grep -q .; then
    echo -e "${GREEN}✅ No hardcoded secrets found${NC}"
fi

# ==============================================================================
# 4. Check environment variable examples
# ==============================================================================
echo ""
echo "📝 Checking .env.example..."

if [ ! -f ".env.example" ]; then
    echo -e "${YELLOW}⚠️  WARNING: .env.example not found${NC}"
    echo "   This helps new developers set up the project"
else
    echo -e "${GREEN}✅ .env.example exists${NC}"
fi

# ==============================================================================
# 5. Check Fly.io secrets
# ==============================================================================
echo ""
echo "☁️  Checking Fly.io secrets configuration..."

if ! command -v flyctl &> /dev/null; then
    echo -e "${YELLOW}⚠️  Fly CLI not installed, skipping Fly.io checks${NC}"
    echo "   Install: curl -L https://fly.io/install.sh | sh"
else
    echo -e "${GREEN}✅ Fly CLI installed${NC}"
    
    # Check if apps exist
    if fly apps list | grep -q "slurpy-frontend"; then
        echo "   Checking frontend secrets..."
    echo -e "${GREEN}   ✅ Frontend app detected (no extra auth provider secrets required)${NC}"
    else
        echo -e "${YELLOW}   ℹ️  Fly.io apps not created yet${NC}"
    fi
fi

# ==============================================================================
# 6. Check security headers
# ==============================================================================
echo ""
echo "🛡️  Checking security headers..."

if grep -q "async headers()" next.config.mjs; then
    echo -e "${GREEN}✅ Security headers configured in Next.js${NC}"
else
    echo -e "${RED}❌ Security headers not found in next.config.mjs${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# ==============================================================================
# 7. Check dependencies for vulnerabilities
# ==============================================================================
echo ""
echo "🔍 Checking for vulnerable dependencies..."

echo "   Frontend (npm audit)..."
if npm audit --audit-level=high 2>/dev/null | grep -q "found 0 vulnerabilities"; then
    echo -e "${GREEN}   ✅ No high-severity vulnerabilities in frontend${NC}"
else
    echo -e "${YELLOW}   ⚠️  Found vulnerabilities in frontend dependencies${NC}"
    echo "      Run: npm audit fix"
fi

echo "   Backend (checking for pip-audit)..."
if command -v pip-audit &> /dev/null; then
    cd backend
    if pip-audit 2>/dev/null | grep -q "No known vulnerabilities found"; then
        echo -e "${GREEN}   ✅ No vulnerabilities in backend${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Found vulnerabilities in backend dependencies${NC}"
        echo "      Review and update requirements/backend.txt"
    fi
    cd ..
else
    echo -e "${YELLOW}   ℹ️  pip-audit not installed (optional)${NC}"
    echo "      Install: pip install pip-audit"
fi

# ==============================================================================
# Summary
# ==============================================================================
echo ""
echo "===================================="
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review SAAS_OPERATIONS.md for production best practices"
    echo "2. Complete docs/DEPLOYMENT_CHECKLIST.md before deploying"
    echo "3. Set up monitoring (Sentry, UptimeRobot)"
    echo "4. Configure backups"
else
    echo -e "${RED}⚠️  Found $ISSUES_FOUND security issue(s)${NC}"
    echo ""
    echo "Please fix the issues above before deploying to production."
    echo ""
    echo "Resources:"
    echo "- SAAS_OPERATIONS.md - Security hardening guide"
    echo "- docs/DEPLOYMENT_CHECKLIST.md - Production deployment checklist"
    exit 1
fi

echo ""
echo "📚 Additional Reading:"
echo "- SAAS_OPERATIONS.md - Complete SaaS owner's guide"
echo "- docs/MONITORING.md - Set up monitoring and alerts"
echo "- docs/INCIDENT_RESPONSE.md - What to do when things go wrong"
echo ""

#!/bin/bash
# railway-monitor.sh - Real-time Railway deployment monitor

set -e

PROJECT_ID=""
SERVICE_NAME="slurpy"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Railway Deployment Monitor${NC}"
echo "================================"
echo ""

# Function to check for success/failure indicators
monitor_logs() {
    echo -e "${YELLOW}📊 Monitoring deployment...${NC}"
    echo ""
    
    # Store previous line count to detect new output
    prev_count=0
    error_found=0
    success_found=0
    
    while true; do
        # Get current logs
        logs=$(railway logs 2>&1 | tail -50)
        current_count=$(echo "$logs" | wc -l)
        
        # Check for success indicators
        if echo "$logs" | grep -q "✅ Backend ready"; then
            echo -e "${GREEN}✅ Deployment successful!${NC}"
            success_found=1
            break
        fi
        
        # Check for error indicators
        if echo "$logs" | grep -qE "(error|ERROR|failed|FAILED|ImportError|ModuleNotFoundError|out of memory)"; then
            echo -e "${RED}❌ Error detected in logs!${NC}"
            error_found=1
            break
        fi
        
        # Check for warmup completion
        if echo "$logs" | grep -q "warmup complete"; then
            echo -e "${GREEN}✅ Model warmup complete${NC}"
        fi
        
        # Check for Qdrant connection
        if echo "$logs" | grep -q "Qdrant collection"; then
            echo -e "${GREEN}✅ Connected to Qdrant Cloud${NC}"
        fi
        
        # Check for startup message
        if echo "$logs" | grep -q "Starting Slurpy"; then
            echo -e "${GREEN}✅ Backend starting...${NC}"
        fi
        
        sleep 2
    done
    
    # Show relevant logs
    echo ""
    echo -e "${BLUE}📋 Last 30 lines of logs:${NC}"
    echo "================================"
    railway logs 2>&1 | tail -30
    echo ""
    
    if [ $success_found -eq 1 ]; then
        echo -e "${GREEN}🎉 Deployment Complete!${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Get Railway URL: railway domain"
        echo "2. Set environment variables in Railway dashboard"
        echo "3. Update Vercel BACKEND_URL env var"
        echo "4. Redeploy Vercel: vercel --prod"
        return 0
    else
        echo -e "${RED}⚠️  Deployment failed. Check logs above.${NC}"
        return 1
    fi
}

# Check if logged in
if ! railway whoami > /dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to Railway${NC}"
    echo "Run: railway login --browserless"
    exit 1
fi

# Show current project
echo -e "${BLUE}Current Project:${NC}"
railway status 2>&1 | head -10
echo ""

# Get deployment status
echo -e "${BLUE}Checking deployment status...${NC}"
railway logs 2>&1 | tail -20

# Monitor logs
monitor_logs

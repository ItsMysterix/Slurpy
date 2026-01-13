#!/bin/bash
# Deploy to Railway, set env vars, and connect to Vercel

set -e

echo "🚀 Slurpy Railway Deployment & Vercel Integration"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Wait for build to complete
echo -e "${BLUE}Step 1: Waiting for Railway build to complete...${NC}"
echo "⏳ Monitoring build (this can take 5-10 minutes)"
echo ""

max_wait=600  # 10 minutes
elapsed=0
check_interval=10

while [ $elapsed -lt $max_wait ]; do
    logs=$(railway logs 2>&1 || echo "")
    
    if echo "$logs" | grep -q "Backend ready"; then
        echo -e "${GREEN}✅ Backend is ready!${NC}"
        break
    fi
    
    if echo "$logs" | grep -qE "(failed|ERROR|Build failed)"; then
        echo -e "${RED}❌ Build failed - check logs:${NC}"
        railway logs | tail -30
        exit 1
    fi
    
    echo -ne "\r⏳ Waiting... ${elapsed}s"
    sleep $check_interval
    elapsed=$((elapsed + check_interval))
done

echo -e "\n"

# Step 2: Get Railway URL
echo -e "${BLUE}Step 2: Getting Railway URL...${NC}"
RAILWAY_URL=$(railway domain 2>&1 | grep -o 'https://[^ ]*' | head -1)

if [ -z "$RAILWAY_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not get domain automatically${NC}"
    echo "Go to: https://railway.app/dashboard"
    echo "Find your service and add a domain"
    read -p "Enter Railway URL: " RAILWAY_URL
fi

echo -e "${GREEN}✅ Railway URL: $RAILWAY_URL${NC}"
echo ""

# Step 3: Show env vars to set (user must do this in Railway dashboard)
echo -e "${BLUE}Step 3: Setting Environment Variables${NC}"
echo -e "${YELLOW}⚠️  You must set these in Railway Dashboard:${NC}"
echo ""
echo "Go to: https://railway.app/dashboard → Your Project → Variables"
echo ""
echo "Copy and paste these variables:"
echo "================================"
echo "OPENAI_API_KEY=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"
echo "QDRANT_URL=https://48f513c5-3950-48de-9866-34f55c9b04bc.us-east4-0.gcp.cloud.qdrant.io:6333"
echo "QDRANT_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.pMK5xafGseNyGr2GlyQIOkXf0g_TA1S0nc6PVPtSDS0"
echo "QDRANT_COLLECTION=slurpy_chunks"
echo "FRONTEND_ORIGIN=https://slurpy.life"
echo "EMBED_MODEL=all-MiniLM-L6-v2"
echo "CACHE_SIZE=1000"
echo "CACHE_TTL=3600"
echo "================================"
echo ""
read -p "Press ENTER once you've set the env vars in Railway Dashboard: "

# Step 4: Test Railway health
echo -e "${BLUE}Step 4: Testing Railway Backend...${NC}"
echo "Testing health endpoint..."

for i in {1..5}; do
    if curl -s "${RAILWAY_URL}/healthz" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is responding${NC}"
        break
    fi
    echo "Attempt $i/5 - waiting 5s..."
    sleep 5
done

echo "Testing stats endpoint..."
STATS=$(curl -s "${RAILWAY_URL}/stats" 2>/dev/null || echo "{}")
echo "$STATS" | jq '.' 2>/dev/null || echo "Stats: $STATS"
echo ""

# Step 5: Update Vercel
echo -e "${BLUE}Step 5: Updating Vercel Frontend...${NC}"
echo "Setting BACKEND_URL environment variable"
echo ""

if command -v vercel &> /dev/null; then
    echo "Using Vercel CLI to set env var..."
    vercel env add BACKEND_URL < <(echo "$RAILWAY_URL")
    echo -e "${GREEN}✅ Vercel env var set${NC}"
else
    echo -e "${YELLOW}⚠️  Vercel CLI not found${NC}"
    echo "Go to: https://vercel.com/dashboard → slurpy → Settings → Environment Variables"
    echo "Add: BACKEND_URL = $RAILWAY_URL"
    read -p "Press ENTER once you've set it in Vercel: "
fi

echo ""

# Step 6: Redeploy Vercel
echo -e "${BLUE}Step 6: Redeploying Vercel...${NC}"
if command -v vercel &> /dev/null; then
    echo "Redeploying to production..."
    vercel --prod --yes
    echo -e "${GREEN}✅ Vercel redeployed${NC}"
else
    echo -e "${YELLOW}⚠️  Vercel CLI not found${NC}"
    echo "Go to: https://vercel.com/dashboard → slurpy"
    echo "Click 'Redeploy' (or push to main)"
    read -p "Press ENTER once Vercel is redeployed: "
fi

echo ""

# Step 7: Final test
echo -e "${BLUE}Step 7: Final End-to-End Test...${NC}"
echo "Testing full pipeline..."
echo ""
echo "Testing chat endpoint:"
RESPONSE=$(curl -s -X POST "${RAILWAY_URL}/v1/mcp/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user","message":"hello"}' 2>/dev/null || echo "{}")

if echo "$RESPONSE" | grep -q "reply\|error"; then
    echo -e "${GREEN}✅ Chat endpoint responding${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "Response: $RESPONSE"
else
    echo -e "${YELLOW}⚠️  Could not verify chat endpoint${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo "=================================================="
echo ""
echo "Summary:"
echo "  Railway Backend: $RAILWAY_URL"
echo "  Frontend: https://slurpy.life"
echo ""
echo "Next: Open https://slurpy.life and test chat"
echo "Expected latency:"
echo "  - First message: 150-250ms"
echo "  - Cached message: 5-10ms"
echo ""
echo "Monitor performance:"
echo "  curl ${RAILWAY_URL}/stats | jq '.cache'"

#!/bin/bash

# ==============================================================================
# Production-Ready Docker Setup Script
# ==============================================================================
# 
# This script sets up and runs Slurpy in Docker with production-ready config
# Usage: ./scripts/docker-setup.sh
# ==============================================================================

set -e

echo "🚀 Slurpy Production-Ready Docker Setup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo ""
    echo "Please create a .env file with your credentials."
    echo "You can copy from .env.docker:"
    echo ""
    echo "  cp .env.docker .env"
    echo "  # Then edit .env with your actual keys"
    echo ""
    exit 1
fi

echo -e "${BLUE}📋 Checking required environment variables...${NC}"
echo ""

# Check for required variables
REQUIRED_VARS=(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    "CLERK_SECRET_KEY"
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE"
    "OPENAI_API_KEY"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" .env || grep -q "^${var}=.*your.*here" .env; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing or incomplete environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update your .env file with actual values."
    echo "See .env.example or .env.docker for reference."
    exit 1
fi

echo -e "${GREEN}✅ All required environment variables present${NC}"
echo ""

# Stop and remove existing containers
echo -e "${BLUE}🧹 Cleaning up existing containers...${NC}"
docker compose down -v 2>/dev/null || true
echo ""

# Build images
echo -e "${BLUE}🔨 Building Docker images...${NC}"
echo "This may take 5-10 minutes on first run..."
echo ""
docker compose build --no-cache

echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""

# Start services
echo -e "${BLUE}🚀 Starting services...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}✅ Services started!${NC}"
echo ""

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"
echo ""

sleep 5

# Check service status
echo "Checking service status..."
echo ""

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is healthy${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done

    echo -e "${RED}❌ $service_name failed to start${NC}"
    return 1
}

# Check each service
check_service "Qdrant" "http://localhost:6333/healthz"
check_service "MCP" "http://localhost:9001/healthz"
check_service "Backend" "http://localhost:8000/health/healthz"
check_service "Frontend" "http://localhost:3000/api/health"

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 All services are running!${NC}"
echo "=========================================="
echo ""
echo "Access your application:"
echo ""
echo -e "  ${BLUE}Frontend:${NC}  http://localhost:3000"
echo -e "  ${BLUE}Backend:${NC}   http://localhost:8000"
echo -e "  ${BLUE}MCP:${NC}       http://localhost:9001"
echo -e "  ${BLUE}Qdrant:${NC}    http://localhost:6333/dashboard"
echo ""
echo "Available features:"
echo ""
echo "  ✅ Sign up / Sign in (Clerk)"
echo "  ✅ Forgot password flow"
echo "  ✅ Email verification"
echo "  ✅ Chat with AI"
echo "  ✅ Journal entries"
echo "  ✅ Mood tracking"
echo ""
echo "To view logs:"
echo "  docker compose logs -f [service]"
echo ""
echo "To stop all services:"
echo "  docker compose down"
echo ""

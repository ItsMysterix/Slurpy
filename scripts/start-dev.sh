#!/bin/bash
# Local development startup script
# Starts Next.js frontend (Python backend runs on Railway)

set -e

echo "🚀 Starting Slurpy local development..."

# Load environment variables
if [ -f .env.vercel.local ]; then
  export $(cat .env.vercel.local | grep -v "^#" | xargs)
fi

# Check if BACKEND_URL is set
if [ -z "$BACKEND_URL" ]; then
  echo "⚠️  Warning: BACKEND_URL not set in .env.vercel.local"
  echo "   Chat features will not work without backend connection"
fi

# Start Next.js frontend
echo "⚛️  Starting Next.js frontend on port 3000..."
echo "   Backend (Railway): $BACKEND_URL"
pnpm run dev > dev.log 2>&1 &
FRONTEND_PID=$!

echo "✅ Development server started!"
echo "   Frontend: http://localhost:3000"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop: kill $FRONTEND_PID"
echo "Logs: tail -f dev.log"

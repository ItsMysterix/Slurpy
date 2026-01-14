#!/bin/bash
# Local development startup script
# Starts both Next.js frontend and Python backend

set -e

echo "🚀 Starting Slurpy local development..."

# Load environment variables
export $(cat .env.vercel.local | grep -v "^#" | xargs)

# Start Python backend
echo "🐍 Starting Python backend on port 8000..."
cd backend && PYTHONPATH=$PWD python3 -m uvicorn slurpy.interfaces.http.main:app \
  --host 0.0.0.0 --port 8000 --reload > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start Next.js frontend
echo "⚛️  Starting Next.js frontend on port 3000..."
pnpm run dev > dev.log 2>&1 &
FRONTEND_PID=$!

echo "✅ Development servers started!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
echo "Logs: tail -f backend.log dev.log"

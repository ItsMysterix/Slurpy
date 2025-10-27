#!/usr/bin/env bash

# Deploy script for all Slurpy services

set -euo pipefail

echo "🚀 Deploying Slurpy services..."

# Optional build args for frontend (required for Next.js to bake public envs)
# Export these in your shell before running, or pass inline:
#   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... ./fly.sh
FRONTEND_BUILD_ARGS=()
if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  FRONTEND_BUILD_ARGS+=(--build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL")
fi
if [[ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  FRONTEND_BUILD_ARGS+=(--build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY")
fi
if [[ -n "${NEXT_PUBLIC_RAG_API:-}" ]]; then
  FRONTEND_BUILD_ARGS+=(--build-arg NEXT_PUBLIC_RAG_API="$NEXT_PUBLIC_RAG_API")
fi

# Deploy Backend
echo "📦 Deploying Backend..."
fly deploy \
  --app slurpy \
  --config fly.backend.toml \
  --remote-only

# Deploy Frontend  
echo "🌐 Deploying Frontend..."
if (( ${#FRONTEND_BUILD_ARGS[@]} )); then
  fly deploy \
    --app slurpy-web \
    --config fly.frontend.toml \
    --remote-only \
    "${FRONTEND_BUILD_ARGS[@]}"
else
  echo "ℹ️ No NEXT_PUBLIC_* build args found in environment; frontend build will not include Supabase config."
  echo "   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before running to enable auth."
  fly deploy \
    --app slurpy-web \
    --config fly.frontend.toml \
    --remote-only
fi

# Deploy MCP
echo "🤖 Deploying MCP..."
fly deploy \
  --app slurpy-mcp \
  --config fly.mcp.toml \
  --remote-only

echo "✅ All services deployed!"

# Check status
echo "📊 Checking status..."
fly status --app slurpy
fly status --app slurpy-web
fly status --app slurpy-mcp
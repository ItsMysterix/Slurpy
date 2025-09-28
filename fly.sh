#!/bin/bash

# Deploy script for all Slurpy services

echo "🚀 Deploying Slurpy services..."

# Deploy Backend
echo "📦 Deploying Backend..."
fly deploy \
  --app slurpy \
  --config infra/fly/fly.backend.toml \
  --remote-only

# Deploy Frontend  
echo "🌐 Deploying Frontend..."
fly deploy \
  --app slurpy-web \
  --config infra/fly/fly.frontend.toml \
  --remote-only

# Deploy MCP
echo "🤖 Deploying MCP..."
fly deploy \
  --app slurpy-mcp \
  --config infra/fly/fly.mcp.toml \
  --remote-only

echo "✅ All services deployed!"

# Check status
echo "📊 Checking status..."
fly status --app slurpy
fly status --app slurpy-web
fly status --app slurpy-mcp
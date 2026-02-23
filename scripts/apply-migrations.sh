#!/bin/bash

# APPLY MIGRATIONS FOR SLURPY
# Usage: source .env.backend with DATABASE_URL set to your Supabase Postgres connection string
# Then run: bash scripts/apply-migrations.sh

set -euo pipefail

if [ -f .env.backend ]; then
  source .env.backend
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Export it or create .env.backend with DATABASE_URL."
  exit 1
fi

echo "========================================="
echo "Applying migrations to Supabase"
echo "========================================="

# Ensure npx is available (for Supabase CLI)
if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx is not installed or not in PATH. Install Node.js first."
  exit 1
fi

if [ ! -d "supabase/migrations" ]; then
  echo "ERROR: supabase/migrations directory not found."
  exit 1
fi

echo "Running: npx supabase db push --db-url \"<redacted>\""
npx supabase db push --db-url "$DATABASE_URL"

# Run post-migration smoke tests
if [ -f scripts/post-migration-test.sh ]; then
  echo "Running post-migration smoke tests"
  bash scripts/post-migration-test.sh || true
fi

echo "========================================="
echo "Migrations applied successfully."
echo "========================================="

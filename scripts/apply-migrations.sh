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

# Ensure psql is available
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed or not in PATH. Install PostgreSQL client first."
  exit 1
fi

# Apply Sprint 1: UserMemory (PascalCase table)
echo "Applying: migrations/add_user_memory_table.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add_user_memory_table.sql

# Apply Sprint 2: insight_run (snake_case table)
echo "Applying: migrations/20250115_create_insight_run_table.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20250115_create_insight_run_table.sql

# Create snake_case views bridging PascalCase tables used elsewhere
echo "Applying: migrations/20260114_create_snake_case_views.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260114_create_snake_case_views.sql

# Run post-migration smoke tests
if [ -f scripts/post-migration-test.sh ]; then
  echo "Running post-migration smoke tests"
  bash scripts/post-migration-test.sh || true
fi

echo "========================================="
echo "Migrations applied successfully."
echo "========================================="

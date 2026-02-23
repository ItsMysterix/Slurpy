#!/usr/bin/env bash

set -euo pipefail

RANGE="${1:-}"

if [[ -n "$RANGE" ]]; then
  CHANGED="$(git diff --name-only "$RANGE")"
else
  CHANGED="$(
    {
      git diff --name-only --cached
      git diff --name-only
    } | sort -u
  )"
fi

echo "[migration-policy] Files checked:"
echo "$CHANGED"

if echo "$CHANGED" | grep -E '^migrations/.*\.sql$' >/dev/null; then
  echo "::error::Top-level migrations/*.sql is deprecated. Use supabase/migrations/*.sql only."
  exit 1
fi

if [[ ! -d "supabase/migrations" ]]; then
  echo "::error::supabase/migrations directory missing"
  exit 1
fi

echo "[migration-policy] OK"

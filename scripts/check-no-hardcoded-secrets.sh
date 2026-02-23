#!/usr/bin/env bash

set -euo pipefail

RANGE="${1:-}"

if [[ -n "$RANGE" ]]; then
  FILES="$(git diff --name-only "$RANGE")"
else
  FILES="$(
    {
      git diff --name-only --cached
      git diff --name-only
    } | sort -u
  )"
fi

if [[ -z "$FILES" ]]; then
  echo "[secrets-check] No changed files to scan"
  exit 0
fi

SCAN_TARGETS="$(echo "$FILES" | grep -E '\.(ts|tsx|js|mjs|cjs|py|sh|ya?ml|json|env)$' || true)"

if [[ -z "$SCAN_TARGETS" ]]; then
  echo "[secrets-check] No scannable changed files"
  exit 0
fi

PATTERN='(OPENAI_API_KEY|ANTHROPIC_API_KEY|QDRANT_API_KEY|SUPABASE_SERVICE_ROLE(_KEY)?|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\s*[:=]\s*["'"'"']?(sk-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9._-]{20,}|whsec_[A-Za-z0-9]{16,})'

EXIT_CODE=0
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  if grep -nE "$PATTERN" "$file" >/dev/null; then
    echo "::error file=$file::Potential hardcoded secret detected"
    grep -nE "$PATTERN" "$file" || true
    EXIT_CODE=1
  fi
done <<< "$SCAN_TARGETS"

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "[secrets-check] Failed"
  exit $EXIT_CODE
fi

echo "[secrets-check] OK"

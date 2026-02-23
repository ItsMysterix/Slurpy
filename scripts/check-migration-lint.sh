#!/bin/bash
# Migration Lint Checker
# Validates Supabase migrations for common issues:
#   1. Naming convention: YYYYMMDD_descriptive_name.sql (strict)
#   2. Transaction safety: BEGIN/COMMIT blocks for data changes
#   3. Idempotency: CREATE IF NOT EXISTS, DROP IF EXISTS, etc.
#   4. No hardcoded secrets or sensitive defaults
#
# Usage: bash scripts/check-migration-lint.sh [migration_dir]
# Exit code: 0 if all checks pass, 1 if any lint errors found

set -euo pipefail

MIGRATION_DIR="${1:-.}" 
MIGRATION_DIR="${MIGRATION_DIR%/}/supabase/migrations"

if [[ ! -d "$MIGRATION_DIR" ]]; then
  echo "::error::Migration directory not found: $MIGRATION_DIR"
  exit 1
fi

ERRORS=0
WARNINGS=0

# Find all .sql files
while IFS= read -r -d '' mig_file; do
  basename=$(basename "$mig_file")
  echo "Checking: $basename"

  # 1. Naming convention: YYYYMMDD_*.sql
  if ! [[ "$basename" =~ ^[0-9]{8}_[a-z_]+\.sql$ ]]; then
    echo "  ::error::Invalid naming: must be YYYYMMDD_descriptive_name.sql (got: $basename)"
    ((ERRORS++))
    continue
  fi

  # 2. Check for transaction wrapping on data-change statements
  has_data_change=$(grep -E "^\s*(INSERT|UPDATE|DELETE|ALTER TABLE|DROP TABLE|CREATE TABLE)" "$mig_file" | head -1 || true)
  if [[ -n "$has_data_change" ]]; then
    has_begin=$(grep -c "^\s*BEGIN" "$mig_file" || true)
    if [[ $has_begin -eq 0 ]]; then
      echo "  ::warning::Data change without BEGIN transaction"
      ((WARNINGS++))
    fi
  fi

  # 3. Check for idempotency on CREATE/DROP
  has_create=$(grep -c "^\s*CREATE " "$mig_file" || true)
  has_drop=$(grep -c "^\s*DROP " "$mig_file" || true)
  
  if [[ $has_create -gt 0 ]] || [[ $has_drop -gt 0 ]]; then
    has_if_exists=$(grep -c "IF NOT EXISTS\|IF EXISTS" "$mig_file" || true)
    if [[ $has_if_exists -eq 0 ]] && ([[ $has_create -gt 0 ]] || [[ $has_drop -gt 0 ]]); then
      echo "  ::warning::CREATE/DROP without IF (NOT) EXISTS—may fail on re-run"
      ((WARNINGS++))
    fi
  fi

  # 4. Check for hardcoded secrets
  if grep -E "(password|secret|api_key|token|key)(.{0,5})=" "$mig_file" | grep -v "^--" > /dev/null; then
    echo "  ::error::Possible hardcoded secret detected"
    ((ERRORS++))
  fi

  # 5. Check for RLS policy syntax
  has_rls=$(grep -c "CREATE POLICY\|ALTER POLICY" "$mig_file" || true)
  if [[ $has_rls -gt 0 ]]; then
    echo "  ✓ RLS policy included"
  fi

done < <(find "$MIGRATION_DIR" -name "*.sql" -print0 | sort -z)

echo ""
echo "Migration Lint Summary:"
echo "  Errors: $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""

if [[ $ERRORS -gt 0 ]]; then
  echo "::error::Migration lint failed with $ERRORS error(s)"
  exit 1
fi

if [[ $WARNINGS -gt 0 ]]; then
  echo "::warning::$WARNINGS lint warning(s) found (non-blocking)"
fi

echo "✓ All migrations passed lint checks"
exit 0

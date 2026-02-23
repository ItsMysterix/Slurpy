#!/bin/bash
# Incident Response Automation
# Triggered by SLO breach: captures diagnostic info, auto-escalates, initiates rollback decision tree
# Usage: bash scripts/incident-response.sh <component> <severity>
# Example: bash scripts/incident-response.sh "chat-api" "critical"

set -euo pipefail

COMPONENT="${1:?Component required (chat-api|database|qdrant|openai|safety-pipeline)}"
SEVERITY="${2:?Severity required (warning|high|critical)}"
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
INCIDENT_ID="inc-$(date +%s)-$$"

LOG_DIR="./logs/incidents"
mkdir -p "$LOG_DIR"
INCIDENT_FILE="$LOG_DIR/$INCIDENT_ID.txt"

# Helper: log and print
log_msg() {
  local msg="$1"
  echo "[$(date +'%H:%M:%S')] $msg" | tee -a "$INCIDENT_FILE"
}

# Start incident log
log_msg "========== INCIDENT RESPONSE =========="
log_msg "Incident ID: $INCIDENT_ID"
log_msg "Timestamp: $TIMESTAMP"
log_msg "Component: $COMPONENT"
log_msg "Severity: $SEVERITY"
log_msg ""

# 1. Capture system state
log_msg "Capturing system diagnostics..."
{
  echo "=== Health Check Output ==="
  curl -sf http://localhost:3000/api/health 2>&1 | jq . || echo "Health check failed"
  echo ""
  echo "=== Environment ==="
  env | grep -E "NEXT_|SUPABASE_|QDRANT_" || true
  echo ""
  echo "=== Recent Logs (Sentry via curl, if available) ==="
  curl -s "https://sentry.io/api/0/projects/slurpy/slurpy/issues/?query=is:unresolved&limit=5" 2>&1 | jq . || echo "Sentry logs unavailable"
} >> "$INCIDENT_FILE" 2>&1

# 2. Route by component
case "$COMPONENT" in
  "chat-api")
    log_msg "Chat API incident detected."
    log_msg "Checking: API latency, database connectivity, Qdrant search"
    {
      echo "=== Chat Endpoint Diagnostics ==="
      curl -v http://localhost:3000/api/chat \
        -H "Content-Type: application/json" \
        -d '{"message":"health-check"}' \
        2>&1 | head -50 || echo "Chat endpoint unreachable"
    } >> "$INCIDENT_FILE" 2>&1
    ;;

  "database")
    log_msg "Database incident detected."
    log_msg "Action: Check connection pool, query performance, disk usage"
    if command -v psql &> /dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
      {
        echo "=== DB Connection Test ==="
        psql "$DATABASE_URL" -c "SELECT version();" 2>&1 || echo "DB connection failed"
        echo ""
        echo "=== Slow Queries ==="
        psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 5;" 2>&1 || echo "pg_stat_statements unavailable"
      } >> "$INCIDENT_FILE" 2>&1
    fi
    ;;

  "qdrant")
    log_msg "Qdrant incident detected."
    log_msg "Action: Check Qdrant cluster health, query latency, restart if needed"
    {
      echo "=== Qdrant Health ==="
      curl -s -H "api-key: ${QDRANT_API_KEY:-}" "${QDRANT_URL:-http://localhost:6333}/health" | jq . || echo "Qdrant unreachable"
      echo ""
      echo "=== Qdrant Collections ==="
      curl -s -H "api-key: ${QDRANT_API_KEY:-}" "${QDRANT_URL:-http://localhost:6333}/collections" | jq . || echo "Collections unavailable"
    } >> "$INCIDENT_FILE" 2>&1
    ;;

  "openai")
    log_msg "OpenAI incident detected."
    log_msg "Action: Check OpenAI API status, rate limits, fallback to cached responses"
    {
      echo "=== OpenAI API Status ==="
      curl -s https://status.openai.com/api/v2/status.json | jq .status || echo "Cannot reach OpenAI status"
      echo ""
      echo "=== Token Usage Check ==="
      curl -s https://api.openai.com/v1/models \
        -H "Authorization: Bearer ${OPENAI_API_KEY:-}" | jq .data | head -10 || echo "API key invalid"
    } >> "$INCIDENT_FILE" 2>&1
    ;;

  "safety-pipeline")
    log_msg "Safety pipeline incident detected."
    log_msg "Action: Check safety event ingestion, crisis detection latency, false positive rate"
    {
      echo "=== Safety Events Table Status ==="
      if command -v psql &> /dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
        psql "$DATABASE_URL" -c "SELECT COUNT(*) as event_count, MAX(created_at) as latest FROM safety_events LIMIT 1;" || echo "Safety events unavailable"
        echo ""
        echo "=== Recent Safety Events ==="
        psql "$DATABASE_URL" -c "SELECT level, COUNT(*) FROM safety_events WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY level;" || true
      fi
    } >> "$INCIDENT_FILE" 2>&1
    ;;

  *)
    log_msg "Unknown component: $COMPONENT"
    exit 1
    ;;
esac

log_msg ""
log_msg "System state captured. Full log: $INCIDENT_FILE"
log_msg ""

# 3. Determine action based on severity
case "$SEVERITY" in
  "critical")
    log_msg "CRITICAL INCIDENT: Initiating emergency procedures"
    log_msg "Actions:"
    log_msg "  1. Page on-call engineer via PagerDuty"
    log_msg "  2. Prepare rollback: git reset --hard DEPLOY_COMMIT_BEFORE_INCIDENT"
    log_msg "  3. Hold deployment freeze until root cause identified"
    log_msg "  4. Notify #incidents Slack channel"
    
    # Auto-create incident ticket (if tools available)
    if command -v curl &> /dev/null && [[ -n "${PAGERDUTY_INTEGRATION_KEY:-}" ]]; then
      log_msg "Triggering PagerDuty alert..."
      curl -X POST "https://events.pagerduty.com/v2/enqueue" \
        -H "Content-Type: application/json" \
        -d "{
          \"routing_key\": \"$PAGERDUTY_INTEGRATION_KEY\",
          \"event_action\": \"trigger\",
          \"dedup_key\": \"$INCIDENT_ID\",
          \"payload\": {
            \"summary\": \"Critical incident: $COMPONENT ($INCIDENT_ID)\",
            \"severity\": \"critical\",
            \"source\": \"Slurpy Incident Response\",
            \"component\": \"$COMPONENT\",
            \"custom_details\": {
              \"incident_id\": \"$INCIDENT_ID\",
              \"timestamp\": \"$TIMESTAMP\",
              \"log_file\": \"$INCIDENT_FILE\"
            }
          }
        }" 2>&1 | jq . >> "$INCIDENT_FILE" || log_msg "PagerDuty notification failed"
    fi
    ;;

  "high")
    log_msg "HIGH SEVERITY: Escalating for investigation"
    log_msg "Actions:"
    log_msg "  1. Alert on-call via Slack #incidents"
    log_msg "  2. Prepare rollback plan (do not execute yet)"
    log_msg "  3. Investigate root cause in parallel"
    ;;

  "warning")
    log_msg "WARNING: Monitoring closely, no escalation yet"
    log_msg "Next steps:"
    log_msg "  1. Watch SLI for 10 more minutes"
    log_msg "  2. If persists, escalate to HIGH"
    ;;
esac

log_msg ""
log_msg "Incident response complete. Next: manual investigation and decision."
log_msg "=========================================="

# Exit with appropriate code
[[ "$SEVERITY" == "critical" ]] && exit 1 || exit 0

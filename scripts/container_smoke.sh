#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop and re-run this script." >&2
  exit 1
fi

echo "Building images..."
docker build -f "$ROOT_DIR/infra/docker/Dockerfile.frontend" -t slurpy-frontend:test "$ROOT_DIR"
docker build -f "$ROOT_DIR/infra/docker/Dockerfile.backend" -t slurpy-backend:test "$ROOT_DIR"

echo "Running backend..."
cid_backend=$(docker run -d --rm --cap-drop=ALL --read-only -p 18000:8000 --tmpfs /tmp:rw,size=64m slurpy-backend:test)
trap 'docker rm -f "$cid_backend" >/dev/null 2>&1 || true; docker rm -f "$cid_frontend" >/dev/null 2>&1 || true' EXIT

echo "Waiting for backend health..."
for i in {1..30}; do
  if curl -fsS http://localhost:18000/health/healthz >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://localhost:18000/health/healthz | jq . || true

echo "Check backend user is non-root"
docker exec "$cid_backend" id
uid=$(docker exec "$cid_backend" id -u)
if [ "$uid" -eq 0 ]; then echo "Backend is running as root!"; exit 1; fi

echo "Running frontend..."
cid_frontend=$(docker run -d --rm --cap-drop=ALL --read-only -p 13000:3000 --tmpfs /tmp:rw,size=64m slurpy-frontend:test)

echo "Waiting for frontend health..."
for i in {1..60}; do
  if curl -fsS http://localhost:13000/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://localhost:13000/api/health | jq . || true

echo "Check frontend user is non-root"
docker exec "$cid_frontend" id
uidf=$(docker exec "$cid_frontend" id -u)
if [ "$uidf" -eq 0 ]; then echo "Frontend is running as root!"; exit 1; fi

echo "Smoke checks passed."

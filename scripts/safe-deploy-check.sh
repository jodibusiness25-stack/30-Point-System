#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Checking required files..."
[ -f "render.yaml" ] || { echo "Missing render.yaml"; exit 1; }
[ -f "server/index.js" ] || { echo "Missing server/index.js"; exit 1; }
[ -f "client/app.js" ] || { echo "Missing client/app.js"; exit 1; }

echo "[2/6] Checking uncommitted changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit/stash changes before deploy."
  exit 1
fi

echo "[3/6] Checking forbidden tracked files..."
if git ls-files | rg -q "(^|/)node_modules/|server/.*\\.sqlite($|-shm$|-wal$)"; then
  echo "Tracked deploy-unsafe files detected (node_modules or sqlite runtime files)."
  exit 1
fi

echo "[4/6] JS syntax check..."
node --check server/index.js >/dev/null
node --check client/app.js >/dev/null

echo "[5/6] Checking critical env vars presence (local shell)..."
missing=0
for key in AUTH_SECRET APP_TIMEZONE; do
  if [ -z "${!key:-}" ]; then
    echo "Warning: $key is not set in current shell"
    missing=1
  fi
done
if [ "$missing" -eq 1 ]; then
  echo "Proceeding, but confirm env vars are set in Render."
fi

echo "[6/6] Done"
echo "Safe deploy checklist passed."

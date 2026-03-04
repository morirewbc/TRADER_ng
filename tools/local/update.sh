#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd git
require_cmd npm

if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
  echo "This copy is not a git repository." >&2
  echo "If you downloaded a ZIP file, download a fresh copy to update." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

echo "Updating local project from origin/main..."
git fetch origin
git pull --ff-only origin main

echo "Refreshing dependencies..."
npm install

echo "Running health check..."
npm run doctor

echo ""
echo "Update complete."
echo "Start the latest version with:"
echo "  $SCRIPT_DIR/start.sh"

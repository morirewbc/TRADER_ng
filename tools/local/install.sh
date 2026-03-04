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

echo "TRADER local install"
echo "Project directory: $PROJECT_ROOT"

require_cmd node
require_cmd npm

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "Could not find package.json in $PROJECT_ROOT" >&2
  echo "Run this script from inside the TRADER project folder." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

echo "Installing and checking dependencies..."
npm run setup

echo "Running quick health check..."
npm run doctor

echo ""
echo "Install complete."
echo "Start the app with:"
echo "  $SCRIPT_DIR/start.sh"

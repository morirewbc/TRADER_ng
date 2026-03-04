#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting TRADER locally..."

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "Could not find project files in $PROJECT_ROOT" >&2
  exit 1
fi

cd "$PROJECT_ROOT"

if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  echo "Dependencies are not installed yet." >&2
  echo "Run install first:"
  echo "  $SCRIPT_DIR/install.sh"
  exit 1
fi

echo "Opening the app in your browser when ready..."
echo "Press Ctrl+C in this terminal to stop."
npm run start:easy

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PARENT_DIR="$(dirname "$PROJECT_ROOT")"

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "Could not verify project directory: $PROJECT_ROOT" >&2
  exit 1
fi

if [[ "$PROJECT_ROOT" == "/" || "$PROJECT_ROOT" == "$HOME" || -z "$PROJECT_ROOT" ]]; then
  echo "Refusing to remove unsafe path: $PROJECT_ROOT" >&2
  exit 1
fi

echo "This will remove the local TRADER project folder:"
echo "  $PROJECT_ROOT"
echo ""
read -r -p "Type UNINSTALL to continue: " CONFIRM

if [[ "$CONFIRM" != "UNINSTALL" ]]; then
  echo "Cancelled."
  exit 0
fi

"$SCRIPT_DIR/stop.sh" || true

cd "$PARENT_DIR"
rm -rf "$PROJECT_ROOT"

echo "Local uninstall complete."

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

mapfile -t PIDS < <(
  ps ax -o pid= -o command= | awk -v root="$PROJECT_ROOT" '
    index($0, root "/node_modules/.bin/next dev") > 0 || index($0, root "/scripts/start-easy.js") > 0 {
      print $1
    }
  '
)

if [[ "${#PIDS[@]}" -eq 0 ]]; then
  echo "No running TRADER local server was found."
  exit 0
fi

echo "Stopping TRADER local server..."

for pid in "${PIDS[@]}"; do
  kill "$pid" 2>/dev/null || true
done

sleep 1

for pid in "${PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "Stopped."

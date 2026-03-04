#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLS_DIR="$ROOT_DIR/tools/local"

SCRIPTS=(
  "install.sh"
  "start.sh"
  "stop.sh"
  "update.sh"
  "uninstall.sh"
)

for script in "${SCRIPTS[@]}"; do
  path="$TOOLS_DIR/$script"
  if [[ ! -f "$path" ]]; then
    echo "Missing script: $path" >&2
    exit 1
  fi

  if [[ ! -x "$path" ]]; then
    echo "Script is not executable: $path" >&2
    exit 1
  fi

  bash -n "$path"
done

echo "All local lifecycle scripts exist and pass syntax checks."

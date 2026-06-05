#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Pre-flight: ensure Node.js >= 18 is available.
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed. Please install Node.js 18 or later." >&2
  echo "  https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js $(node -v 2>/dev/null || echo unknown) detected. Need 18 or later." >&2
  echo "  Current: $(node -v 2>/dev/null || echo unknown). Required: >= v18" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  TARGET="."
else
  TARGET="$1"
  shift
fi

exec node "$SCRIPT_DIR/bin/init-workspace.cjs" --target "$TARGET" "$@"

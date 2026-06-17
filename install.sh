#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# 前置检查：需要 Node.js >= 18。
if ! command -v node >/dev/null 2>&1; then
  echo "错误：未安装 Node.js，请安装 Node.js 18 或更高版本。" >&2
  echo "  https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "错误：当前 Node.js 为 $(node -v 2>/dev/null || echo unknown)，需要 18 或更高版本。" >&2
  echo "  当前: $(node -v 2>/dev/null || echo unknown)。要求: >= v18" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  TARGET="."
else
  TARGET="$1"
  shift
fi

exec node "$SCRIPT_DIR/bin/init-workspace.cjs" --target "$TARGET" "$@"

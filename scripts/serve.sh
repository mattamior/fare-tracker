#!/usr/bin/env bash
# 静态服务：默认 8765
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8765}"
echo "Fare Tracker → http://localhost:${PORT}"
echo "Root: $(pwd)"
exec python3 -m http.server "$PORT"

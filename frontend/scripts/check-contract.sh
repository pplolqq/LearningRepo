#!/usr/bin/env bash
# 前后端契约校验：后端 markdown 转换器产出的 JSON，能否被前端 Tiptap schema 无损反序列化。
#
#   ./scripts/check-contract.sh
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$(cd "$FRONTEND_DIR/../backend" && pwd)"
TMP_DIR="$FRONTEND_DIR/.tmp-check"
SAMPLE="$BACKEND_DIR/tests/fixtures/sample.md"
JSON_OUT="$TMP_DIR/sample-content.json"

if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
  echo "缺少后端虚拟环境，请先在 backend/ 下执行 ./setup.sh" >&2
  exit 1
fi

echo "==> 1/3 用后端转换器解析 sample.md"
mkdir -p "$TMP_DIR"
cd "$BACKEND_DIR"
"$BACKEND_DIR/.venv/bin/python" - "$SAMPLE" "$JSON_OUT" <<'PY'
import json
import sys
from pathlib import Path

from app.md_convert import markdown_to_tiptap

source = Path(sys.argv[1])
target = Path(sys.argv[2])
target.write_text(
    json.dumps(markdown_to_tiptap(source.read_text(encoding="utf-8")), ensure_ascii=False),
    encoding="utf-8",
)
print(f"    已产出 {target}")
PY

echo "==> 2/3 SSR 打包校验脚本"
cd "$FRONTEND_DIR"
pnpm exec vite build --ssr scripts/check-schema.ts --outDir "$TMP_DIR/out" --emptyOutDir --logLevel warn

echo "==> 3/3 用真实 schema 反序列化并逐字比对"
node "$TMP_DIR/out/check-schema.js" "$JSON_OUT"

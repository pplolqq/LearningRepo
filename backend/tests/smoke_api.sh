#!/usr/bin/env bash
# 后端接口冒烟测试。需要后端已在 127.0.0.1:8000 运行。
#   ./tests/smoke_api.sh
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8000/api}"
PASS=0
FAIL=0

j() { python3 "$(dirname "$0")/_jq.py" "$1"; }

check() { # check <描述> <实际> <期望>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  ✓ %s\n' "$1";
  else FAIL=$((FAIL+1)); printf '  ✗ %s  期望=%s 实际=%s\n' "$1" "$3" "$2"; fi
}

reset_db() {
  curl -s "$BASE/folders" | python3 -c "import sys,json;[print(x['id']) for x in json.load(sys.stdin)]" \
    | while read -r id; do curl -s -o /dev/null -X DELETE "$BASE/folders/$id"; done
  curl -s "$BASE/notes" | python3 -c "import sys,json;[print(x['id']) for x in json.load(sys.stdin)]" \
    | while read -r id; do curl -s -o /dev/null -X DELETE "$BASE/notes/$id"; done
}

reset_db

echo "== 健康检查 =="
check "health" "$(curl -s "$BASE/health" | j "['status']")" "ok"

echo "== 文件夹 =="
A=$(curl -s -X POST "$BASE/folders" -H 'Content-Type: application/json' -d '{"name":"工作"}' | j "['id']")
B=$(curl -s -X POST "$BASE/folders" -H 'Content-Type: application/json' -d "{\"name\":\"子目录\",\"parent_id\":$A}" | j "['id']")
check "创建根文件夹" "$([ -n "$A" ] && echo ok)" "ok"
check "创建子文件夹 parent_id" "$(curl -s "$BASE/folders" | j "[0]['children'][0]['id']")" "$B"
check "树深度" "$(curl -s "$BASE/folders" | j "[0]['children'][0]['name']")" "子目录"
check "非法移动(self)" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/folders/$A" -H 'Content-Type: application/json' -d "{\"parent_id\":$B}")" "400"
check "非法移动(后代)" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/folders/$A" -H 'Content-Type: application/json' -d "{\"parent_id\":$A}")" "400"
check "重命名文件夹" "$(curl -s -X PATCH "$BASE/folders/$B" -H 'Content-Type: application/json' -d '{"name":"改名了"}' | j "['name']")" "改名了"

echo "== 笔记 CRUD =="
N=$(curl -s -X POST "$BASE/notes" -H 'Content-Type: application/json' -d "{\"title\":\"第一篇\",\"folder_id\":$A}" | j "['id']")
check "新建笔记" "$([ -n "$N" ] && echo ok)" "ok"
check "空笔记 content" "$(curl -s "$BASE/notes/$N" | j "['content']['type']")" "doc"
check "note_count" "$(curl -s "$BASE/folders" | j "[0]['note_count']")" "1"

curl -s -X PATCH "$BASE/notes/$N" -H 'Content-Type: application/json' \
  -d '{"title":"改标题","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"正文内容"}]}]}}' > /dev/null
DETAIL=$(curl -s "$BASE/notes/$N")
check "更新标题" "$(echo "$DETAIL" | j "['title']")" "改标题"
check "plain_text 由后端算出" "$(echo "$DETAIL" | j "['plain_text']")" "正文内容"
check "时间带 Z" "$(echo "$DETAIL" | j "['updated_at'][-1]")" "Z"
check "列表摘要" "$(curl -s "$BASE/notes" | j "[0]['plain_text']")" "正文内容"
check "按文件夹过滤" "$(curl -s "$BASE/notes?folder_id=$A" | j "len(data)")" "1"
check "unfiled 过滤" "$(curl -s "$BASE/notes?unfiled=true" | j "len(data)")" "0"

echo "== 导入 Markdown =="
IMPORT=$(curl -s -X POST "$BASE/notes/import" -H 'Content-Type: application/json' -d "$(python3 - "$B" <<'PY'
import json, sys
md = (
    "---\ntitle: 导入的标题\n---\n\n# 一级\n\n"
    "- [x] 完成项\n- [ ] 待办项\n\n"
    "```python\nprint(1)\n```\n\n"
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n"
)
print(json.dumps({"folder_id": int(sys.argv[1]), "files": [{"name": "demo.md", "content": md}]}, ensure_ascii=False))
PY
)")
IMP_ID=$(echo "$IMPORT" | j "['created'][0]['id']")
check "导入返回 created" "$([ -n "$IMP_ID" ] && echo ok)" "ok"
check "front-matter 作标题" "$(echo "$IMPORT" | j "['created'][0]['title']")" "导入的标题"
check "保留了 raw_md" "$(echo "$IMPORT" | j "['created'][0]['raw_md'] is not None")" "True"
IMPORT_CONTENT=$(echo "$IMPORT" | j "['created'][0]['content']")
check "导入解析出 taskList" "$(echo "$IMPORT_CONTENT" | grep -c 'taskList')" "1"
check "导入解析出 table" "$(echo "$IMPORT_CONTENT" | grep -c '"table"' )" "1"
check "子文件夹 note_count" "$(curl -s "$BASE/folders" | j "[0]['children'][0]['note_count']")" "1"

echo "== 移动 / 删除 =="
check "笔记改归属到未归档" "$(curl -s -X PATCH "$BASE/notes/$N" -H 'Content-Type: application/json' -d '{"folder_id":null}' | j "['folder_id']")" "None"
check "未归档计数" "$(curl -s "$BASE/notes?unfiled=true" | j "len(data)")" "1"
check "删除笔记" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/notes/$N")" "204"
check "删除后 404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/notes/$N")" "404"
check "删除根文件夹(级联)" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/folders/$A")" "204"
check "级联删掉子文件夹里的笔记" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/notes/$IMP_ID")" "404"
check "文件夹树已空" "$(curl -s "$BASE/folders" | j "len(data)")" "0"
check "不存在的文件夹 404" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/folders/99999" -H 'Content-Type: application/json' -d '{"name":"x"}')" "404"

echo
echo "通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" -eq 0 ]

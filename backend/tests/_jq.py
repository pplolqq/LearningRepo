"""从 stdin 读 JSON，按路径表达式取字段并打印（冒烟测试用的极简 jq）。

    echo '{"a":{"b":[1,2]}}' | python3 tests/_jq.py "['a']['b'][1]"
    echo '[1,2,3]'           | python3 tests/_jq.py "len(data)"

表达式以 `[` 开头时自动补上 `data` 前缀，否则当作完整 Python 表达式求值。
"""

from __future__ import annotations

import json
import sys

data = json.load(sys.stdin)
expression = sys.argv[1]
source = expression if not expression.startswith("[") else "data" + expression
result = eval(source)  # noqa: S307 - 仅用于本地测试脚本
if isinstance(result, (dict, list)):
    print(json.dumps(result, ensure_ascii=False))
else:
    print(result)

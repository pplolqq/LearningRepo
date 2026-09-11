"""md_convert 的自测脚本（零依赖，直接 `python tests/test_md_convert.py` 运行）。

覆盖 docs/SPEC.md §5 的转换规则表。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.md_convert import (  # noqa: E402
    extract_plain_text,
    guess_title,
    markdown_to_tiptap,
)

WHITELIST = {
    "doc",
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "taskList",
    "taskItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "image",
    "table",
    "tableRow",
    "tableHeader",
    "tableCell",
    "text",
    "hardBreak",
}
MARK_WHITELIST = {
    "bold",
    "italic",
    "strike",
    "code",
    "underline",
    "link",
    "highlight",
    "subscript",
    "superscript",
}

failures: list[str] = []
checked = 0


def check(label: str, condition: bool, extra: str = "") -> None:
    global checked
    checked += 1
    if not condition:
        failures.append(f"[{label}] {extra}")


def assert_whitelist(label: str, node) -> None:
    if isinstance(node, list):
        for item in node:
            assert_whitelist(label, item)
        return
    if not isinstance(node, dict):
        return
    ntype = node.get("type")
    check(f"{label}:节点白名单 {ntype}", ntype in WHITELIST, f"未知节点 {ntype!r}")
    for mark in node.get("marks") or []:
        check(f"{label}:mark白名单 {mark.get('type')}", mark.get("type") in MARK_WHITELIST, str(mark))
    for child in node.get("content") or []:
        assert_whitelist(label, child)


def convert(label: str, md: str):
    doc = markdown_to_tiptap(md)
    assert_whitelist(label, doc)
    check(f"{label}:doc结构", doc.get("type") == "doc", json.dumps(doc, ensure_ascii=False)[:200])
    check(f"{label}:doc非空", bool(doc.get("content")), json.dumps(doc, ensure_ascii=False)[:200])
    return doc


def types_of(doc) -> list[str]:
    return [n["type"] for n in doc["content"]]


# ------------------------------------------------------------------ 基础块级
doc = convert("标题", "# H1\n\n## H2\n\n###### H6\n")
check("标题:数量", types_of(doc) == ["heading", "heading", "heading"], str(types_of(doc)))
check("标题:level", [n["attrs"]["level"] for n in doc["content"]] == [1, 2, 6], str(doc))

doc = convert("段落", "普通段落，含 **粗**、*斜*、~~删~~、`代码`。\n")
marks = {m["type"] for n in doc["content"][0]["content"] for m in (n.get("marks") or [])}
check("段落:marks", {"bold", "italic", "strike", "code"} <= marks, str(marks))

doc = convert("无序列表", "- a\n- b\n")
check("无序列表:结构", types_of(doc) == ["bulletList"], str(types_of(doc)))
check("无序列表:items", len(doc["content"][0]["content"]) == 2, json.dumps(doc, ensure_ascii=False))

doc = convert("有序列表", "3. a\n4. b\n")
check("有序列表:start", doc["content"][0]["attrs"]["start"] == 3, str(doc))

doc = convert("待办", "- [ ] 未完成\n- [x] 已完成\n")
task_list = doc["content"][0]
check("待办:taskList", task_list["type"] == "taskList", str(task_list["type"]))
check(
    "待办:checked",
    [item["attrs"]["checked"] for item in task_list["content"]] == [False, True],
    json.dumps(task_list, ensure_ascii=False),
)
first_text = task_list["content"][0]["content"][0]["content"][0]["text"]
check("待办:去掉标记", first_text == "未完成", repr(first_text))

doc = convert("混合列表", "- [ ] a\n- 普通项\n")
check("混合列表:降级为无序", doc["content"][0]["type"] == "bulletList", str(doc["content"][0]["type"]))
check(
    "混合列表:保留原文",
    "[ ] a" in extract_plain_text(doc),
    extract_plain_text(doc),
)

doc = convert("引用", "> 引用内容\n> 第二行\n")
check("引用:结构", doc["content"][0]["type"] == "blockquote", str(doc))
check("引用:嵌套段落", doc["content"][0]["content"][0]["type"] == "paragraph", str(doc))

doc = convert("代码块", "```python\nprint('hi')\n```\n")
check("代码块:language", doc["content"][0]["attrs"]["language"] == "python", str(doc))
check("代码块:text", doc["content"][0]["content"][0]["text"] == "print('hi')", str(doc))

doc = convert("无语言代码块", "```\nplain\n```\n")
check("无语言代码块:language=None", doc["content"][0]["attrs"]["language"] is None, str(doc))

doc = convert("分割线", "a\n\n---\n\nb\n")
check("分割线", "horizontalRule" in types_of(doc), str(types_of(doc)))

# ------------------------------------------------------------------ 内联
doc = convert("链接", "[示例](https://example.com)\n")
link_marks = [m for n in doc["content"][0]["content"] for m in (n.get("marks") or []) if m["type"] == "link"]
check("链接:href", link_marks and link_marks[0]["attrs"]["href"] == "https://example.com", str(link_marks))

doc = convert("高亮", "这是 ==重点== 内容\n")
marks = {m["type"] for n in doc["content"][0]["content"] for m in (n.get("marks") or [])}
check("高亮", "highlight" in marks, str(marks) + extract_plain_text(doc))

doc = convert("上下标", "H~2~O 和 E=mc^2^\n")
marks = {m["type"] for n in doc["content"][0]["content"] for m in (n.get("marks") or [])}
check("下标", "subscript" in marks, str(marks))
check("上标", "superscript" in marks, str(marks))

doc = convert("HTML内联", "下划线<u>这里</u>，换行<br>之后，<span>未知标签</span>。\n")
marks = {m["type"] for n in doc["content"][0]["content"] for m in (n.get("marks") or [])}
check("HTML:u→underline", "underline" in marks, str(marks))
check("HTML:br→hardBreak", any(n["type"] == "hardBreak" for n in doc["content"][0]["content"]), str(doc))
check("HTML:未知标签保留文字", "未知标签" in extract_plain_text(doc), extract_plain_text(doc))
check("HTML:未知标签丢弃标签", "<span>" not in extract_plain_text(doc), extract_plain_text(doc))

doc = convert("硬换行", "第一行  \n第二行\n")
check("硬换行", any(n["type"] == "hardBreak" for n in doc["content"][0]["content"]), str(doc))

# ------------------------------------------------------------------ 图片 / 表格
doc = convert("独占段落图片", "![描述](https://img.test/a.png)\n")
check("图片:块级", doc["content"][0]["type"] == "image", str(doc))
check("图片:attrs", doc["content"][0]["attrs"]["src"] == "https://img.test/a.png", str(doc))
check("图片:alt", doc["content"][0]["attrs"]["alt"] == "描述", str(doc))

doc = convert("行内图片", "文字 ![描述](https://img.test/a.png) 结尾\n")
check("行内图片:降级为链接", doc["content"][0]["type"] == "paragraph", str(doc))
check(
    "行内图片:URL可见",
    "https://img.test/a.png" in json.dumps(doc, ensure_ascii=False),
    json.dumps(doc, ensure_ascii=False),
)

table_md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n"
doc = convert("表格", table_md)
table = doc["content"][0]
check("表格:type", table["type"] == "table", str(table["type"]))
check("表格:行数", len(table["content"]) == 3, str(len(table["content"])))
check("表格:表头", table["content"][0]["content"][0]["type"] == "tableHeader", str(table["content"][0]))
check("表格:单元格", table["content"][1]["content"][0]["type"] == "tableCell", str(table["content"][1]))
check(
    "表格:attrs",
    table["content"][0]["content"][0]["attrs"] == {"colspan": 1, "rowspan": 1, "colwidth": None},
    str(table["content"][0]["content"][0]),
)

# ------------------------------------------------------------------ 降级兜底
html_block_md = "<details>\n<summary>点我</summary>\n内容\n</details>\n"
doc = convert("HTML块降级", html_block_md)
check("HTML块:codeBlock", doc["content"][0]["type"] == "codeBlock", str(doc))
check("HTML块:保留原文", "<details>" in extract_plain_text(doc), extract_plain_text(doc))

# 脚注（markdown-it 默认不支持）不应丢字
footnote_md = "正文[^1]\n\n[^1]: 脚注内容\n"
doc = convert("脚注降级", footnote_md)
plain = extract_plain_text(doc)
check("脚注:保留文字", "脚注内容" in plain, plain)

doc = convert("空文档", "")
check("空文档:doc", doc["type"] == "doc", str(doc))
check("空文档:一个空段落", doc["content"] == [{"type": "paragraph"}], str(doc))

doc = convert("纯空白", "   \n\n  \n")
check("纯空白:一个空段落", doc["content"] == [{"type": "paragraph"}], str(doc))

# ------------------------------------------------------------------ front matter / 标题推断
fm = "---\ntitle: 我的标题\ntags: [a, b]\n---\n\n# 正文标题\n\n内容\n"
doc = convert("front matter", fm)
check("front matter:不计入正文", "我的标题" not in extract_plain_text(doc), extract_plain_text(doc))
check("front matter:正文保留", "内容" in extract_plain_text(doc), extract_plain_text(doc))
check("front matter:标题优先级", guess_title(fm, "x.md") == "我的标题", guess_title(fm, "x.md"))
check("标题推断:H1", guess_title("# 一级标题\n", "x.md") == "一级标题", guess_title("# 一级标题\n", "x.md"))
check("标题推断:文件名", guess_title("没有标题\n", "我的笔记.md") == "我的笔记", guess_title("没有标题\n", "我的笔记.md"))
check("标题推断:去markdown标记", guess_title("# **加粗** `代码`\n", "x.md") == "加粗 代码", guess_title("# **加粗** `代码`\n", "x.md"))

# ------------------------------------------------------------------ 复杂嵌套
complex_md = """---
title: 综合测试
---

# 项目说明

这是一个 **综合** 测试，包含 [链接](https://a.b) 与 ==高亮==。

## 待办

- [x] 已完成
- [ ] 待处理
  - 嵌套子项

## 代码

```js
const a = 1;
```

> 引用里的 **加粗**
> - 引用里的列表

| 列1 | 列2 |
| --- | --- |
| a | b |

1. 第一
2. 第二

---

结尾段落。
"""
doc = convert("综合", complex_md)
plain = extract_plain_text(doc)
for expected in ["项目说明", "综合", "已完成", "待处理", "嵌套子项", "const a = 1;", "列1", "第一", "结尾段落"]:
    check(f"综合:{expected}", expected in plain, plain[:300])
check("综合:有 taskList", "taskList" in json.dumps(doc, ensure_ascii=False), "")
check("综合:有 table", "table" in json.dumps(doc, ensure_ascii=False), "")

# ------------------------------------------------------------------ 汇总
print(f"共检查 {checked} 项")
if failures:
    print(f"\n❌ 失败 {len(failures)} 项：")
    for item in failures:
        print("  -", item)
    sys.exit(1)
print("✅ 全部通过")

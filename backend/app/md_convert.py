"""Markdown → Tiptap JSON 转换（契约见 docs/SPEC.md §5）。

设计原则：**宁可降级，绝不丢字**。
任何无法识别的 markdown 结构都会降级成 `paragraph` 或 `codeBlock`，并把原文逐字保留下来；
整个转换过程不允许抛异常。
"""

from __future__ import annotations

import re
from typing import Any

from markdown_it import MarkdownIt

# --------------------------------------------------------------------------- 常量

EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": [{"type": "paragraph"}]}

#: 这些节点在纯文本提取时视为块级，前后补换行
_BLOCK_TYPES = frozenset(
    {
        "paragraph",
        "heading",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "codeBlock",
        "horizontalRule",
        "table",
        "tableRow",
        "tableHeader",
        "tableCell",
    }
)

#: markdown-it 内联容器 token → Tiptap mark 名
_MARK_CONTAINERS: dict[str, str] = {
    "em": "italic",
    "strong": "bold",
    "s": "strike",
    "highlight": "highlight",
    "sub": "subscript",
    "sup": "superscript",
}

#: 我们自己注入的内联容器 token 名（由下方 mark_pair 规则产生）
_EXTRA_MARKS = ("highlight", "sub", "sup")

_TASK_RE = re.compile(r"^\[([ xX])\](?=\s|$)")
_FRONT_MATTER_RE = re.compile(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", re.DOTALL)
_FRONT_MATTER_TITLE_RE = re.compile(r"^title\s*:\s*(.+)$", re.MULTILINE)
_HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)
_INLINE_MARKS_RE = re.compile(r"(\*\*|__|\*|_|~~|`)")


# --------------------------------------------------------------------- 解析器实例


def _mark_pair_rule(name: str, marker: str, allow_space: bool) -> Any:
    """生成一个 `==x==` / `~x~` / `^x^` 形式的内联规则。"""

    def rule(state: Any, silent: bool) -> bool:
        src = state.src
        pos = state.pos
        if not src.startswith(marker, pos):
            return False
        # `~` 不能吞掉 `~~`（删除线）
        if marker == "~" and src.startswith("~~", pos):
            return False

        search_from = pos + len(marker)
        end = -1
        while True:
            candidate = src.find(marker, search_from)
            if candidate < 0 or candidate >= state.posMax:
                break
            if marker == "~" and (src.startswith("~~", candidate) or candidate == pos + len(marker)):
                search_from = candidate + 1
                continue
            end = candidate
            break
        if end < 0 or end == pos + len(marker):
            return False

        content = src[pos + len(marker) : end]
        if not content.strip():
            return False
        if "\n" in content:
            return False
        if not allow_space and any(ch.isspace() for ch in content):
            return False
        if silent:
            return True

        state.push(f"{name}_open", name, 1)
        state.md.inline.parse(content, state.md, state.env, state.tokens)
        state.push(f"{name}_close", name, -1)
        state.pos = end + len(marker)
        return True

    rule.__name__ = f"{name}_rule"
    return rule


def _make_md() -> MarkdownIt:
    md = MarkdownIt(
        "commonmark",
        {"html": True, "linkify": False, "breaks": False, "typographer": False},
    )
    # GFM 表格与删除线在 commonmark preset 里是关闭的，这里显式打开
    for rule_name in ("table", "strikethrough"):
        try:
            md.enable(rule_name)
        except Exception:  # pragma: no cover - 不同版本行为差异
            pass
    # 非标准但常用的富文本语法
    md.inline.ruler.before("emphasis", "highlight", _mark_pair_rule("highlight", "==", True))
    md.inline.ruler.before("emphasis", "sub", _mark_pair_rule("sub", "~", False))
    md.inline.ruler.before("emphasis", "sup", _mark_pair_rule("sup", "^", False))
    return md


_MD = _make_md()


# --------------------------------------------------------------------------- 树构建


class _Node:
    __slots__ = ("type", "tag", "attrs", "content", "children", "hidden", "info")

    def __init__(
        self,
        type: str,  # noqa: A002
        tag: str = "",
        attrs: dict[str, Any] | None = None,
        content: str = "",
        hidden: bool = False,
        info: str = "",
    ) -> None:
        self.type = type
        self.tag = tag
        self.attrs = attrs or {}
        self.content = content
        self.hidden = hidden
        self.info = info
        self.children: list[_Node] = []


def _node_from_token(token: Any) -> _Node:
    # markdown-it 的容器 token 带 `_open` / `_close` 后缀（nesting 已表达嵌套关系），
    # 归一化掉后缀，转换表里就只需要处理 `heading` / `paragraph` 这类裸名字。
    raw_type = token.type or ""
    if raw_type.endswith("_open") or raw_type.endswith("_close"):
        raw_type = raw_type.rsplit("_", 1)[0]
    return _Node(
        type=raw_type,
        tag=token.tag or "",
        attrs=dict(token.attrs or {}),
        content=token.content or "",
        hidden=bool(token.hidden),
        info=token.info or "",
    )


def _build_nodes(tokens: list[Any]) -> list[_Node]:
    """把 markdown-it 的扁平 token 流（含 nesting）还原成树。"""
    root = _Node("root")
    stack: list[_Node] = [root]
    for token in tokens:
        if token.nesting == 1:
            node = _node_from_token(token)
            stack[-1].children.append(node)
            if token.children:
                node.children = _build_nodes(list(token.children))
            stack.append(node)
        elif token.nesting == -1:
            if len(stack) > 1:
                stack.pop()
        else:
            node = _node_from_token(token)
            if token.children:
                node.children = _build_nodes(list(token.children))
            stack[-1].children.append(node)
    return root.children


# ------------------------------------------------------------------- 内联 → Tiptap


def _mark(name: str, attrs: dict[str, Any] | None = None) -> dict[str, Any]:
    mark: dict[str, Any] = {"type": name}
    if attrs:
        mark["attrs"] = attrs
    return mark


def _push_text(out: list[dict[str, Any]], text: str, marks: list[dict[str, Any]]) -> None:
    """写入 text 节点；与上一个节mark 完全相同则合并。

    ProseMirror 会把相邻的同 mark text 节点合成一个，这里提前做归一化，
    保证入库的 JSON 与前端保存回来的形态一致（diff 稳定、契约校验可逐字比对）。
    """
    if not text:
        return
    if out:
        last = out[-1]
        if last.get("type") == "text" and list(last.get("marks") or []) == marks:
            last["text"] = str(last.get("text") or "") + text
            return
    node: dict[str, Any] = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    out.append(node)


def _image_node(token: _Node) -> dict[str, Any]:
    src = str(token.attrs.get("src") or "")
    alt = token.content or ""
    title = token.attrs.get("title")
    return {
        "type": "image",
        "attrs": {"src": src, "alt": alt or None, "title": title or None},
    }


def _inline(nodes: list[_Node], marks: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    """内联 token 列表 → Tiptap inline 节点列表。"""
    out: list[dict[str, Any]] = []
    local = list(marks)
    for node in nodes:
        ntype = node.type

        if ntype == "text":
            if node.content:
                _push_text(out, node.content, [_mark(m) for m in local])
        elif ntype == "softbreak":
            _push_text(out, " ", [_mark(m) for m in local])
        elif ntype == "hardbreak":
            out.append({"type": "hardBreak"})
        elif ntype == "code_inline":
            _push_text(out, node.content, [_mark(m) for m in local] + [_mark("code")])
        elif ntype == "image":
            # 行内图片无法作为块节点插入段落，降级为链接文本，URL 保留可见
            src = str(node.attrs.get("src") or "")
            label = node.content or src
            _push_text(
                out,
                label,
                [_mark(m) for m in local] + [_mark("link", {"href": src, "target": "_blank"})],
            )
        elif ntype == "html_inline":
            if _BR_RE.match(node.content or ""):
                out.append({"type": "hardBreak"})
            else:
                _apply_html_mark(node.content, local)
        elif ntype in _MARK_CONTAINERS:
            out.extend(_inline(node.children, tuple(local + [_MARK_CONTAINERS[ntype]])))
        elif ntype == "link":
            href = str(node.attrs.get("href") or "")
            out.extend(_inline(node.children, tuple(local + [f"__link__{href}"])))
        elif node.children:
            out.extend(_inline(node.children, tuple(local)))
        elif node.content:
            _push_text(out, node.content, [_mark(m) for m in local])

    # 把 __link__ 占位替换成真正的 link mark
    for item in out:
        marks_list = item.get("marks")
        if not marks_list:
            continue
        new_marks: list[dict[str, Any]] = []
        for m in marks_list:
            if m["type"].startswith("__link__"):
                new_marks.append(_mark("link", {"href": m["type"][len("__link__") :], "target": "_blank"}))
            else:
                new_marks.append(m)
        item["marks"] = new_marks
    return out


_HTML_MARK_TAGS = {"u": "underline", "sub": "subscript", "sup": "superscript"}
_BR_RE = re.compile(r"^<\s*br\s*/?\s*>$", re.IGNORECASE)

#: `[^1]: 脚注内容` 会被 markdown-it 当成链接引用定义而**整段吞掉**，
#: 这里先转义掉方括号，保证脚注原文以普通文字保留下来。
_FOOTNOTE_DEF_RE = re.compile(r"^(\s*)\[\^([^\]\n]+)\]:", re.MULTILINE)


def _apply_html_mark(raw: str, local: list[str]) -> None:
    """处理内联 HTML：`<br>` → 由调用方转 hardBreak 太麻烦，这里只处理成对标签与换行。"""
    match = re.match(r"^<\s*(/?)\s*([a-zA-Z0-9]+)", raw or "")
    if not match:
        return
    closing, tag = match.group(1) == "/", match.group(2).lower()
    mark_name = _HTML_MARK_TAGS.get(tag)
    if mark_name is None:
        return  # 未知标签：丢弃标签本身，内部文字保留
    if closing:
        if mark_name in local:
            local.remove(mark_name)
    else:
        local.append(mark_name)


def _sole_image(children: list[_Node]) -> _Node | None:
    """段落里只有一个图片时，提到块级别。"""
    found: list[_Node] = []
    for child in children:
        if child.type == "inline":
            items = [c for c in child.children if not (c.type == "text" and not c.content.strip())]
            if len(items) == 1 and items[0].type == "image":
                found.append(items[0])
            else:
                return None
        elif child.type == "text" and not child.content.strip():
            continue
        else:
            return None
    return found[0] if len(found) == 1 else None


# ------------------------------------------------------------------- 块级 → Tiptap


def _ensure_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return blocks or [{"type": "paragraph"}]


def _first_inline(item: _Node) -> _Node | None:
    if not item.children:
        return None
    first = item.children[0]
    if first.type != "paragraph":
        return None
    for token in first.children:
        if token.type == "inline":
            return token
    return None


def _peek_task(item: _Node) -> bool | None:
    inline = _first_inline(item)
    if inline is None:
        return None
    match = _TASK_RE.match(inline.content)
    if not match:
        return None
    return match.group(1).lower() == "x"


def _strip_task_marker(inline: _Node) -> None:
    match = _TASK_RE.match(inline.content)
    if not match:
        return
    remaining = match.end()
    if inline.content[remaining : remaining + 1] == " ":
        remaining += 1
    for token in inline.children:
        if remaining <= 0:
            break
        if token.type == "text" and token.content:
            take = min(len(token.content), remaining)
            token.content = token.content[take:]
            remaining -= take
        else:
            break
    inline.content = inline.content[match.end() :].lstrip(" ")


def _list_item(item: _Node, checked: bool | None) -> dict[str, Any]:
    blocks = _ensure_blocks(_blocks(item.children))
    if blocks[0]["type"] != "paragraph":
        blocks = [{"type": "paragraph"}, *blocks]
    if checked is None:
        return {"type": "listItem", "content": blocks}
    return {"type": "taskItem", "attrs": {"checked": checked}, "content": blocks}


def _table_rows(table: _Node) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for section in table.children:
        if section.type != "tr" and not section.children:
            continue
        row_nodes = section.children if section.type != "tr" else [section]
        for row in row_nodes:
            if row.type != "tr":
                continue
            cells: list[dict[str, Any]] = []
            for cell in row.children:
                if cell.type not in ("th", "td"):
                    continue
                cell_type = "tableHeader" if cell.type == "th" else "tableCell"
                cells.append(
                    {
                        "type": cell_type,
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                        "content": _ensure_blocks(_blocks(cell.children)),
                    }
                )
            if cells:
                rows.append({"type": "tableRow", "content": cells})
    return rows


def _blocks(nodes: list[_Node]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for node in nodes:
        out.extend(_block(node))
    return out


def _block(node: _Node) -> list[dict[str, Any]]:  # noqa: C901 - 转换表本身就是长分支
    ntype = node.type

    if ntype in ("front_matter", "tfoot"):
        return []

    if ntype == "paragraph":
        image = _sole_image(node.children)
        if image is not None:
            return [_image_node(image)]
        inline = _inline(node.children)
        return [{"type": "paragraph", "content": inline}] if inline else [{"type": "paragraph"}]

    if ntype == "heading":
        level = int(node.tag[1:]) if node.tag[1:].isdigit() else 1
        level = max(1, min(6, level))
        inline = _inline(node.children)
        heading: dict[str, Any] = {"type": "heading", "attrs": {"level": level}}
        if inline:
            heading["content"] = inline
        return [heading]

    if ntype == "blockquote":
        return [{"type": "blockquote", "content": _ensure_blocks(_blocks(node.children))}]

    if ntype in ("bullet_list", "ordered_list"):
        items = [c for c in node.children if c.type == "list_item"]
        task_states = [_peek_task(item) for item in items]
        all_task = bool(task_states) and all(state is not None for state in task_states)
        if all_task:
            for item in items:
                inline = _first_inline(item)
                if inline is not None:
                    _strip_task_marker(inline)
            return [{"type": "taskList", "content": [_list_item(i, s) for i, s in zip(items, task_states)]}]
        if ntype == "ordered_list":
            start = int(node.attrs.get("start") or 1)
            return [
                {
                    "type": "orderedList",
                    "attrs": {"start": start},
                    "content": [_list_item(i, None) for i in items],
                }
            ]
        return [{"type": "bulletList", "content": [_list_item(i, None) for i in items]}]

    if ntype == "table":
        rows = _table_rows(node)
        return [{"type": "table", "content": rows}] if rows else []

    if ntype in ("fence", "code_block"):
        language = (node.info or "").strip() if ntype == "fence" else ""
        code = node.content.rstrip("\n")
        first_word = language.split()[0] if language.split() else None
        block: dict[str, Any] = {"type": "codeBlock", "attrs": {"language": first_word}}
        if code:
            block["content"] = [{"type": "text", "text": code}]
        return [block]

    if ntype == "hr":
        return [{"type": "horizontalRule"}]

    if ntype == "html_block":
        # 无法安全解析的 HTML 块：原样塞进代码块，绝不丢内容
        raw = (node.content or "").strip("\n")
        block = {"type": "codeBlock", "attrs": {"language": "html"}}
        if raw:
            block["content"] = [{"type": "text", "text": raw}]
        return [block]

    if ntype in ("thead", "tbody"):
        return _blocks(node.children)

    if ntype == "tr":
        return []

    # 兜底：有子节点就递归，没有就把原文变成段落
    if node.children:
        blocks = _blocks(node.children)
        if blocks:
            return blocks
    if node.content.strip():
        return [{"type": "paragraph", "content": [{"type": "text", "text": node.content}]}]
    return []


# --------------------------------------------------------------- 对外的三个函数


def strip_front_matter(md: str) -> str:
    """去掉 YAML front matter，返回正文。"""
    return _FRONT_MATTER_RE.sub("", md, count=1).lstrip("\n")


def extract_front_matter_title(md: str) -> str | None:
    match = _FRONT_MATTER_RE.match(md)
    if not match:
        return None
    title_match = _FRONT_MATTER_TITLE_RE.search(match.group(1))
    if not title_match:
        return None
    return title_match.group(1).strip().strip("\"'") or None


def guess_title(md: str, filename: str = "") -> str:
    """front-matter title → 首个 H1 → 文件名（去扩展名）。"""
    title = extract_front_matter_title(md)
    if title:
        return title
    body = strip_front_matter(md)
    match = _HEADING_RE.search(body)
    if match:
        heading = _INLINE_MARKS_RE.sub("", match.group(1)).strip()
        if heading:
            return heading[:200]
    if filename:
        stem = re.sub(r"\.(md|markdown|txt)$", "", filename, flags=re.IGNORECASE).strip()
        if stem:
            return stem[:200]
    return ""


def neutralize_footnotes(md: str) -> str:
    """把脚注定义转义成普通文字，避免被 markdown-it 的链接引用定义规则吞掉。"""
    return _FOOTNOTE_DEF_RE.sub(lambda m: f"{m.group(1)}\\[^{m.group(2)}\\]:", md)


def markdown_to_tiptap(md: str) -> dict[str, Any]:
    """markdown 文本 → Tiptap JSON。任何异常都降级为「原文代码块」。"""
    body = neutralize_footnotes(strip_front_matter(md or ""))
    if not body.strip():
        return {"type": "doc", "content": [{"type": "paragraph"}]}
    try:
        tokens = _MD.parse(body)
        content = _blocks(_build_nodes(list(tokens)))
    except Exception:  # pragma: no cover - 兜底分支
        content = []
    if not content:
        content = [{"type": "codeBlock", "attrs": {"language": "markdown"}, "content": [{"type": "text", "text": body.strip()}]}]
    return {"type": "doc", "content": content}


def content_has_content(content: dict[str, Any] | None) -> bool:
    if not content or not isinstance(content, dict):
        return False
    if content.get("type") != "doc":
        return False
    return bool(content.get("content"))


def normalize_content(content: dict[str, Any] | None) -> dict[str, Any]:
    """校验前端传来的 content，非法时给空文档。"""
    if not content_has_content(content):
        return {"type": "doc", "content": [{"type": "paragraph"}]}
    return content  # type: ignore[return-value]


def extract_plain_text(content: dict[str, Any] | None) -> str:
    """提取纯文本，用于列表摘要（以及将来的全文搜索）。"""
    if not content:
        return ""
    parts: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        ntype = node.get("type")
        if ntype == "text":
            parts.append(str(node.get("text") or ""))
            return
        if ntype == "hardBreak":
            parts.append("\n")
            return
        if ntype == "image":
            alt = (node.get("attrs") or {}).get("alt")
            if alt:
                parts.append(str(alt))
            return
        if ntype == "codeBlock":
            code = "".join(str(c.get("text") or "") for c in node.get("content") or [])
            if code:
                parts.append(f"\n{code}\n")
            return
        if ntype in _BLOCK_TYPES:
            parts.append("\n")
        for child in node.get("content") or []:
            walk(child)
        if ntype in _BLOCK_TYPES:
            parts.append("\n")

    walk(content)
    text = "".join(parts)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

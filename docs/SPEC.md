# noteTipTap · 接口契约与编辑器 Schema（冻结版 v1）

> 前后端**必须**严格遵守本文件。任何一侧改动此契约，另一侧同步。
> 契约版本：v1

---

## 1. 技术栈与端口

| 层 | 选型 | 端口 |
|----|------|------|
| 后端 | Python 3.10 + FastAPI + SQLAlchemy 2.x + SQLite | `127.0.0.1:8000` |
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Tiptap v3 + Pinia | `127.0.0.1:5173` |

- 前端所有请求走**相对路径** `/api/...`，由 Vite dev server 代理到 `127.0.0.1:8000`。
- 后端开启 CORS 允许 `http://localhost:5173` 与 `http://127.0.0.1:5173`（直连调试用）。

---

## 2. 编辑器节点 / Mark 白名单（唯一真相）

后端 markdown→JSON 转换器产出的节点、前端 Tiptap 扩展注册的节点，**必须与下表逐字一致**。
不在白名单内的 markdown 语法，后端必须在**不丢内容**的前提下就近降级（见 §5）。

### 2.1 Block 节点

| type | attrs | content | 说明 |
|------|-------|---------|------|
| `doc` | — | `block+` | 根节点 |
| `paragraph` | — | `inline*` | 段落 |
| `heading` | `{ level: 1..6 }` | `inline*` | 标题 |
| `bulletList` | — | `listItem+` | 无序列表 |
| `orderedList` | `{ start: number }` | `listItem+` | 有序列表 |
| `listItem` | — | `paragraph block*` | 列表项 |
| `taskList` | — | `taskItem+` | 待办列表 |
| `taskItem` | `{ checked: boolean }` | `paragraph block*` | 待办项 |
| `blockquote` | — | `block+` | 引用 |
| `codeBlock` | `{ language: string \| null }` | `text*` | 代码块 |
| `horizontalRule` | — | — | 分割线 |
| `image` | `{ src: string, alt: string \| null, title: string \| null }` | — | 外链图片，**不做上传** |
| `table` | — | `tableRow+` | 表格（最小支持） |
| `tableRow` | — | `tableCell+ \| tableHeader+` | |
| `tableHeader` | `{ colspan: number, rowspan: number, colwidth: number[] \| null }` | `block+` | |
| `tableCell` | `{ colspan: number, rowspan: number, colwidth: number[] \| null }` | `block+` | |

### 2.2 Inline 节点

| type | attrs |
|------|-------|
| `text` | `{ text: string }`（可选 `marks`） |
| `hardBreak` | — |

### 2.3 Mark

| type | attrs | Markdown 来源 |
|------|-------|---------------|
| `bold` | — | `**x**` |
| `italic` | — | `*x*` |
| `strike` | — | `~~x~~` |
| `code` | — | `` `x` `` |
| `underline` | — | `<u>x</u>` |
| `link` | `{ href: string, target: "_blank" }` | `[t](url)` |
| `highlight` | — | `==x==` |
| `subscript` | — | `~x~`（非标准，解析器实现为 `<sub>`） |
| `superscript` | — | `^x^`（非标准，解析器实现为 `<sup>`） |

**文本转义**：markdown 中的 HTML 内联标签（如 `<br>`、`<u>`、`<sub>`）在转换器里按上表映射；
未识别的内联 HTML 标签直接**丢弃标签、保留内部文字**。

---

## 3. 数据模型

### 3.1 Folder

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int PK | |
| `name` | str | 1..100 |
| `parent_id` | int \| null | 自引用，`null` = 根 |
| `order_index` | int | 同级排序，默认 0，越小越靠前 |
| `created_at` / `updated_at` | datetime (UTC ISO8601) | |

删除文件夹：**级联删除**其所有子文件夹与其中笔记（自用无回收站，前端二次确认）。

### 3.2 Note

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int PK | |
| `title` | str | 空则存 `未命名笔记` |
| `folder_id` | int \| null | `null` = 未归档 |
| `content_json` | TEXT | Tiptap JSON 序列化字符串 |
| `plain_text` | TEXT | 由 `content_json` 提取的纯文本，**后端负责计算**，用于列表摘要 |
| `raw_md` | TEXT \| null | 导入时的原始 markdown 全文（保底不丢内容） |
| `created_at` / `updated_at` | datetime (UTC ISO8601) | |

---

## 4. HTTP API

Base URL：`/api`。所有请求/响应 `Content-Type: application/json`，时间均为 UTC ISO8601 字符串。

### 4.1 响应体定义

```ts
type FolderRead = {
  id: number
  name: string
  parent_id: number | null
  order_index: number
  created_at: string
  updated_at: string
  note_count: number      // 该文件夹【直接】包含的笔记数（不含子文件夹）
}

type FolderNode = FolderRead & { children: FolderNode[] }   // GET /folders 返回树

type NoteListItem = {
  id: number
  title: string
  folder_id: number | null
  plain_text: string      // 截断前 500 字符
  created_at: string
  updated_at: string
}

type NoteRead = {
  id: number
  title: string
  folder_id: number | null
  content: TiptapJSON      // 注意：DB 里叫 content_json，对外字段名是 content，且是【对象】不是字符串
  raw_md: string | null
  plain_text: string
  created_at: string
  updated_at: string
}

type TiptapJSON = { type: 'doc', content?: any[] }
```

### 4.2 端点清单

| 方法 | 路径 | 请求体 / 查询 | 响应 | 说明 |
|------|------|---------------|------|------|
| GET | `/health` | — | `{ "status": "ok" }` | |
| GET | `/folders` | — | `FolderNode[]` | 完整树，按 `order_index` 再按 `id` 排序 |
| POST | `/folders` | `{ name, parent_id? }` | `FolderRead` (201) | |
| PATCH | `/folders/{id}` | `{ name?, parent_id?, order_index? }` | `FolderRead` | `parent_id` 不得指向自身或自己的后代，否则 400 |
| DELETE | `/folders/{id}` | — | 204 | 级联删除 |
| GET | `/notes` | `?folder_id=int&unfiled=true&limit=200&offset=0` | `NoteListItem[]` | 未传 `folder_id` 且未传 `unfiled` = 全部；`unfiled=true` = 仅未归档。按 `updated_at` 倒序 |
| POST | `/notes` | `{ title?, folder_id?, content? }` | `NoteRead` (201) | `content` 缺省为 `{"type":"doc","content":[{"type":"paragraph"}]}` |
| GET | `/notes/{id}` | — | `NoteRead` | 404 若不存在 |
| PATCH | `/notes/{id}` | `{ title?, folder_id?, content? }` | `NoteRead` | 所有字段可选，只更新传入的；`content` 传入则重算 `plain_text` |
| DELETE | `/notes/{id}` | — | 204 | |
| POST | `/notes/import` | `{ folder_id?: int \| null, files: [{ name: string, content: string }] }` | `{ created: NoteRead[], errors: [{name, message}][] }` | `content` 是 md 原文，后端解析入库；`title` 取 front-matter `title` 或首个 H1 或文件名（去 `.md`） |

**错误格式**（FastAPI 默认）：

```json
{ "detail": "..." }
```

---

## 5. Markdown → Tiptap JSON 转换规则（后端 `md_convert.py`）

解析器：`markdown-it-py`，preset 为 **`commonmark`**，另外显式 `enable(['table', 'strikethrough'])`，
并注册三条自定义内联规则：`==高亮==`、`~下标~`、`^上标^`（`~` 不与 `~~` 删除线冲突）。
YAML front matter 由转换器自己的正则剥离（不引入额外插件），front matter 里的 `title` 用于推断笔记标题。

**降级兜底原则：宁可降级，绝不丢字。**

| Markdown 结构 | 转换结果 |
|---------------|----------|
| `# .. ######` | `heading { level }` |
| 段落 | `paragraph` |
| `- / * / +` 列表 | `bulletList > listItem > paragraph` |
| `1.` 列表 | `orderedList { start } > listItem` |
| `- [ ] / - [x]` | `taskList > taskItem { checked }` |
| `>` 引用 | `blockquote` |
| ```` ```lang ```` | `codeBlock { language }` |
| `---` | `horizontalRule` |
| `![alt](src)` | `image { src, alt, title }` |
| GFM 表格 | `table > tableRow > tableHeader/tableCell`，首行为 header，`colspan/rowspan = 1`、`colwidth = null` |
| `[t](url)` | text + `link` mark |
| `<u>` `<sub>` `<sup>` `<br>` | 对应 mark / `hardBreak` |
| 硬换行（行尾两空格 / `\`） | `hardBreak` |
| **HTML 块（`<div>`、`<details>` 等未知标签）** | 降级为 `codeBlock { language: "html" }`，原文逐字保留 |
| 脚注（`[^1]` / `[^1]: ...`） | 定义行的方括号会被**预先转义**，避免被 markdown-it 的「链接引用定义」规则整段吞掉；脚注原文以普通文字保留在段落里 |
| 定义列表 / 数学公式等未支持语法 | 逐字降级为 `paragraph`（保留原文文字），不抛异常 |
| 空文档 | `{ type:'doc', content:[{ type:'paragraph' }] }` |

**结构化输出保证**：
- 每个生成的节点都必须能被 §2 白名单校验通过；转换器已用 318 项断言覆盖（`backend/tests/test_md_convert.py`）。
- 转换函数签名：`markdown_to_tiptap(md: str) -> dict`，**不得抛异常**（内部兜底为单代码块）。
- 另有 `normalize_content(content)` 校验前端传来的 JSON，非法时回退为空文档。
- 同时提供 `extract_plain_text(tiptap_json) -> str`：深度遍历收集所有 `text` 节点，块级节点之间补 `\n`，`codeBlock` 内容原样保留，末尾 strip。

---

## 6. 前端行为约定

| 项 | 约定 |
|----|------|
| 布局 | 左栏固定 280px（文件夹树 + 当前选中范围内的笔记列表），右侧编辑区自适应；可折叠左栏 |
| 主题 | 浅色为主，Tailwind 实现；中文界面 |
| 自动保存 | 编辑器 `onUpdate` / 标题输入 → debounce **800ms** → `PATCH /notes/{id}`；顶部状态显示 `已保存 / 保存中… / 保存失败，点击重试` |
| 切换笔记 | 切换前**强制 flush** 一次未完成的自动保存，防止丢改动 |
| Markdown 快捷输入 | Tiptap 原生 input rules：`## `→H2、`- `→无序、`1. `→有序、`> `→引用、```` ``` ````→代码块、`- [ ] ` / `- [x] `→待办、`---`→分割线 |
| 斜杠菜单 | 输入 `/` 弹出块类型面板，支持键盘上下 + Enter 选择 + Esc 关闭，可过滤 |
| 工具条 | 顶部固定工具条：粗体/斜体/下划线/删除线/行内代码/高亮/上下标/H1-H3/列表/待办/引用/代码块/表格/分割线/链接 |
| 目录预览 | 正文左侧目录列，从**文档节点**（不是 markdown 文本）抽取 heading，按 level 相对缩进；点击跳转到对应标题（移动光标 + 泊位到容器顶部 + 闪烁一下）；滚动时高亮当前所在标题；可收起（localStorage 记忆 `notetiptap.outlineCollapsed`） |
| Ctrl+S | 拦截浏览器默认的「保存网页」，改为**立即落库**（跳过去抖直接 flush），并弹一个「已保存」提示。带 Shift/Alt 的不拦；保存失败时不报「已保存」，由状态条显示重试入口 |
| 导入 | 顶部「导入 .md」按钮，支持多选；读文件用 `FileReader.readAsText`，POST `/notes/import`；导入后刷新列表并打开第一条 |
| 拖拽 | 笔记可拖到文件夹节点/根节点改归属；文件夹可拖到文件夹改父级（禁止拖到自身后代，前端拦截） |
| 未归档 | 树顶部固定「未归档」虚拟节点（`folder_id = null`），不可删除/重命名 |
| 删除 | 笔记/文件夹删除均需二次确认（文件夹需提示会连同子文件夹与笔记一起删除） |
| 持久化 | localStorage 记忆：左栏折叠状态、上次打开的笔记 id |

### 6.1 实现补充（与前端实现对齐）

- **保存前裁剪 attrs**：Tiptap 的 Link 扩展会自动补 `rel` / `class` / `title`，Image 会补
  `width` / `height`，orderedList 会补 `type`。这些都不在白名单里，前端在提交前统一按 §2 裁剪
  （`src/editor/spec.ts`），保证入库 JSON 形态稳定、可逐字比对。
- **切换笔记**：`TiptapEditor` 在 `App.vue` 里用 `:key="note.id"` 绑定，切换时整体重建。
- **斜杠菜单的图片项**：用 `window.prompt` 收集地址。`@tiptap/suggestion` 默认
  `dismissOnOutsideClick: true`，在弹层里放输入框会被 outside-click 直接关掉，所以不做行内输入态。
- **编辑器实例创建时机**：`@tiptap/vue-3` 的 `useEditor` 是在 `onMounted` 里 `new Editor(...)`，
  在挂载前 `editor.value` 是 `undefined`，工具条等消费方必须容忍这一点。
- **工具条激活态**：Vue 版的 `Editor` 把 `state` 做成了 Vue 的 `customRef`，
  在 `computed` 里直接读 `editor.isActive(...)` 即可自动追踪重渲染，无需额外订阅。

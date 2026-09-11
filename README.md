# noteTipTap

本地自用的 Markdown 笔记应用。左边文件夹树 + 笔记列表，右边是「类飞书」的块级编辑器：
输入 `## ` 变 H2、`- [ ] ` 变待办复选框，其余 Markdown 语法实时渲染，改动自动保存。

| 层 | 选型 |
|----|------|
| 编辑器 | Tiptap v3（ProseMirror） |
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia |
| 后端 | Python 3.10 + FastAPI + SQLAlchemy 2 |
| 数据库 | SQLite 单文件 |

> 接口契约与编辑器节点白名单冻结在 [`docs/SPEC.md`](docs/SPEC.md) —— 前后端都以它为准。

---

## 首次准备

```bash
# 后端（本机缺 python3-venv，setup.sh 里做了 get-pip 引导兜底）
cd backend && ./setup.sh

# 前端
cd ../frontend && pnpm install
```

## 日常启动（两个终端）

```bash
# 终端 1 —— 后端
cd backend && ./.venv/bin/python run.py          # http://127.0.0.1:8000

# 终端 2 —— 前端
cd frontend && pnpm dev                          # http://127.0.0.1:5173
```

打开 <http://127.0.0.1:5173> 即可。前端请求走相对路径 `/api/...`，由 Vite 代理到后端，
不需要额外配置后端地址。API 文档在 <http://127.0.0.1:8000/docs>。

## 测试与校验

```bash
# 后端：markdown → Tiptap JSON 转换器（约 315 项断言）
cd backend && ./.venv/bin/python tests/test_md_convert.py

# 后端：接口冒烟（需先启动服务；会清空并重建测试数据）
cd backend && ./tests/smoke_api.sh

# 前端：类型检查 + 生产构建
cd frontend && pnpm build

# 前后端契约校验（推荐改完任何一侧的 schema 后都跑一次）
cd frontend && ./scripts/check-contract.sh
```

`check-contract.sh` 会用后端转换器解析 `backend/tests/fixtures/sample.md`，再用**真实的
Tiptap schema** 反序列化，校验节点/mark 类型逐字对齐、内容表达式合法、往返无内容损失。
这一步很关键：类型对不上时 ProseMirror 是**静默丢弃**内容的，只有运行时才看得出来。

## 数据与备份

- 全部数据在 `backend/data/notes.db`（WAL 模式，还有 `-wal` / `-shm` 两个伴随文件）。
- 备份：停服后拷贝整个 `backend/data/` 目录。
- `Note.raw_md` 保存导入文件的 markdown 原文，即使解析降级也不会丢内容。

---

## 目录

```
noteTipTap/
├── docs/SPEC.md          接口契约 + 编辑器节点白名单（冻结）
├── backend/              FastAPI + SQLite，见 backend/README.md
└── frontend/             Vue 3 + Tiptap，见 frontend/README.md
```

## 已实现

- 笔记 CRUD、多级文件夹树（折叠 / 拖拽移动 / 重命名 / 级联删除）
- 块级编辑器：Markdown 快捷输入、斜杠命令菜单、工具条、代码块高亮、表格、待办列表
- 目录预览：按 `#` 标题生成大纲，层级缩进 + 点击跳转 + 滚动高亮，可收起
- 自动保存（800ms 去抖，失败可点重试，切换笔记前强制 flush）；`Ctrl/Cmd+S` 立即保存，屏蔽浏览器默认行为
- `.md` 导入（尽力转换 + 兜底保留原文 + 存 `raw_md` 原文）
- 图片：仅支持外链 URL（粘贴 / 拖拽上传未做）

## 未实现（按需再加）

全文搜索、导出 Markdown/HTML、回收站、深色模式、标签、历史版本、用户系统、图片上传。
SQLite 的 `Note.plain_text` 已经在写，接全文搜索（FTS5）时不需要补数据。
# noteTipTap 前端

Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Tiptap v3 + Pinia。

## 启动

**先起后端**（另开一个终端）：

```bash
cd ../backend && ./.venv/bin/python run.py     # http://127.0.0.1:8000
```

**再起前端**：

```bash
cd frontend
pnpm install
pnpm dev                                       # http://127.0.0.1:5173
```

打开 <http://127.0.0.1:5173>。前端所有请求走相对路径 `/api/...`，由 Vite dev server 代理到
`127.0.0.1:8000`，所以前端不需要配任何后端地址。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 开发服务器（5173，热更新） |
| `pnpm build` | `vue-tsc --noEmit` + 生产构建到 `dist/` |
| `pnpm typecheck` | 只做类型检查 |
| `pnpm preview` | 预览构建产物 |
| `./scripts/check-contract.sh` | **前后端契约校验**（重要，见下） |

## 契约校验

后端 markdown 转换器产出的节点类型，必须和前端注册的 Tiptap 扩展**逐字对齐**；
名字不一致或嵌套不合法时，ProseMirror 会**静默丢弃**内容，只有运行时才看得出来。

```bash
./scripts/check-contract.sh
```

它做三件事：

1. 用后端转换器解析 `backend/tests/fixtures/sample.md`（覆盖全部语法分支）→ JSON
2. 用 `vite build --ssr` 把 `scripts/check-schema.ts` 打包出来（复用真实别名与依赖）
3. 在 Node 里用**真实的 Tiptap schema** 反序列化，校验：
   - schema 注册的节点 / mark 与 SPEC §2 白名单完全一致，不多不少
   - 后端产出的每个类型前端都认识
   - `schema.nodeFromJSON(doc).check()` 内容表达式合法
   - 「解析 → 保存前裁剪 attrs」往返后 JSON 完全一致（无内容损失）

## 目录

```
frontend/
├── src/
│   ├── api/            types.ts（严格对应 SPEC §4.1）/ client.ts（axios 封装）
│   ├── components/
│   │   ├── AppSidebar.vue / FolderTree.vue / FolderTreeNode.vue / NoteList.vue
│   │   ├── ContextMenu.vue / ConfirmDialog.vue / ImportButton.vue / SaveStatus.vue
│   │   └── editor/
│   │       ├── TiptapEditor.vue      编辑器面板（标题 + 工具条 + 正文 + 字数）
│   │       ├── EditorToolbar.vue     顶部工具条
│   │       ├── SlashMenu.vue         斜杠菜单 UI（Teleport + floating-ui）
│   │       ├── slashMenuState.ts     菜单状态（模块级，供 UI 消费）
│   │       └── slashCommand.ts       @tiptap/suggestion 扩展 + 命令表
│   ├── composables/    useAutoSave.ts（800ms 去抖）/ useConfirm.ts
│   ├── editor/
│   │   ├── extensions.ts   扩展注册（与 SPEC §2 白名单一一对应）
│   │   ├── spec.ts         白名单表 + 保存前 attrs 裁剪
│   │   └── document.ts     空文档兜底 / 转 payload
│   ├── stores/noteStore.ts 文件夹树、笔记列表、当前笔记、保存状态
│   └── utils/              拖拽、文件夹树、时间格式化
└── scripts/                契约校验
```

## 几个实现要点

- **编辑器实例的生命周期**：`TiptapEditor.vue` 在 `App.vue` 里用 `:key="note.id"` 绑定，
  切换笔记时整个组件重建，天然避免上一页的撤销栈与内容残留。
- **自动保存**：`useAutoSave` 是模块级单例（待保存队列 + 定时器），多个组件共用；
  切换笔记 / 页面隐藏前都会 flush。失败时把内容并回队列，由状态条上的「保存失败，点击重试」兜住。
- **工具条激活态**：Tiptap v3 的 Vue `Editor` 把 `state` 做成 Vue 的 customRef，
  所以在 `computed` 里直接读 `editor.isActive(...)` 就能自动追踪重渲染，不需要额外的状态订阅。
- **斜杠菜单**：编辑器内的按键（↑↓ / Enter / Esc）由 `@tiptap/suggestion` 的 `onKeyDown` 处理，
  菜单 UI 只负责渲染与鼠标交互。图片插入用 `window.prompt`——suggestion 默认
  `dismissOnOutsideClick: true`，弹层里放输入框会被 outside-click 直接关掉。
- **保存前裁剪**：Tiptap 的 Link 扩展会补 `rel`/`class`/`title`，Image 会补 `width`/`height`，
  这些都不在 SPEC 白名单里，`editor/spec.ts` 在提交前统一裁掉，保证入库 JSON 形态稳定。

## 已知取舍

- 生产包约 800 kB（gzip 266 kB），主要是 `lowlight` 的常用语言集。本地访问无感，
  若要瘦身可换成按需注册语言。
- 图片只支持外链 URL，不做上传。

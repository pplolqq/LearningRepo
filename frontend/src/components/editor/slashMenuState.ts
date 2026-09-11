import { reactive } from 'vue'
import type { Editor, Range } from '@tiptap/core'

/** 斜杠菜单条目（slashCommand.ts 提供数据，SlashMenu.vue 渲染 UI） */
export interface SlashCommandItem {
  /** 菜单主文案（中文） */
  title: string
  /** 副文案说明 */
  hint: string
  /** 左侧图标字符 */
  icon: string
  /** 过滤用关键词（英文 / 拼音 / 别名） */
  keywords: string[]
  /** 选中后执行（图片这类需要额外输入的，run 只负责切到输入态） */
  run: (props: { editor: Editor; range: Range }) => void
}

/** 渲染回调需要的字段（对 @tiptap/suggestion 的 SuggestionProps 做结构化子集声明） */
export interface SlashMenuPropsLike {
  editor: Editor
  range: Range
  query: string
  items: SlashCommandItem[]
  clientRect?: (() => DOMRect | null) | null
}

interface SlashMenuState {
  visible: boolean
  query: string
  items: SlashCommandItem[]
  selectedIndex: number
  /** 位置锚点每次变化就自增，供 UI 触发重新定位 */
  anchorVersion: number
}

export const slashMenuState = reactive<SlashMenuState>({
  visible: false,
  query: '',
  items: [],
  selectedIndex: 0,
  anchorVersion: 0,
})

/**
 * 编辑器实例 / range / 位置取函数都放在模块级普通变量里：
 * ProseMirror 对象不需要（也不应该）被 Vue 响应式代理。
 */
let contextEditor: Editor | null = null
let contextRange: Range | null = null
let anchorGetter: (() => DOMRect | null) | null = null

/** SlashMenu.vue 用这个函数拿到最新的光标矩形（配合 floating-ui 定位） */
export function getAnchorRect(): DOMRect | null {
  return anchorGetter?.() ?? null
}

function remember(props: SlashMenuPropsLike): void {
  contextEditor = props.editor
  contextRange = props.range
  anchorGetter = props.clientRect ?? null
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (index < 0) return 0
  if (index > length - 1) return length - 1
  return index
}

export function openSlashMenu(props: SlashMenuPropsLike): void {
  remember(props)
  slashMenuState.query = props.query
  slashMenuState.items = props.items
  slashMenuState.selectedIndex = 0
  slashMenuState.anchorVersion += 1
  slashMenuState.visible = true
}

export function updateSlashMenu(props: SlashMenuPropsLike): void {
  remember(props)
  slashMenuState.query = props.query
  slashMenuState.items = props.items
  slashMenuState.selectedIndex = clampIndex(slashMenuState.selectedIndex, props.items.length)
  slashMenuState.anchorVersion += 1
  slashMenuState.visible = true
}

export function closeSlashMenu(): void {
  slashMenuState.visible = false
  slashMenuState.items = []
  slashMenuState.selectedIndex = 0
  contextEditor = null
  contextRange = null
  anchorGetter = null
}

/** 上下移动选择（↑ = -1，↓ = +1） */
export function moveSlashSelection(delta: number): void {
  const length = slashMenuState.items.length
  if (length === 0) return
  const next = slashMenuState.selectedIndex + delta
  // 循环选择，输入体验更好
  slashMenuState.selectedIndex = next < 0 ? length - 1 : next >= length ? 0 : next
}

export function setSlashSelection(index: number): void {
  slashMenuState.selectedIndex = clampIndex(index, slashMenuState.items.length)
}

/** 执行当前高亮项 */
export function runSlashSelection(index = slashMenuState.selectedIndex): void {
  const editor = contextEditor
  const range = contextRange
  const item = slashMenuState.items[index]
  if (!editor || !range || !item) return
  item.run({ editor, range })
}

/** 编辑器内按键：↑↓ 选择、Enter 确认、Esc 关闭；返回 true 表示已消费该按键 */
export function handleSlashKeyDown(event: KeyboardEvent): boolean {
  if (!slashMenuState.visible) return false

  switch (event.key) {
    case 'ArrowUp':
      moveSlashSelection(-1)
      return true
    case 'ArrowDown':
      moveSlashSelection(1)
      return true
    case 'Enter':
      runSlashSelection()
      return true
    case 'Escape':
      closeSlashMenu()
      return true
    default:
      return false
  }
}

import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Suggestion } from '@tiptap/suggestion'
import type { SuggestionOptions } from '@tiptap/suggestion'
import {
  closeSlashMenu,
  handleSlashKeyDown,
  openSlashMenu,
  updateSlashMenu,
} from './slashMenuState'
import type { SlashCommandItem } from './slashMenuState'

/**
 * 斜杠菜单命令表（SPEC §6：正文 / H1-H3 / 无序 / 有序 / 待办 / 引用 / 代码块 / 分割线 / 表格 / 图片）。
 * 所有块级转换前都先 deleteRange(range) 把用户输入的 `/xxx` 文本删掉。
 */
export const slashCommandItems: SlashCommandItem[] = [
  {
    title: '正文',
    hint: '普通段落',
    icon: '¶',
    keywords: ['paragraph', 'text', 'p', 'zhengwen'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: '标题 1',
    hint: '一级标题',
    icon: 'H1',
    keywords: ['h1', 'heading', 'biaoti', 'title'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    title: '标题 2',
    hint: '二级标题',
    icon: 'H2',
    keywords: ['h2', 'heading', 'biaoti', 'title'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    title: '标题 3',
    hint: '三级标题',
    icon: 'H3',
    keywords: ['h3', 'heading', 'biaoti', 'title'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    title: '无序列表',
    hint: '圆点列表',
    icon: '•',
    keywords: ['bullet', 'ul', 'list', 'wuxu', 'liebiao'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '有序列表',
    hint: '数字列表',
    icon: '1.',
    keywords: ['ordered', 'ol', 'number', 'youxu', 'liebiao'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '待办列表',
    hint: '带复选框',
    icon: '☑',
    keywords: ['task', 'todo', 'checkbox', 'daiban'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: '引用',
    hint: '引用块',
    icon: '❝',
    keywords: ['quote', 'blockquote', 'yinyong'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: '代码块',
    hint: '带语法高亮',
    icon: '</>',
    keywords: ['code', 'codeblock', 'daima'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: '分割线',
    hint: '水平分隔',
    icon: '—',
    keywords: ['hr', 'divider', 'fengexian'],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: '表格',
    hint: '3 列 3 行',
    icon: '▦',
    keywords: ['table', 'biaoge'],
    run: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: '图片',
    hint: '插入外链图片',
    icon: '🖼',
    keywords: ['image', 'img', 'picture', 'tupian'],
    run: ({ editor, range }) => {
      // 用浏览器原生输入框：编辑器始终保持焦点，不会因为 outside-click 让 suggestion 提前退出
      const input = window.prompt('图片地址（http(s):// 开头）', 'https://')
      const url = input?.trim() ?? ''
      // 取消或非法地址：只把已经输入的 `/图片` 文本删掉
      if (url === '' || !/^(https?:\/\/|\/)/i.test(url)) {
        editor.chain().focus().deleteRange(range).run()
        return
      }
      editor.chain().focus().deleteRange(range).setImage({ src: url }).run()
    },
  },
]

function filterSlashItems(query: string): SlashCommandItem[] {
  const keyword = query.trim().toLowerCase()
  if (keyword === '') return slashCommandItems
  return slashCommandItems.filter((item) => {
    if (item.title.toLowerCase().includes(keyword)) return true
    return item.keywords.some((word) => word.toLowerCase().includes(keyword))
  })
}

const slashCommandPluginKey = new PluginKey('slashCommand')

type SlashCommandSuggestionOptions = Omit<
  SuggestionOptions<SlashCommandItem, SlashCommandItem>,
  'editor'
>

const defaultSuggestionOptions: SlashCommandSuggestionOptions = {
  pluginKey: slashCommandPluginKey,
  char: '/',
  allowSpaces: false,
  startOfLine: false,
  // 代码块里不弹菜单
  allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== 'codeBlock',
  items: ({ query }) => filterSlashItems(query),
  command: ({ editor, range, props }) => {
    props.run({ editor, range })
  },
  render: () => ({
    onStart: (props) => {
      openSlashMenu(props)
    },
    onUpdate: (props) => {
      updateSlashMenu(props)
    },
    onKeyDown: ({ event }) => handleSlashKeyDown(event),
    onExit: () => {
      closeSlashMenu()
    },
  }),
}

interface SlashCommandOptions {
  suggestion: SlashCommandSuggestionOptions
}

/**
 * 基于 @tiptap/suggestion 的斜杠命令扩展。
 * UI 由 SlashMenu.vue 渲染（Teleport + floating-ui），这里只负责触发与键盘交互。
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: { ...defaultSuggestionOptions },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

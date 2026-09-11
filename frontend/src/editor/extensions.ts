import type { Extensions } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { BulletList, ListItem, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Image } from '@tiptap/extension-image'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { SlashCommand } from '@/components/editor/slashCommand'
import { SearchHighlight } from '@/editor/searchHighlight'

/** highlight.js 的常用语法集（lowlight v3） */
const lowlight = createLowlight(common)

/**
 * SPEC §2 白名单 → Tiptap 扩展 的集中注册处。
 *
 * | SPEC type | 来源扩展 |
 * |-----------|----------|
 * | doc, paragraph, heading, blockquote, horizontalRule, text, hardBreak | StarterKit（内置） |
 * | bulletList, orderedList, listItem, taskList, taskItem | @tiptap/extension-list |
 * | codeBlock | @tiptap/extension-code-block-lowlight（StarterKit 内置 codeBlock 已关闭） |
 * | image | @tiptap/extension-image |
 * | table, tableRow, tableHeader, tableCell | @tiptap/extension-table |
 * | bold, italic, strike, code, underline, link | StarterKit（v3 已内置 link / underline） |
 * | highlight | @tiptap/extension-highlight |
 * | subscript / superscript | @tiptap/extension-subscript / -superscript |
 * | （无） | SearchHighlight（纯插件，不注册节点 / mark，只画搜索结果高亮） |
 *
 * 注意：白名单里没有 textAlign / color / textStyle 等样式扩展，故一律不注册。
 */
export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({
      // 白名单里的 codeBlock 由 CodeBlockLowlight 提供（带 highlight.js 高亮）
      codeBlock: false,
      // 列表统一使用 @tiptap/extension-list 的导出，避免重复注册导致扩展告警
      bulletList: false,
      orderedList: false,
      listItem: false,
      // link / underline 由 StarterKit 内置提供（v3 行为，无需单独注册）；
      // SPEC §2 要求 link 的 target 为 _blank
      link: {
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: '_blank' },
      },
    }),
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Subscript,
    Superscript,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    // SPEC §2：图片只支持外链 URL，不做上传/base64
    Image.configure({ inline: false, allowBase64: false }),
    CodeBlockLowlight.configure({ lowlight }),
    SlashCommand,
    SearchHighlight,
  ]
}

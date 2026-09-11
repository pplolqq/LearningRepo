import type { TiptapJSON, TiptapMark, TiptapNode } from '@/api/types'

/**
 * SPEC §2 白名单（唯一真相）：节点 / mark 类型 → 允许出现的 attrs。
 * 这里的表既是「注册扩展」的对照依据，也用于保存前裁剪 Tiptap v3 默认多出来的属性
 * （例如 link 的 rel/class/title、image 的 width/height、orderedList 的 type），
 * 保证 PATCH/POST 出去的 content 与冻结契约逐字一致。
 */
export const SPEC_NODE_ATTRS: Readonly<Record<string, readonly string[]>> = {
  doc: [],
  paragraph: [],
  heading: ['level'],
  bulletList: [],
  orderedList: ['start'],
  listItem: [],
  taskList: [],
  taskItem: ['checked'],
  blockquote: [],
  codeBlock: ['language'],
  horizontalRule: [],
  image: ['src', 'alt', 'title'],
  table: [],
  tableRow: [],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  text: [],
  hardBreak: [],
}

export const SPEC_MARK_ATTRS: Readonly<Record<string, readonly string[]>> = {
  bold: [],
  italic: [],
  strike: [],
  code: [],
  underline: [],
  link: ['href', 'target'],
  highlight: [],
  subscript: [],
  superscript: [],
}

function pruneAttrs(
  attrs: Record<string, unknown> | undefined,
  allowed: readonly string[],
): Record<string, unknown> | undefined {
  if (!attrs) return undefined
  const pruned: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(attrs, key)) pruned[key] = attrs[key]
  }
  return Object.keys(pruned).length > 0 ? pruned : undefined
}

function sanitizeMark(mark: TiptapMark): TiptapMark {
  const allowed = SPEC_MARK_ATTRS[mark.type]
  if (!allowed) return mark
  const attrs = pruneAttrs(mark.attrs, allowed)
  return attrs ? { type: mark.type, attrs } : { type: mark.type }
}

function sanitizeNode(node: TiptapNode): TiptapNode {
  const allowed = SPEC_NODE_ATTRS[node.type ?? '']
  const result: TiptapNode = {}
  if (node.type !== undefined) result.type = node.type
  if (allowed) {
    const attrs = pruneAttrs(node.attrs, allowed)
    if (attrs) result.attrs = attrs
  } else if (node.attrs) {
    // 不在白名单里的类型理论上不会出现在本 schema 中；保留原样以免丢数据
    result.attrs = node.attrs
  }
  if (node.text !== undefined) result.text = node.text
  if (node.marks && node.marks.length > 0) result.marks = node.marks.map(sanitizeMark)
  if (node.content && node.content.length > 0) result.content = node.content.map(sanitizeNode)
  return result
}

/** 按 SPEC §2 裁剪 content：删掉白名单之外的所有 attrs（节点类型不做增删） */
export function sanitizeContentForSpec(json: TiptapJSON): TiptapJSON {
  const content = json.content?.map(sanitizeNode)
  const result: TiptapJSON = { type: 'doc' }
  if (content && content.length > 0) result.content = content
  return result
}

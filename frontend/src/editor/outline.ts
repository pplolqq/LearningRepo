import type { Node as PMNode } from '@tiptap/pm/model'

/** 目录里的一项 */
export interface OutlineItem {
  /** 标题节点在文档里的起始位置 */
  pos: number
  /** 1~6 */
  level: number
  /** 标题纯文本（空的会占位成「（空标题）」） */
  text: string
}

/**
 * 从编辑器文档里抽标题。
 *
 * 注意是直接遍历文档节点，**不是**解析 markdown 文本 —— 所以用 `## ` 快捷输入
 * 刚敲出来的标题、以及从 .md 导入后被解析成 heading 节点的内容，都立刻会出现在目录里。
 * 嵌套在引用、列表里的标题同样会被收集（保持文档顺序）。
 */
export function collectHeadings(doc: PMNode): OutlineItem[] {
  const items: OutlineItem[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        pos,
        level: Number(node.attrs.level) || 1,
        text: node.textContent.trim() || '（空标题）',
      })
    }
    return true
  })
  return items
}

/** 缩进基准：取文档里最浅的标题级别，避免整篇都是 H2 时目录整体右移 */
export function outlineBaseLevel(items: OutlineItem[]): number {
  if (items.length === 0) return 1
  return Math.min(...items.map((item) => item.level))
}

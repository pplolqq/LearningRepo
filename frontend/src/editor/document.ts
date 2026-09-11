import type { JSONContent } from '@tiptap/core'
import type { TiptapJSON } from '@/api/types'
import { sanitizeContentForSpec } from './spec'

/** 新建空文档时使用的内容（SPEC §4.2：content 缺省值） */
export function createEmptyDoc(): TiptapJSON {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/**
 * 空内容兜底：content 为 null / 缺少 doc 类型 / content 为空数组时，
 * 统一回退到 `{type:'doc',content:[{type:'paragraph'}]}`（SPEC §6 + §4.2）。
 */
export function ensureDoc(content: TiptapJSON | null | undefined): TiptapJSON {
  if (!content || typeof content !== 'object' || content.type !== 'doc') return createEmptyDoc()
  if (!Array.isArray(content.content) || content.content.length === 0) return createEmptyDoc()
  return content
}

/**
 * Tiptap 的 JSONContent 与 SPEC 的 TiptapJSON 结构一致（根节点为 doc），
 * 只是 Tiptap 把 `type` 声明成可选的 string。这里做一次受控断言，避免全项目出现 any。
 */
export function toTiptapJSON(json: JSONContent): TiptapJSON {
  return json as TiptapJSON
}

/** 编辑器内容 → 提交给后端的 content（已按 SPEC §2 白名单裁剪 attrs） */
export function toPayloadContent(json: JSONContent): TiptapJSON {
  return sanitizeContentForSpec(toTiptapJSON(json))
}

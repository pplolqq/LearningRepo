/**
 * 与 docs/SPEC.md §4.1 严格对应的接口类型定义。
 * 字段名、可选性、null 语义都必须与 SPEC 保持一致，不要擅自改动。
 */

/** Tiptap JSON 中 mark 的结构 */
export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

/**
 * Tiptap JSON 中节点的结构。
 * SPEC 中写作 `content?: any[]`，这里给出更强但结构兼容的类型，
 * 便于 tsconfig 的 strict 模式下安全访问（不引入 any）。
 */
export interface TiptapNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

/** SPEC §4.1: type TiptapJSON = { type: 'doc', content?: any[] } */
export interface TiptapJSON {
  type: 'doc'
  content?: TiptapNode[]
}

/** SPEC §3.1 / §4.1 FolderRead */
export interface FolderRead {
  id: number
  name: string
  parent_id: number | null
  order_index: number
  created_at: string
  updated_at: string
  /** 该文件夹【直接】包含的笔记数（不含子文件夹） */
  note_count: number
}

/** GET /folders 返回的树节点 */
export type FolderNode = FolderRead & { children: FolderNode[] }

/** SPEC §4.1 NoteListItem */
export interface NoteListItem {
  id: number
  title: string
  folder_id: number | null
  /** 截断前 500 字符 */
  plain_text: string
  created_at: string
  updated_at: string
}

/** SPEC §4.1 NoteRead */
export interface NoteRead {
  id: number
  title: string
  folder_id: number | null
  /** DB 中字段名为 content_json，对外字段名为 content，且是【对象】不是字符串 */
  content: TiptapJSON
  raw_md: string | null
  plain_text: string
  created_at: string
  updated_at: string
}

/** POST /notes/import 请求体中的单个文件 */
export interface ImportFile {
  name: string
  content: string
}

/** POST /notes/import 响应中的单条失败记录 */
export interface ImportError {
  name: string
  message: string
}

/** POST /notes/import 响应 */
export interface ImportResult {
  created: NoteRead[]
  errors: ImportError[]
}

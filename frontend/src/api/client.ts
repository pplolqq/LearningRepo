import axios from 'axios'
import type {
  FolderNode,
  FolderRead,
  ImportFile,
  ImportResult,
  NoteListItem,
  NoteRead,
  TiptapJSON,
} from './types'

/** 统一 axios 实例：所有请求走相对路径 /api（由 Vite dev server 代理到 127.0.0.1:8000） */
export const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

interface ApiErrorBody {
  detail?: unknown
}

/** 把任意异常转成可展示的中文错误文案 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined
    const detail = body?.detail
    if (typeof detail === 'string' && detail.trim() !== '') return detail
    if (error.response) return `请求失败（HTTP ${error.response.status}）`
    return '无法连接后端服务，请确认 127.0.0.1:8000 已启动'
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/** 是否 404（用于「上次打开的笔记已被删除」等场景） */
export function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404
}

// ---------------------------------------------------------------- health

export async function fetchHealth(): Promise<{ status: string }> {
  const { data } = await http.get<{ status: string }>('/health')
  return data
}

// ---------------------------------------------------------------- folders

export async function fetchFolders(): Promise<FolderNode[]> {
  const { data } = await http.get<FolderNode[]>('/folders')
  return data
}

export interface FolderCreatePayload {
  name: string
  parent_id?: number | null
}

export async function createFolder(payload: FolderCreatePayload): Promise<FolderRead> {
  const { data } = await http.post<FolderRead>('/folders', payload)
  return data
}

export interface FolderUpdatePayload {
  name?: string
  parent_id?: number | null
  order_index?: number
}

export async function updateFolder(id: number, payload: FolderUpdatePayload): Promise<FolderRead> {
  const { data } = await http.patch<FolderRead>(`/folders/${id}`, payload)
  return data
}

export async function deleteFolder(id: number): Promise<void> {
  await http.delete(`/folders/${id}`)
}

// ---------------------------------------------------------------- notes

export interface NoteQuery {
  /** 指定文件夹 */
  folder_id?: number
  /** true = 仅未归档（folder_id is null） */
  unfiled?: boolean
  limit?: number
  offset?: number
}

export async function fetchNotes(query: NoteQuery = {}): Promise<NoteListItem[]> {
  const params: Record<string, number | boolean> = {}
  if (typeof query.folder_id === 'number') params.folder_id = query.folder_id
  if (query.unfiled === true) params.unfiled = true
  if (typeof query.limit === 'number') params.limit = query.limit
  if (typeof query.offset === 'number') params.offset = query.offset
  const { data } = await http.get<NoteListItem[]>('/notes', { params })
  return data
}

export interface NoteCreatePayload {
  title?: string
  folder_id?: number | null
  content?: TiptapJSON
}

export async function createNote(payload: NoteCreatePayload): Promise<NoteRead> {
  const { data } = await http.post<NoteRead>('/notes', payload)
  return data
}

export async function fetchNote(id: number): Promise<NoteRead> {
  const { data } = await http.get<NoteRead>(`/notes/${id}`)
  return data
}

/** PATCH /notes/{id}：只传需要更新的字段 */
export interface NoteUpdatePayload {
  title?: string
  folder_id?: number | null
  content?: TiptapJSON
}

export async function updateNote(id: number, payload: NoteUpdatePayload): Promise<NoteRead> {
  const { data } = await http.patch<NoteRead>(`/notes/${id}`, payload)
  return data
}

export async function deleteNote(id: number): Promise<void> {
  await http.delete(`/notes/${id}`)
}

export interface ImportPayload {
  folder_id?: number | null
  files: ImportFile[]
}

export async function importNotes(payload: ImportPayload): Promise<ImportResult> {
  const { data } = await http.post<ImportResult>('/notes/import', payload)
  return data
}

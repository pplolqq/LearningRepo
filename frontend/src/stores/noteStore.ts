import { defineStore } from 'pinia'
import * as api from '@/api/client'
import type {
  FolderNode,
  FolderRead,
  ImportFile,
  ImportResult,
  NoteListItem,
  NoteRead,
} from '@/api/types'
import { createEmptyDoc, ensureDoc } from '@/editor/document'
import { collectSubtreeIds, findFolderName } from '@/utils/folderTree'

/** 保存状态（SPEC §6：已保存 / 保存中… / 保存失败，点击重试） */
export type SaveStatus = 'saved' | 'saving' | 'error'

/** 左侧列表当前查看范围 */
export type NoteScope =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: number }

/** 拖拽中的对象（HTML5 draggable） */
export interface DragPayload {
  kind: 'note' | 'folder'
  id: number
}

const LS_SIDEBAR = 'notetiptap.sidebarCollapsed'
const LS_LAST_NOTE = 'notetiptap.lastNoteId'
const LS_EXPANDED = 'notetiptap.expandedFolders'

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 同上 */
  }
}

function readBool(key: string): boolean {
  return readString(key) === 'true'
}

function readNumber(key: string): number | null {
  const raw = readString(key)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function readNumberArray(key: string): number[] {
  const raw = readString(key)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is number => typeof item === 'number')
  } catch {
    return []
  }
}

interface NoteState {
  /** 文件夹树（GET /folders） */
  folders: FolderNode[]
  /** 当前范围内的笔记列表（GET /notes） */
  notes: NoteListItem[]
  /** 当前查看范围 */
  scope: NoteScope
  /** 当前打开的笔记 */
  currentNote: NoteRead | null
  /** 有未落库的改动 */
  dirty: boolean
  saveStatus: SaveStatus
  foldersLoading: boolean
  notesLoading: boolean
  noteLoading: boolean
  errorMessage: string | null
  /** 左栏折叠（localStorage 记忆） */
  sidebarCollapsed: boolean
  /** 树展开的文件夹 id */
  expandedFolderIds: number[]
  /** 拖拽中对象 */
  dragging: DragPayload | null
}

export const useNoteStore = defineStore('note', {
  state: (): NoteState => ({
    folders: [],
    notes: [],
    scope: { kind: 'all' },
    currentNote: null,
    dirty: false,
    saveStatus: 'saved',
    foldersLoading: false,
    notesLoading: false,
    noteLoading: false,
    errorMessage: null,
    sidebarCollapsed: readBool(LS_SIDEBAR),
    expandedFolderIds: readNumberArray(LS_EXPANDED),
    dragging: null,
  }),

  getters: {
    /** 新建 / 导入的目标文件夹（「全部」「未归档」都算未归档 = null） */
    scopeFolderId(state): number | null {
      return state.scope.kind === 'folder' ? state.scope.folderId : null
    },
    scopeLabel(state): string {
      if (state.scope.kind === 'all') return '全部笔记'
      if (state.scope.kind === 'unfiled') return '未归档'
      return findFolderName(state.folders, state.scope.folderId) ?? '文件夹'
    },
    currentNoteId(state): number | null {
      return state.currentNote?.id ?? null
    },
    isEmpty(state): boolean {
      return state.notes.length === 0
    },
  },

  actions: {
    // ---------------------------------------------------------------- 初始化

    /** 首次加载：文件夹树 + 笔记列表 → 打开上次的笔记 / 第一条 */
    async init(): Promise<void> {
      await Promise.all([this.loadFolders(), this.loadNotes()])
      const lastNoteId = readNumber(LS_LAST_NOTE)
      if (lastNoteId !== null && (await this.tryOpenNote(lastNoteId))) return
      await this.openFirstNote()
    },

    async loadFolders(): Promise<void> {
      this.foldersLoading = true
      try {
        this.folders = await api.fetchFolders()
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      } finally {
        this.foldersLoading = false
      }
    },

    async loadNotes(): Promise<void> {
      this.notesLoading = true
      try {
        this.notes = await api.fetchNotes(this.buildNoteQuery())
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      } finally {
        this.notesLoading = false
      }
    },

    buildNoteQuery(): api.NoteQuery {
      if (this.scope.kind === 'folder') return { folder_id: this.scope.folderId, limit: 200 }
      if (this.scope.kind === 'unfiled') return { unfiled: true, limit: 200 }
      return { limit: 200 }
    },

    async setScope(scope: NoteScope): Promise<void> {
      this.scope = scope
      await this.loadNotes()
    },

    async selectFolder(folderId: number): Promise<void> {
      await this.setScope({ kind: 'folder', folderId })
    },

    async selectUnfiled(): Promise<void> {
      await this.setScope({ kind: 'unfiled' })
    },

    async selectAll(): Promise<void> {
      await this.setScope({ kind: 'all' })
    },

    // ---------------------------------------------------------------- 打开 / 新建

    setCurrentNote(note: NoteRead): void {
      this.currentNote = { ...note, content: ensureDoc(note.content) }
      writeString(LS_LAST_NOTE, String(note.id))
      this.dirty = false
    },

    /** 打开失败（已删除）时返回 false，其他错误会写 errorMessage */
    async tryOpenNote(id: number): Promise<boolean> {
      try {
        this.setCurrentNote(await api.fetchNote(id))
        return true
      } catch (error) {
        if (!api.isNotFoundError(error)) this.setError(api.extractErrorMessage(error))
        return false
      }
    },

    async openNote(id: number, force = false): Promise<void> {
      if (!force && this.currentNote?.id === id) return
      this.noteLoading = true
      try {
        this.setCurrentNote(await api.fetchNote(id))
      } catch (error) {
        if (api.isNotFoundError(error)) {
          // 笔记已被删除：从列表移除并顺延到第一条
          this.notes = this.notes.filter((item) => item.id !== id)
          this.currentNote = null
          removeKey(LS_LAST_NOTE)
          await this.openFirstNote()
        } else {
          this.setError(api.extractErrorMessage(error))
        }
      } finally {
        this.noteLoading = false
      }
    },

    async openFirstNote(): Promise<void> {
      const first = this.notes[0]
      if (!first) {
        this.currentNote = null
        removeKey(LS_LAST_NOTE)
        return
      }
      await this.openNote(first.id, true)
    },

    /** 在当前范围内新建笔记（「全部」范围建为未归档） */
    async createNote(): Promise<NoteRead | null> {
      try {
        const note = await api.createNote({
          folder_id: this.scopeFolderId,
          content: createEmptyDoc(),
        })
        this.setCurrentNote(note)
        await Promise.all([this.loadNotes(), this.loadFolders()])
        return note
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
        return null
      }
    },

    // ---------------------------------------------------------------- 保存

    /**
     * PATCH /notes/{id}（自动保存用）。
     * 失败时【抛出】异常，交给 useAutoSave 标记保存失败并支持重试。
     */
    async patchNote(id: number, patch: api.NoteUpdatePayload): Promise<NoteRead> {
      const updated = await api.updateNote(id, patch)
      if (this.currentNote?.id === id) {
        this.currentNote = { ...this.currentNote, ...updated, content: ensureDoc(updated.content) }
      }
      this.syncListItem(updated)
      return updated
    },

    syncListItem(note: NoteRead): void {
      const index = this.notes.findIndex((item) => item.id === note.id)
      if (index < 0) return
      this.notes[index] = {
        id: note.id,
        title: note.title,
        folder_id: note.folder_id,
        plain_text: note.plain_text,
        created_at: note.created_at,
        updated_at: note.updated_at,
      }
    },

    setSaveStatus(status: SaveStatus): void {
      this.saveStatus = status
    },

    setDirty(dirty: boolean): void {
      this.dirty = dirty
    },

    // ---------------------------------------------------------------- 删除

    async deleteNote(id: number): Promise<void> {
      try {
        await api.deleteNote(id)
        this.notes = this.notes.filter((item) => item.id !== id)
        if (this.currentNote?.id === id) {
          this.currentNote = null
          removeKey(LS_LAST_NOTE)
          await this.openFirstNote()
        }
        await this.loadFolders()
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      }
    },

    async deleteFolder(id: number): Promise<void> {
      const subtreeIds = collectSubtreeIds(this.folders, id)
      try {
        await api.deleteFolder(id)
        this.expandedFolderIds = this.expandedFolderIds.filter((item) => !subtreeIds.includes(item))
        this.persistExpanded()
        if (this.scope.kind === 'folder' && subtreeIds.includes(this.scope.folderId)) {
          this.scope = { kind: 'all' }
        }
        await Promise.all([this.loadFolders(), this.loadNotes()])
        const folderId = this.currentNote?.folder_id ?? null
        if (folderId !== null && subtreeIds.includes(folderId)) {
          this.currentNote = null
          removeKey(LS_LAST_NOTE)
          await this.openFirstNote()
        }
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      }
    },

    // ---------------------------------------------------------------- 文件夹

    async createFolder(name: string, parentId: number | null): Promise<FolderRead | null> {
      try {
        const folder = await api.createFolder({ name, parent_id: parentId })
        await this.loadFolders()
        if (parentId !== null) this.expandFolder(parentId)
        return folder
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
        return null
      }
    },

    async renameFolder(id: number, name: string): Promise<void> {
      try {
        await api.updateFolder(id, { name })
        await this.loadFolders()
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      }
    },

    /** 拖拽：文件夹改父级（前端已拦截自身/后代） */
    async moveFolder(id: number, parentId: number | null): Promise<void> {
      try {
        await api.updateFolder(id, { parent_id: parentId })
        await this.loadFolders()
        if (parentId !== null) this.expandFolder(parentId)
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      }
    },

    /** 拖拽：笔记改归属（folderId = null 表示未归档） */
    async moveNote(id: number, folderId: number | null): Promise<void> {
      try {
        const updated = await api.updateNote(id, { folder_id: folderId })
        if (this.currentNote?.id === id) {
          this.currentNote = { ...this.currentNote, folder_id: updated.folder_id }
        }
        await Promise.all([this.loadNotes(), this.loadFolders()])
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
      }
    },

    // ---------------------------------------------------------------- 导入

    /** 导入 .md：目标 = 当前选中范围的文件夹（未归档/全部则 null） */
    async importFiles(files: ImportFile[]): Promise<ImportResult | null> {
      if (files.length === 0) return null
      try {
        const result = await api.importNotes({ folder_id: this.scopeFolderId, files })
        await Promise.all([this.loadNotes(), this.loadFolders()])
        const first = result.created[0]
        if (first) this.setCurrentNote(first)
        return result
      } catch (error) {
        this.setError(api.extractErrorMessage(error))
        return null
      }
    },

    // ---------------------------------------------------------------- UI 状态

    toggleSidebar(): void {
      this.sidebarCollapsed = !this.sidebarCollapsed
      writeString(LS_SIDEBAR, String(this.sidebarCollapsed))
    },

    isFolderExpanded(id: number): boolean {
      return this.expandedFolderIds.includes(id)
    },

    expandFolder(id: number): void {
      if (this.expandedFolderIds.includes(id)) return
      this.expandedFolderIds = [...this.expandedFolderIds, id]
      this.persistExpanded()
    },

    collapseFolder(id: number): void {
      this.expandedFolderIds = this.expandedFolderIds.filter((item) => item !== id)
      this.persistExpanded()
    },

    toggleFolderExpanded(id: number): void {
      if (this.isFolderExpanded(id)) this.collapseFolder(id)
      else this.expandFolder(id)
    },

    persistExpanded(): void {
      writeString(LS_EXPANDED, JSON.stringify(this.expandedFolderIds))
    },

    setDragging(payload: DragPayload | null): void {
      this.dragging = payload
    },

    setError(message: string): void {
      this.errorMessage = message
    },

    clearError(): void {
      this.errorMessage = null
    },

    /** 供 UI 判定 scope 是否命中的小工具 */
    isScopeActive(scope: NoteScope): boolean {
      if (scope.kind !== this.scope.kind) return false
      if (scope.kind === 'folder' && this.scope.kind === 'folder') {
        return scope.folderId === this.scope.folderId
      }
      return true
    },
  },
})

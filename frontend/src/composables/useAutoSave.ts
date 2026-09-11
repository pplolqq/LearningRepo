import { useNoteStore } from '@/stores/noteStore'
import type { TiptapJSON } from '@/api/types'

/** 自动保存的载荷：标题与内容可单独或同时带（SPEC §6 要求 PATCH 同时带 title + content） */
export interface SavePatch {
  title?: string
  content?: TiptapJSON
}

/** SPEC §6：debounce 800ms */
export const AUTO_SAVE_DELAY = 800

/**
 * 模块级单例状态：多个组件（标题输入、编辑器、状态条）共用同一个
 * 待保存队列与定时器，组件卸载不会丢改动。
 */
let timer: ReturnType<typeof setTimeout> | null = null
let pending: SavePatch = {}
let pendingNoteId: number | null = null
let inFlight: Promise<void> | null = null
let exitFlushBound = false

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function hasPending(): boolean {
  return pendingNoteId !== null && (pending.title !== undefined || pending.content !== undefined)
}

/**
 * 页面卸载 / 切到后台时尽力把待保存内容发出去。
 * beforeunload 阶段无法等待异步响应，只能做 best-effort 触发。
 */
function bindExitFlush(): void {
  if (exitFlushBound || typeof window === 'undefined') return
  exitFlushBound = true
  window.addEventListener('beforeunload', () => {
    clearTimer()
    if (hasPending()) void sendNow(useNoteStore())
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPending()) {
      clearTimer()
      void sendNow(useNoteStore())
    }
  })
}

function sendNow(store: ReturnType<typeof useNoteStore>): Promise<void> {
  if (inFlight) return inFlight
  if (!hasPending() || pendingNoteId === null) return Promise.resolve()

  const noteId = pendingNoteId
  const patch = pending
  pending = {}
  pendingNoteId = null

  store.setSaveStatus('saving')
  inFlight = store
    .patchNote(noteId, patch)
    .then(() => {
      store.setDirty(false)
      // 保存期间又产生了新改动，则继续保持「保存中」
      store.setSaveStatus(hasPending() ? 'saving' : 'saved')
    })
    .catch(() => {
      const stillCurrent = store.currentNoteId === noteId
      if (!stillCurrent) {
        // 笔记已被切换或删除，这次失败不再打扰用户
        store.setSaveStatus('saved')
        return
      }
      // 保存失败：把内容并回队列，等用户点击「保存失败，点击重试」
      pending = { ...patch, ...pending }
      pendingNoteId = noteId
      store.setDirty(true)
      store.setSaveStatus('error')
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

export function useAutoSave() {
  const store = useNoteStore()
  bindExitFlush()

  /** 排入一次自动保存（800ms 去抖） */
  function schedule(patch: SavePatch): void {
    const noteId = store.currentNoteId
    if (noteId === null) return

    if (pendingNoteId !== null && pendingNoteId !== noteId) {
      // 理论上前端在切换笔记前都会 flush；这里兜底把旧笔记的改动立刻发出去
      clearTimer()
      void sendNow(store)
    }

    pendingNoteId = noteId
    pending = { ...pending, ...patch }
    store.setDirty(true)
    store.setSaveStatus('saving')
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, AUTO_SAVE_DELAY)
  }

  /** 立即保存待写入内容（切换笔记 / 关闭页面前必须调用） */
  async function flush(): Promise<void> {
    clearTimer()
    if (inFlight) await inFlight
    if (hasPending()) await sendNow(store)
  }

  /** 保存失败后点击重试 */
  async function retry(): Promise<void> {
    store.setSaveStatus('saving')
    await flush()
  }

  /** 丢弃待保存内容（例如删除了当前笔记） */
  function cancel(): void {
    clearTimer()
    pending = {}
    pendingNoteId = null
    store.setDirty(false)
    store.setSaveStatus('saved')
  }

  return { schedule, flush, retry, cancel }
}

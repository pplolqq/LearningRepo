<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import { useAutoSave } from '@/composables/useAutoSave'
import { confirmDialog } from '@/composables/useConfirm'
import { formatRelativeTime } from '@/utils/format'
import { setDragData } from '@/utils/dnd'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './context-menu'

const store = useNoteStore()
const { notes, notesLoading, currentNote, scopeLabel } = storeToRefs(store)
const { flush, cancel } = useAutoSave()

const menu = ref<{ x: number; y: number; noteId: number } | null>(null)

/** 切换笔记前强制 flush，避免丢改动 */
async function openNote(noteId: number): Promise<void> {
  if (store.currentNoteId === noteId) return
  await flush()
  await store.openNote(noteId)
}

async function createNote(): Promise<void> {
  await flush()
  await store.createNote()
}

async function removeNote(noteId: number, title: string): Promise<void> {
  const confirmed = await confirmDialog({
    title: '删除笔记',
    message: `确定删除「${title}」吗？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return
  if (store.currentNoteId === noteId) cancel()
  await store.deleteNote(noteId)
}

function openMenu(event: MouseEvent, noteId: number): void {
  menu.value = { x: event.clientX, y: event.clientY, noteId }
}

const menuItems = computed<ContextMenuItem[]>(() => {
  const target = menu.value
  if (!target) return []
  const note = notes.value.find((item) => item.id === target.noteId)
  return [
    {
      label: '删除',
      danger: true,
      action: () => void removeNote(target.noteId, note?.title ?? '未命名笔记'),
    },
  ]
})

function closeMenu(): void {
  menu.value = null
}

function onDragStart(event: DragEvent, noteId: number): void {
  setDragData(event, { kind: 'note', id: noteId })
  store.setDragging({ kind: 'note', id: noteId })
}

function onDragEnd(): void {
  store.setDragging(null)
}

function summary(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed === '' ? '（暂无内容）' : trimmed
}
</script>

<template>
  <div class="flex min-h-0 flex-col border-t border-stone-200">
    <div class="flex items-center justify-between px-3 py-2">
      <span class="truncate text-sm font-medium tracking-wide text-stone-600">
        {{ scopeLabel }}<span v-if="notesLoading"> · 加载中</span>
      </span>
      <button
        type="button"
        class="rounded px-1.5 text-base leading-none text-stone-500 hover:bg-stone-200"
        title="新建笔记"
        @click="createNote"
      >
        ＋
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <div v-if="notes.length === 0 && !notesLoading" class="px-2 py-3 text-xs leading-relaxed text-stone-400">
        此范围内还没有笔记<br />可以新建，或从顶部「导入 .md」导入
      </div>

      <button
        v-for="note in notes"
        :key="note.id"
        type="button"
        class="mb-1 block w-full rounded-lg border px-2.5 py-2 text-left transition-colors"
        :class="
          currentNote?.id === note.id
            ? 'border-blue-200 bg-blue-50'
            : 'border-transparent hover:bg-stone-200/50'
        "
        draggable="true"
        @click="openNote(note.id)"
        @contextmenu.prevent="openMenu($event, note.id)"
        @dragstart="onDragStart($event, note.id)"
        @dragend="onDragEnd"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
            {{ note.title }}
          </span>
          <span class="shrink-0 text-[10px] text-stone-400">
            {{ formatRelativeTime(note.updated_at) }}
          </span>
        </div>
        <p class="mt-0.5 line-clamp-2 text-xs leading-snug text-stone-500">
          {{ summary(note.plain_text) }}
        </p>
      </button>
    </div>

    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems" @close="closeMenu" />
  </div>
</template>

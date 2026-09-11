<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import { readDragData, readDragKind } from '@/utils/dnd'
import FolderTreeNode from './FolderTreeNode.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './context-menu'

const store = useNoteStore()
const { folders, foldersLoading } = storeToRefs(store)

const rootDropActive = ref(false)
const creatingRoot = ref(false)
const rootName = ref('')
const rootInput = ref<HTMLInputElement | null>(null)
const menu = ref<{ x: number; y: number } | null>(null)

const allActive = computed(() => store.isScopeActive({ kind: 'all' }))
const unfiledActive = computed(() => store.isScopeActive({ kind: 'unfiled' }))

async function selectAll(): Promise<void> {
  await store.selectAll()
}

async function selectUnfiled(): Promise<void> {
  await store.selectUnfiled()
}

async function startCreateRoot(): Promise<void> {
  creatingRoot.value = true
  rootName.value = ''
  await nextTick()
  rootInput.value?.focus()
}

async function commitCreateRoot(): Promise<void> {
  if (!creatingRoot.value) return
  const name = rootName.value.trim()
  creatingRoot.value = false
  if (name === '') return
  await store.createFolder(name, null)
}

function cancelCreateRoot(): void {
  creatingRoot.value = false
}

// ------------------------------------------------------------ 虚拟节点拖拽

/** 「未归档」节点：只接受笔记，落到这里 = folder_id null */
function onUnfiledDragOver(event: DragEvent): void {
  if (readDragKind(event) !== 'note') return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  rootDropActive.value = true
}

async function onUnfiledDrop(event: DragEvent): Promise<void> {
  rootDropActive.value = false
  const data = readDragData(event)
  store.setDragging(null)
  if (!data || data.kind !== 'note') return
  event.preventDefault()
  await store.moveNote(data.id, null)
}

/** 树的空白区域：文件夹拖到这里 = 移到根级 */
function onTreeDragOver(event: DragEvent): void {
  if (readDragKind(event) !== 'folder') return
  const dragging = store.dragging
  if (!dragging || dragging.kind !== 'folder') return
  event.preventDefault()
  rootDropActive.value = true
}

async function onTreeDrop(event: DragEvent): Promise<void> {
  rootDropActive.value = false
  const data = readDragData(event)
  store.setDragging(null)
  if (!data || data.kind !== 'folder') return
  event.preventDefault()
  // 已经在根级就不必请求后端
  const node = store.folders.find((item) => item.id === data.id)
  if (node && node.parent_id === null) return
  await store.moveFolder(data.id, null)
}

// ------------------------------------------------------------ 右键菜单

function openMenu(event: MouseEvent): void {
  menu.value = { x: event.clientX, y: event.clientY }
}

const menuItems = computed<ContextMenuItem[]>(() => [
  { label: '新建根级文件夹', action: () => void startCreateRoot() },
])
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex items-center justify-between px-2 pb-1 pt-2">
      <span class="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        文件夹{{ foldersLoading ? ' · 加载中' : '' }}
      </span>
      <button
        type="button"
        class="rounded px-1 text-xs text-stone-500 hover:bg-stone-200"
        title="新建根级文件夹"
        @click="startCreateRoot"
      >
        ＋
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2" @dragover="onTreeDragOver" @drop="onTreeDrop">
      <!-- 全部笔记（虚拟节点，不可删除/重命名） -->
      <div
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
        :class="allActive ? 'bg-blue-100 text-blue-800' : 'text-stone-700 hover:bg-stone-200/60'"
        @click="selectAll"
      >
        <span class="w-4 shrink-0 text-center text-xs">🗂</span>
        <span class="min-w-0 flex-1 truncate">全部笔记</span>
      </div>

      <!-- 未归档（虚拟节点，folder_id = null，可作为笔记拖拽目标） -->
      <div
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
        :class="[
          unfiledActive ? 'bg-blue-100 text-blue-800' : 'text-stone-700 hover:bg-stone-200/60',
          rootDropActive ? 'ring-2 ring-blue-400' : '',
        ]"
        @click="selectUnfiled"
        @dragover="onUnfiledDragOver"
        @drop="onUnfiledDrop"
      >
        <span class="w-4 shrink-0 text-center text-xs">📥</span>
        <span class="min-w-0 flex-1 truncate">未归档</span>
      </div>

      <FolderTreeNode v-for="node in folders" :key="node.id" :node="node" :depth="0" />

      <div v-if="creatingRoot" class="flex items-center gap-1 px-2 py-1">
        <input
          ref="rootInput"
          v-model="rootName"
          placeholder="文件夹名称"
          class="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-sm outline-none"
          @keydown.enter.prevent="commitCreateRoot"
          @keydown.esc.prevent="cancelCreateRoot"
          @blur="commitCreateRoot"
        />
      </div>

      <p v-if="!foldersLoading && folders.length === 0 && !creatingRoot" class="px-2 py-1 text-xs text-stone-400">
        还没有文件夹，点上方 ＋ 新建
      </p>

      <div class="h-6" @contextmenu.prevent="openMenu" />
    </div>

    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems" @close="menu = null" />
  </div>
</template>

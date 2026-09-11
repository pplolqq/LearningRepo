<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { FolderNode } from '@/api/types'
import { useNoteStore } from '@/stores/noteStore'
import { confirmDialog } from '@/composables/useConfirm'
import { isSelfOrDescendantOf } from '@/utils/folderTree'
import { readDragData, readDragKind, setDragData } from '@/utils/dnd'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './context-menu'

const props = defineProps<{
  node: FolderNode
  depth: number
}>()

const store = useNoteStore()

const expanded = computed(() => store.isFolderExpanded(props.node.id))
const active = computed(() => store.isScopeActive({ kind: 'folder', folderId: props.node.id }))
const hasChildren = computed(() => props.node.children.length > 0)

const dropActive = ref(false)
const renaming = ref(false)
const renameValue = ref('')
const creatingChild = ref(false)
const childName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const childInput = ref<HTMLInputElement | null>(null)
const menu = ref<{ x: number; y: number } | null>(null)

const indent = computed(() => ({ paddingLeft: `${8 + props.depth * 14}px` }))

async function selectFolder(): Promise<void> {
  await store.selectFolder(props.node.id)
  if (hasChildren.value) store.expandFolder(props.node.id)
}

function toggleExpanded(event: MouseEvent): void {
  event.stopPropagation()
  store.toggleFolderExpanded(props.node.id)
}

// ------------------------------------------------------------ 重命名 / 新建

async function startRename(): Promise<void> {
  renaming.value = true
  renameValue.value = props.node.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function commitRename(): Promise<void> {
  if (!renaming.value) return
  const name = renameValue.value.trim()
  renaming.value = false
  if (name === '' || name === props.node.name) return
  await store.renameFolder(props.node.id, name)
}

function cancelRename(): void {
  renaming.value = false
}

async function startCreateChild(): Promise<void> {
  store.expandFolder(props.node.id)
  creatingChild.value = true
  childName.value = ''
  await nextTick()
  childInput.value?.focus()
}

async function commitCreateChild(): Promise<void> {
  if (!creatingChild.value) return
  const name = childName.value.trim()
  creatingChild.value = false
  if (name === '') return
  await store.createFolder(name, props.node.id)
}

function cancelCreateChild(): void {
  creatingChild.value = false
}

async function removeFolder(): Promise<void> {
  const confirmed = await confirmDialog({
    title: '删除文件夹',
    message: `确定删除「${props.node.name}」吗？\n该文件夹下的所有子文件夹与笔记都会被一起删除，且无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return
  await store.deleteFolder(props.node.id)
}

// ------------------------------------------------------------ 拖拽

function onDragStart(event: DragEvent): void {
  setDragData(event, { kind: 'folder', id: props.node.id })
  store.setDragging({ kind: 'folder', id: props.node.id })
}

function onDragEnd(): void {
  store.setDragging(null)
  dropActive.value = false
}

function canDropHere(event: DragEvent): boolean {
  const kind = readDragKind(event)
  if (kind === null) return false
  if (kind === 'note') return true
  const dragging = store.dragging
  if (!dragging || dragging.kind !== 'folder') return false
  // 不能把文件夹拖到自身或自己的后代
  return !isSelfOrDescendantOf(store.folders, dragging.id, props.node.id)
}

function onDragOver(event: DragEvent): void {
  if (!canDropHere(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropActive.value = true
}

function onDragLeave(): void {
  dropActive.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  dropActive.value = false
  if (!canDropHere(event)) return
  event.preventDefault()
  const data = readDragData(event)
  store.setDragging(null)
  if (!data) return
  if (data.kind === 'note') {
    await store.moveNote(data.id, props.node.id)
    return
  }
  if (data.id === props.node.id) return
  if (isSelfOrDescendantOf(store.folders, data.id, props.node.id)) return
  await store.moveFolder(data.id, props.node.id)
}

// ------------------------------------------------------------ 右键菜单

function openMenu(event: MouseEvent): void {
  menu.value = { x: event.clientX, y: event.clientY }
}

const menuItems = computed<ContextMenuItem[]>(() => [
  { label: '新建子文件夹', action: () => void startCreateChild() },
  { label: '重命名', action: () => void startRename() },
  { label: '删除', danger: true, action: () => void removeFolder() },
])
</script>

<template>
  <div>
    <div
      class="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm transition-colors"
      :class="[
        active ? 'bg-blue-100 text-blue-800' : 'text-stone-700 hover:bg-stone-200/60',
        dropActive ? 'ring-2 ring-blue-400' : '',
      ]"
      :style="indent"
      draggable="true"
      @click="selectFolder"
      @contextmenu.prevent="openMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <button
        type="button"
        class="flex size-4 shrink-0 items-center justify-center rounded text-[10px] text-stone-400 hover:bg-stone-300/60"
        :class="hasChildren ? '' : 'invisible'"
        @click="toggleExpanded"
      >
        {{ expanded ? '▾' : '▸' }}
      </button>
      <span class="shrink-0 text-xs">{{ expanded && hasChildren ? '📂' : '📁' }}</span>

      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-sm outline-none"
        @click.stop
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
      <span v-else class="min-w-0 flex-1 truncate">{{ node.name }}</span>

      <span v-if="node.note_count > 0" class="shrink-0 text-[10px] text-stone-400">
        {{ node.note_count }}
      </span>

      <span class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <button
          type="button"
          class="rounded px-1 text-xs text-stone-500 hover:bg-stone-300/60"
          title="新建子文件夹"
          @click.stop="startCreateChild"
        >
          ＋
        </button>
        <button
          type="button"
          class="rounded px-1 text-xs text-stone-500 hover:bg-stone-300/60"
          title="重命名"
          @click.stop="startRename"
        >
          ✎
        </button>
        <button
          type="button"
          class="rounded px-1 text-xs text-stone-500 hover:bg-red-100 hover:text-red-600"
          title="删除"
          @click.stop="removeFolder"
        >
          🗑
        </button>
      </span>
    </div>

    <div v-if="creatingChild" class="flex items-center gap-1 py-1" :style="{ paddingLeft: `${22 + depth * 14}px` }">
      <input
        ref="childInput"
        v-model="childName"
        placeholder="子文件夹名称"
        class="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1 py-0.5 text-sm outline-none"
        @keydown.enter.prevent="commitCreateChild"
        @keydown.esc.prevent="cancelCreateChild"
        @blur="commitCreateChild"
      />
    </div>

    <template v-if="expanded">
      <FolderTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
      />
    </template>

    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @close="menu = null"
    />
  </div>
</template>

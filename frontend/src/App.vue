<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import AppSidebar from '@/components/AppSidebar.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TiptapEditor from '@/components/editor/TiptapEditor.vue'

const store = useNoteStore()
const { currentNote, sidebarCollapsed, errorMessage, notesLoading } = storeToRefs(store)

/** Ctrl+/ 折叠 / 展开左栏（笔记侧边栏）。放在 App 层，这样没有打开笔记时也能用 */
function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  if (event.key !== '/') return
  event.preventDefault()
  event.stopPropagation()
  store.toggleSidebar()
}

onMounted(() => {
  void store.init()
  window.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="flex h-full min-h-0 bg-white text-stone-900">
    <AppSidebar v-if="!sidebarCollapsed" />

    <!-- 左栏折叠后留一条窄边，点一下展开 -->
    <button
      v-else
      type="button"
      class="flex w-8 shrink-0 items-start justify-center border-r border-stone-200 bg-stone-100 pt-3 text-xs text-stone-500 hover:bg-stone-200"
      title="展开左栏（Ctrl+/）"
      @click="store.toggleSidebar()"
    >
      ▶
    </button>

    <main class="flex min-w-0 flex-1 flex-col">
      <div
        v-if="errorMessage"
        class="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700"
      >
        <span class="flex-1 truncate">⚠ {{ errorMessage }}</span>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 hover:bg-red-100"
          @click="store.clearError()"
        >
          关闭
        </button>
      </div>

      <!-- key 绑定笔记 id：切换笔记时整个编辑器重建，避免残留上一页的撤销栈与内容 -->
      <TiptapEditor v-if="currentNote" :key="currentNote.id" />

      <div
        v-else
        class="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-stone-400"
      >
        <template v-if="notesLoading">
          <span class="inline-block size-4 animate-spin rounded-full border-2 border-stone-300 border-t-transparent" />
          <span>加载中…</span>
        </template>
        <template v-else>
          <span class="text-3xl">📝</span>
          <p>还没有笔记</p>
          <p class="text-xs">用左栏的「新建」创建一篇，或导入一份 .md 文件</p>
        </template>
      </div>
    </main>

    <!-- 全局唯一的二次确认弹窗（FolderTree / NoteList 通过 confirmDialog() 触发） -->
    <ConfirmDialog />
  </div>
</template>

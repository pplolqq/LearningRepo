<script setup lang="ts">
import { useNoteStore } from '@/stores/noteStore'
import { useAutoSave } from '@/composables/useAutoSave'
import FolderTree from './FolderTree.vue'
import NoteList from './NoteList.vue'
import ImportButton from './ImportButton.vue'

const store = useNoteStore()
const { flush } = useAutoSave()

async function createNote(): Promise<void> {
  await flush()
  await store.createNote()
}
</script>

<template>
  <aside class="flex h-full w-[280px] shrink-0 flex-col border-r border-stone-200 bg-stone-100">
    <div class="flex items-center justify-between px-3 py-2">
      <h1 class="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <span>📝</span><span>笔记</span>
      </h1>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
          title="新建笔记"
          @click="createNote"
        >
          新建
        </button>
        <button
          type="button"
          class="rounded-md px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200"
          title="折叠左栏（Ctrl+/）"
          @click="store.toggleSidebar()"
        >
          ◀
        </button>
      </div>
    </div>

    <div class="px-3 pb-1">
      <ImportButton />
    </div>

    <!-- 文件夹树占上半部分，当前范围的笔记列表占下半部分（SPEC §6 布局） -->
    <FolderTree class="max-h-[45%] shrink-0" />
    <NoteList class="min-h-0 flex-1" />
  </aside>
</template>

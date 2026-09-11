<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import { useAutoSave } from '@/composables/useAutoSave'

const store = useNoteStore()
const { saveStatus, dirty, currentNote, noteLoading } = storeToRefs(store)
const { retry } = useAutoSave()

const label = computed(() => {
  if (saveStatus.value === 'saving') return '保存中…'
  if (saveStatus.value === 'error') return '保存失败，点击重试'
  return dirty.value ? '未保存' : '已保存'
})

const tone = computed(() => {
  if (saveStatus.value === 'error') return 'text-red-600'
  if (saveStatus.value === 'saving') return 'text-amber-600'
  return 'text-stone-400'
})

async function onClick(): Promise<void> {
  if (saveStatus.value !== 'error') return
  await retry()
}
</script>

<template>
  <div v-if="currentNote || noteLoading" class="flex items-center">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
      :class="[
        tone,
        saveStatus === 'error' ? 'cursor-pointer hover:bg-red-50' : 'cursor-default',
      ]"
      :title="saveStatus === 'error' ? '点击重新保存' : label"
      @click="onClick"
    >
      <span
        v-if="saveStatus === 'saving'"
        class="inline-block size-3 animate-spin rounded-full border-[1.5px] border-amber-500 border-t-transparent"
      />
      <span v-else-if="saveStatus === 'error'" class="text-sm leading-none">⚠</span>
      <span v-else class="text-sm leading-none">✓</span>
      <span>{{ label }}</span>
    </button>
  </div>
</template>

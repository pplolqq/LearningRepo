<script setup lang="ts">
import { ref } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import type { ImportFile } from '@/api/types'

const store = useNoteStore()

const inputRef = ref<HTMLInputElement | null>(null)
const busy = ref(false)

/** FileReader.readAsText：读单个 .md 文件 */
function readAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(new Error(`读取失败：${file.name}`))
    }
    reader.readAsText(file)
  })
}

function pickFiles(): void {
  inputRef.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // 清空 value，允许连续两次选择同一批文件
  input.value = ''
  await handleFiles(files)
}

async function handleFiles(files: File[]): Promise<void> {
  if (files.length === 0) return
  const markdownFiles = files.filter((file) => /\.(md|markdown)$/i.test(file.name))
  if (markdownFiles.length === 0) {
    store.setError('请选择 .md / .markdown 文件')
    return
  }

  busy.value = true
  try {
    const payload: ImportFile[] = await Promise.all(
      markdownFiles.map(async (file) => ({ name: file.name, content: await readAsText(file) })),
    )
    const result = await store.importFiles(payload)
    if (!result) return
    if (result.errors.length > 0) {
      const detail = result.errors.map((item) => `${item.name}（${item.message}）`).join('；')
      store.setError(`部分文件导入失败：${detail}`)
    } else {
      store.clearError()
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="busy"
      :title="`导入目标：${store.scopeLabel}`"
      @click="pickFiles"
    >
      <span class="text-sm leading-none">⬆</span>
      <span>{{ busy ? '导入中…' : '导入 .md' }}</span>
    </button>
    <input
      ref="inputRef"
      type="file"
      accept=".md,.markdown,text/markdown"
      multiple
      class="hidden"
      @change="onFileChange"
    />
  </div>
</template>

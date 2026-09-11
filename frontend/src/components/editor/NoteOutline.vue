<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { collectHeadings, outlineBaseLevel } from '@/editor/outline'

const props = defineProps<{
  editor: Editor | undefined
  /** 正文滚动容器，用于计算「当前位于哪个标题」 */
  scrollContainer: HTMLElement | null
  /** 收起态：只留一条窄轨，点图标展开 */
  collapsed: boolean
}>()

const emit = defineEmits<{
  jump: [pos: number]
  toggle: []
}>()

/**
 * 直接从编辑器文档里抽标题 —— 不解析 markdown 文本，
 * 所以按 `## ` 快捷输入新写的标题也会立刻出现在目录里。
 */
const items = computed(() => {
  const editor = props.editor
  return editor ? collectHeadings(editor.state.doc) : []
})

const baseLevel = computed(() => outlineBaseLevel(items.value))

/* ------------------------------------------------------------ 当前所在标题 */

const activePos = ref<number | null>(null)
let rafId: number | null = null

function updateActive(): void {
  const editor = props.editor
  const container = props.scrollContainer
  if (!editor || !container) return

  const containerTop = container.getBoundingClientRect().top
  // 取「已经滚过容器顶部」的最后一个标题
  let current: number | null = null
  for (const item of items.value) {
    const dom = editor.view.nodeDOM(item.pos)
    if (!(dom instanceof HTMLElement)) continue
    if (dom.getBoundingClientRect().top - containerTop <= 16) current = item.pos
    else break
  }
  activePos.value = current ?? items.value[0]?.pos ?? null
}

function onScroll(): void {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    updateActive()
  })
}

let bound: HTMLElement | null = null

function bindContainer(container: HTMLElement | null): void {
  if (bound === container) return
  bound?.removeEventListener('scroll', onScroll)
  bound = container
  bound?.addEventListener('scroll', onScroll, { passive: true })
  updateActive()
}

watch(() => props.scrollContainer, bindContainer, { immediate: true })

// 文档变化（新增/删除/改写标题）后位置会变，重新定位
watch(items, () => updateActive())

onBeforeUnmount(() => {
  bound?.removeEventListener('scroll', onScroll)
  bound = null
  if (rafId !== null) cancelAnimationFrame(rafId)
})
</script>

<template>
  <!-- 目录是常驻侧栏：收起时退化成一条窄轨，展开图标始终在最上方 -->
  <nav
    class="flex shrink-0 flex-col overflow-hidden border-r border-stone-200 bg-stone-50/60"
    :class="collapsed ? 'w-9' : 'w-52'"
  >
    <div
      class="flex h-12 shrink-0 items-center"
      :class="collapsed ? 'justify-center' : 'justify-between pr-2 pl-3'"
    >
      <span v-if="!collapsed" class="text-sm font-medium tracking-wide text-stone-500">
        目录
      </span>
      <button
        type="button"
        class="rounded px-1.5 py-1 text-base leading-none text-stone-400 hover:bg-stone-200 hover:text-stone-600"
        :title="collapsed ? '展开目录（Ctrl+,）' : '收起目录（Ctrl+,）'"
        @click="emit('toggle')"
      >
        {{ collapsed ? '≡' : '«' }}
      </button>
    </div>

    <div v-if="!collapsed" class="min-h-0 flex-1 overflow-y-auto pb-8">
      <p v-if="items.length === 0" class="px-3 py-1 text-[11px] leading-relaxed text-stone-400">
        本文档还没有标题。<br />用 <code class="rounded bg-stone-200 px-1"># </code> 开头写一行就会出现在这里。
      </p>

      <button
        v-for="item in items"
        :key="item.pos"
        type="button"
        class="block w-full truncate py-[3px] pr-2 text-left text-[13px] leading-5 transition-colors"
        :class="
          item.pos === activePos
            ? 'bg-indigo-50 font-medium text-indigo-600'
            : 'text-stone-600 hover:bg-stone-100'
        "
        :style="{ paddingLeft: `${10 + (item.level - baseLevel) * 12}px` }"
        :title="item.text"
        @click="emit('jump', item.pos)"
      >
        {{ item.text }}
      </button>
    </div>
  </nav>
</template>

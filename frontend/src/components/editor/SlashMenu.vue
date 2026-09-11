<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import {
  getAnchorRect,
  runSlashSelection,
  setSlashSelection,
  slashMenuState,
} from './slashMenuState'

const menuRef = ref<HTMLElement | null>(null)

/** 用光标矩形作为虚拟锚点定位（fixed 定位，不受编辑器滚动容器影响） */
async function reposition(): Promise<void> {
  const el = menuRef.value
  if (!el) return
  const rect = getAnchorRect()
  if (!rect) return
  const anchor = { getBoundingClientRect: (): DOMRect => rect }
  const { x, y } = await computePosition(anchor, el, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  el.style.left = `${x}px`
  el.style.top = `${y}px`
}

function scheduleReposition(): void {
  void nextTick(() => {
    void reposition()
  })
}

// 位置锚点在每次打开 / 每次输入变化时都会被 slashMenuState 自增
watch(
  () => [slashMenuState.visible, slashMenuState.anchorVersion] as const,
  ([visible]) => {
    if (visible) scheduleReposition()
  },
)

// 编辑器滚动时 clientRect 不会自动更新，这里补一个捕获阶段的滚动监听
function onScroll(): void {
  if (slashMenuState.visible) void reposition()
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  if (slashMenuState.visible) scheduleReposition()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})

function choose(index: number): void {
  runSlashSelection(index)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="slashMenuState.visible"
      ref="menuRef"
      class="fixed top-0 left-0 z-50 w-64 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl"
    >
      <div class="max-h-72 overflow-y-auto py-1">
        <p v-if="slashMenuState.items.length === 0" class="px-3 py-2 text-xs text-stone-400">
          没有匹配的块类型
        </p>
        <button
          v-for="(item, index) in slashMenuState.items"
          :key="item.title"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
          :class="index === slashMenuState.selectedIndex ? 'bg-stone-100' : ''"
          @mouseenter="setSlashSelection(index)"
          @mousedown.prevent="choose(index)"
        >
          <span class="w-5 shrink-0 text-center text-base leading-none">{{ item.icon }}</span>
          <span class="min-w-0 flex-1 truncate text-stone-800">{{ item.title }}</span>
          <span class="shrink-0 text-[11px] text-stone-400">{{ item.hint }}</span>
        </button>
      </div>
      <div class="border-t border-stone-100 bg-stone-50 px-3 py-1 text-[11px] text-stone-400">
        ↑↓ 选择 · Enter 确认 · Esc 关闭
      </div>
    </div>
  </Teleport>
</template>

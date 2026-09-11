<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ContextMenuItem } from './context-menu'

const props = defineProps<{
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{ close: [] }>()

const menuRef = ref<HTMLDivElement | null>(null)
const position = ref({ left: props.x, top: props.y })

/** 贴着视口边缘时自动回弹，避免菜单被裁掉 */
function clampToViewport(): void {
  const menu = menuRef.value
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  const margin = 8
  const maxLeft = window.innerWidth - rect.width - margin
  const maxTop = window.innerHeight - rect.height - margin
  position.value = {
    left: Math.max(margin, Math.min(props.x, Math.max(margin, maxLeft))),
    top: Math.max(margin, Math.min(props.y, Math.max(margin, maxTop))),
  }
}

function onPointerDown(event: MouseEvent): void {
  if (menuRef.value && event.target instanceof Node && menuRef.value.contains(event.target)) return
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function onScroll(): void {
  emit('close')
}

function select(item: ContextMenuItem): void {
  emit('close')
  item.action()
}

onMounted(() => {
  clampToViewport()
  document.addEventListener('mousedown', onPointerDown, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', clampToViewport)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', clampToViewport)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="fixed z-50 min-w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    >
      <button
        v-for="item in items"
        :key="item.label"
        type="button"
        class="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100"
        :class="item.danger ? 'text-red-600' : 'text-stone-700'"
        @click="select(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

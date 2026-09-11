<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { closeConfirm, confirmState } from '@/composables/useConfirm'

const confirmButton = ref<HTMLButtonElement | null>(null)

const visible = computed(() => confirmState.visible)

watch(visible, async (isVisible) => {
  if (!isVisible) return
  await nextTick()
  confirmButton.value?.focus()
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeConfirm(false)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      @keydown="onKeydown"
    >
      <div class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 class="text-base font-semibold text-stone-900">{{ confirmState.title }}</h2>
        <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">
          {{ confirmState.message }}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
            @click="closeConfirm(false)"
          >
            {{ confirmState.cancelText }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            :class="confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
            @click="closeConfirm(true)"
          >
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

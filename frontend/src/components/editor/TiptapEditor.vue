<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import { useAutoSave } from '@/composables/useAutoSave'
import { confirmDialog } from '@/composables/useConfirm'
import { ensureDoc, toPayloadContent } from '@/editor/document'
import { buildExtensions } from '@/editor/extensions'
import { findFolderName } from '@/utils/folderTree'
import SaveStatus from '@/components/SaveStatus.vue'
import EditorToolbar from './EditorToolbar.vue'
import NoteOutline from './NoteOutline.vue'
import SlashMenu from './SlashMenu.vue'

const LS_OUTLINE = 'notetiptap.outlineCollapsed'

const store = useNoteStore()
const { currentNote, folders } = storeToRefs(store)
const { schedule, cancel, flush } = useAutoSave()

// 本组件由 App.vue 用 :key="note.id" 绑定，切换笔记时整体重建，
// 因此初始 content 一定是当前笔记的内容，不需要再做内容同步 watch。
const editor = useEditor({
  content: ensureDoc(currentNote.value?.content),
  extensions: buildExtensions(),
  editorProps: {
    attributes: {
      class: 'note-prose',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: instance }) => {
    schedule({ content: toPayloadContent(instance.getJSON()) })
  },
})

/* ------------------------------------------------------------------ 标题 */

const titleInput = ref<HTMLInputElement | null>(null)
const titleDraft = ref(currentNote.value?.title ?? '')

// 保存成功后 store 会用服务端返回值覆盖 currentNote（例如空标题会被后端改成「未命名笔记」），
// 此时若用户没在改标题就把草稿同步过来，避免输入框被抢。
watch(
  () => currentNote.value?.title,
  (title) => {
    if (typeof title === 'string' && titleInput.value !== document.activeElement) {
      titleDraft.value = title
    }
  },
)

function onTitleInput(): void {
  schedule({ title: titleDraft.value })
}

function onTitleBlur(): void {
  if (titleDraft.value.trim() === '') {
    titleDraft.value = '未命名笔记'
    schedule({ title: titleDraft.value })
  }
}

/* ------------------------------------------------------------------ 目录 */

const scrollEl = ref<HTMLElement | null>(null)
const outlineCollapsed = ref(readOutlineCollapsed())

function readOutlineCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_OUTLINE) === 'true'
  } catch {
    return false
  }
}

function toggleOutline(): void {
  outlineCollapsed.value = !outlineCollapsed.value
  try {
    localStorage.setItem(LS_OUTLINE, String(outlineCollapsed.value))
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

let flashTimer: ReturnType<typeof setTimeout> | null = null

/** 跳到某个标题：移动光标 + 精确滚动到容器顶部 + 闪一下 */
function jumpTo(pos: number): void {
  const instance = editor.value
  if (!instance) return

  instance.chain().focus().setTextSelection(pos + 1).run()

  const dom = instance.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) {
    // 拿不到 DOM 时的兜底：滚到当前选区
    instance.commands.scrollIntoView()
    return
  }
  dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
  dom.classList.add('outline-flash')
  if (flashTimer !== null) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    dom.classList.remove('outline-flash')
    flashTimer = null
  }, 900)
}

/* -------------------------------------------------------------- Ctrl+S */

const savedFlash = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

/** 立即落库（Ctrl+S）。自动保存本身还在，这里只是不等去抖 */
async function saveNow(): Promise<void> {
  await flush()
  // 失败时状态条上会显示「保存失败，点击重试」，这里就不再报「已保存」了
  if (store.saveStatus === 'error') return
  savedFlash.value = true
  if (savedTimer !== null) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => {
    savedFlash.value = false
    savedTimer = null
  }, 1200)
}

function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  if (event.key.toLowerCase() !== 's') return
  // 抢在浏览器前面：否则会弹出「保存 HTML 到本地」
  event.preventDefault()
  event.stopPropagation()
  void saveNow()
}

// 用捕获阶段挂在 window 上：无论焦点在正文、标题输入框还是工具条都能拦到
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (savedTimer !== null) clearTimeout(savedTimer)
  if (flashTimer !== null) clearTimeout(flashTimer)
})

/* ------------------------------------------------------------------ 其他 */

const folderLabel = computed(
  () => findFolderName(folders.value, currentNote.value?.folder_id ?? null) ?? '未归档',
)

const charCount = computed(() => editor.value?.state.doc.textContent.length ?? 0)

async function removeNote(): Promise<void> {
  const note = currentNote.value
  if (!note) return
  const confirmed = await confirmDialog({
    title: '删除笔记',
    message: `确定删除「${note.title}」吗？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return
  cancel()
  await store.deleteNote(note.id)
}
</script>

<template>
  <section class="relative flex min-h-0 flex-1 flex-col">
    <header
      class="flex h-10 shrink-0 items-center gap-3 border-b border-stone-200 px-6 text-xs text-stone-500"
    >
      <button
        v-if="outlineCollapsed"
        type="button"
        class="rounded px-1.5 py-0.5 text-sm leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        title="展开目录"
        @click="toggleOutline"
      >
        ≡
      </button>
      <span class="truncate" :title="folderLabel">📁 {{ folderLabel }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <SaveStatus />
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600"
          title="删除这篇笔记"
          @click="removeNote"
        >
          删除
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <NoteOutline
        v-if="!outlineCollapsed"
        :editor="editor"
        :scroll-container="scrollEl"
        @jump="jumpTo"
        @collapse="toggleOutline"
      />

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="shrink-0 px-6 pt-5">
          <input
            ref="titleInput"
            v-model="titleDraft"
            type="text"
            placeholder="未命名笔记"
            class="w-full border-none bg-transparent text-2xl font-semibold text-stone-900 outline-none placeholder:text-stone-300"
            @input="onTitleInput"
            @blur="onTitleBlur"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
        </div>

        <EditorToolbar :editor="editor" />

        <!-- 正文滚动区（目录的「当前标题」按这个容器计算） -->
        <div ref="scrollEl" class="min-h-0 flex-1 overflow-y-auto px-6 pt-3 pb-32">
          <EditorContent :editor="editor" />
        </div>

        <footer
          class="flex h-7 shrink-0 items-center justify-end border-t border-stone-100 px-6 text-[11px] text-stone-400"
        >
          {{ charCount }} 字
        </footer>
      </div>
    </div>

    <!-- Ctrl+S 的反馈 -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="translate-y-1 opacity-0"
      leave-active-class="transition duration-300 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="savedFlash"
        class="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-stone-800/90 px-3 py-1 text-xs text-white shadow-lg"
      >
        ✓ 已保存
      </div>
    </Transition>

    <SlashMenu />
  </section>
</template>

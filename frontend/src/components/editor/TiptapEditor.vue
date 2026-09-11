<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { storeToRefs } from 'pinia'
import { useNoteStore } from '@/stores/noteStore'
import { useAutoSave } from '@/composables/useAutoSave'
import { confirmDialog } from '@/composables/useConfirm'
import { ensureDoc, toPayloadContent } from '@/editor/document'
import { buildExtensions } from '@/editor/extensions'
import {
  EMPTY_SEARCH_STATE,
  applySearchState,
  findMatches,
  type SearchMatch,
} from '@/editor/searchHighlight'
import { findFolderName } from '@/utils/folderTree'
import SaveStatus from '@/components/SaveStatus.vue'
import EditorToolbar from './EditorToolbar.vue'
import NoteOutline from './NoteOutline.vue'
import SlashMenu from './SlashMenu.vue'

const LS_OUTLINE = 'notetiptap.outlineCollapsed'
const LS_TOOLBAR_PINNED = 'notetiptap.toolbarPinned'

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
    // 文档改过之后命中的位置会变，有搜索词时重算一次
    if (searchQuery.value.trim() !== '') refreshSearch(false)
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

/**
 * 全局快捷键（捕获阶段挂在 window 上，焦点在正文/标题/工具条都能拦到）：
 * - Ctrl+S   立即落库
 * - Ctrl+,   折叠 / 展开目录（左栏的 Ctrl+/ 在 App.vue，无笔记时也要能用）
 */
function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return

  if (event.key === ',') {
    event.preventDefault()
    event.stopPropagation()
    toggleOutline()
    return
  }

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

/* ------------------------------------------------------- 工具条固定 / 收起 */

const toolbarPinned = ref(readToolbarPinned())
const toolbarHovered = ref(false)

/** 非固定态且鼠标不在标题下方时，工具条收起来（腾出版面） */
const toolbarVisible = computed(() => toolbarPinned.value || toolbarHovered.value)

function readToolbarPinned(): boolean {
  try {
    return localStorage.getItem(LS_TOOLBAR_PINNED) !== 'false'
  } catch {
    return true
  }
}

function toggleToolbarPin(): void {
  toolbarPinned.value = !toolbarPinned.value
  try {
    localStorage.setItem(LS_TOOLBAR_PINNED, String(toolbarPinned.value))
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

/* -------------------------------------------------------------- 文内搜索 */

const searchQuery = ref('')
const searchMatches = ref<SearchMatch[]>([])
const searchIndex = ref(-1)

/** 重算命中并交给高亮插件；resetIndex = 从第一处重新开始 */
function refreshSearch(resetIndex = true): void {
  const instance = editor.value
  if (!instance) return

  const matches = findMatches(instance.state.doc, searchQuery.value)
  const index =
    matches.length === 0
      ? -1
      : resetIndex
        ? 0
        : Math.min(Math.max(searchIndex.value, 0), matches.length - 1)

  searchMatches.value = matches
  searchIndex.value = index
  applySearchState(instance, { matches, current: index })
  if (index >= 0) scrollToMatch(index)
}

/** step = +1 下一处，-1 上一处（到头循环） */
function gotoMatch(step: number): void {
  const total = searchMatches.value.length
  if (total === 0) return

  const index = ((searchIndex.value < 0 ? 0 : searchIndex.value) + step + total) % total
  searchIndex.value = index
  const instance = editor.value
  if (instance) applySearchState(instance, { matches: searchMatches.value, current: index })
  scrollToMatch(index)
}

function scrollToMatch(index: number): void {
  const instance = editor.value
  const container = scrollEl.value
  const match = searchMatches.value[index]
  if (!instance || !container || !match) return

  // 命中区间的 DOM 可能是文本节点，往上取一层元素再滚
  const dom = instance.view.domAtPos(match.from)
  const element = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
  if (!element) return

  // 只滚正文容器：scrollIntoView 会连外层文档一起滚，命中点反而会被顶到边上
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const offset = elementRect.top - containerRect.top
  const top = container.scrollTop + offset - (container.clientHeight - elementRect.height) / 2
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function clearSearch(): void {
  searchQuery.value = ''
  searchMatches.value = []
  searchIndex.value = -1
  const instance = editor.value
  if (instance) applySearchState(instance, EMPTY_SEARCH_STATE)
}

/* ------------------------------------------------------------ 快速滚动 */

function scrollToTop(): void {
  scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom(): void {
  const container = scrollEl.value
  if (!container) return
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
}

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
      class="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 px-6 text-sm text-stone-500"
    >
      <span class="truncate" :title="folderLabel">📁 {{ folderLabel }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <SaveStatus />
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-red-50 hover:text-red-600"
          title="删除这篇笔记"
          @click="removeNote"
        >
          删除
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- 目录常驻：收起时是窄轨，展开时是完整目录（SPEC §6 的「可收起」） -->
      <NoteOutline
        :editor="editor"
        :scroll-container="scrollEl"
        :collapsed="outlineCollapsed"
        @jump="jumpTo"
        @toggle="toggleOutline"
      />

      <div class="flex min-w-0 flex-1 flex-col">
        <!-- 标题行：标题 + 文内搜索条 + 回顶 / 到底 -->
        <div class="flex shrink-0 items-start gap-3 px-6 pt-6">
          <input
            ref="titleInput"
            v-model="titleDraft"
            type="text"
            placeholder="未命名笔记"
            class="min-w-0 flex-1 border-none bg-transparent text-3xl font-semibold text-stone-900 outline-none placeholder:text-stone-300"
            @input="onTitleInput"
            @blur="onTitleBlur"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />

          <div class="flex shrink-0 items-center gap-1 pt-1.5">
            <div
              class="flex items-center gap-1.5 rounded-md border border-stone-200 bg-stone-50 px-2 py-1"
            >
              <span class="text-xs leading-none text-stone-400">🔍</span>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索本文"
                class="w-28 border-none bg-transparent text-xs text-stone-700 outline-none placeholder:text-stone-400"
                @input="refreshSearch()"
                @keydown.enter.prevent="gotoMatch($event.shiftKey ? -1 : 1)"
                @keydown.esc.prevent="clearSearch()"
              />
              <span
                v-if="searchQuery.trim() !== ''"
                class="shrink-0 text-[11px] tabular-nums"
                :class="searchMatches.length === 0 ? 'text-red-500' : 'text-stone-400'"
              >
                {{
                  searchMatches.length === 0 ? '无' : `${searchIndex + 1}/${searchMatches.length}`
                }}
              </span>
              <button
                v-if="searchQuery !== ''"
                type="button"
                class="shrink-0 rounded px-0.5 text-xs leading-none text-stone-400 hover:bg-stone-200 hover:text-stone-600"
                title="清空（Esc）"
                @click="clearSearch()"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              class="rounded-md px-1.5 py-1 text-base leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              title="回到最上面"
              @click="scrollToTop()"
            >
              ⌂
            </button>
            <button
              type="button"
              class="rounded-md px-1.5 py-1 text-base leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              title="到最下面"
              @click="scrollToBottom()"
            >
              ⤓
            </button>
          </div>
        </div>

        <!-- 工具条：非固定态收起到标题下方，鼠标移到这条热区再浮现 -->
        <div
          class="shrink-0"
          @mouseenter="toolbarHovered = true"
          @mouseleave="toolbarHovered = false"
        >
          <div class="h-2" />
          <EditorToolbar
            v-show="toolbarVisible"
            :editor="editor"
            :pinned="toolbarPinned"
            @toggle-pin="toggleToolbarPin"
          />
        </div>

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

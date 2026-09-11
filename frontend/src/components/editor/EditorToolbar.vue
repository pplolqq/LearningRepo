<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Editor } from '@tiptap/core'

const props = defineProps<{ editor: Editor | undefined }>()

/** 读取 isActive：Editor 的 state 是 Vue 的 customRef，在 computed 里读即自动追踪重渲染 */
const active = computed(() => {
  const e = props.editor
  if (!e) {
    return {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
      highlight: false,
      subscript: false,
      superscript: false,
      h1: false,
      h2: false,
      h3: false,
      bulletList: false,
      orderedList: false,
      taskList: false,
      blockquote: false,
      codeBlock: false,
      link: false,
    }
  }
  return {
    bold: e.isActive('bold'),
    italic: e.isActive('italic'),
    underline: e.isActive('underline'),
    strike: e.isActive('strike'),
    code: e.isActive('code'),
    highlight: e.isActive('highlight'),
    subscript: e.isActive('subscript'),
    superscript: e.isActive('superscript'),
    h1: e.isActive('heading', { level: 1 }),
    h2: e.isActive('heading', { level: 2 }),
    h3: e.isActive('heading', { level: 3 }),
    bulletList: e.isActive('bulletList'),
    orderedList: e.isActive('orderedList'),
    taskList: e.isActive('taskList'),
    blockquote: e.isActive('blockquote'),
    codeBlock: e.isActive('codeBlock'),
    link: e.isActive('link'),
  }
})

const disabled = computed(() => !props.editor)

function cls(isActive: boolean): string {
  return [
    'inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-1 rounded px-1.5 text-xs leading-none transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-35',
    isActive ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100',
  ].join(' ')
}

const divider = 'mx-1 h-4 w-px shrink-0 bg-stone-200'

/* ------------------------------------------------------------------ 链接 */

const linkOpen = ref(false)
const linkDraft = ref('')

function toggleLinkPopover(): void {
  const e = props.editor
  if (!e) return
  if (linkOpen.value) {
    linkOpen.value = false
    return
  }
  const href = e.getAttributes('link').href
  linkDraft.value = typeof href === 'string' ? href : ''
  linkOpen.value = true
}

function applyLink(): void {
  const e = props.editor
  if (!e) return
  const url = linkDraft.value.trim()
  if (url === '') {
    e.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    e.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run()
  }
  linkOpen.value = false
}

function removeLink(): void {
  props.editor?.chain().focus().extendMarkRange('link').unsetLink().run()
  linkOpen.value = false
}
</script>

<template>
  <div
    class="relative flex shrink-0 flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50/70 px-5 py-1.5"
  >
    <!-- 行内格式 -->
    <button type="button" :class="cls(active.bold)" :disabled="disabled" title="粗体 ⌘B"
      @click="editor?.chain().focus().toggleBold().run()">
      <span class="font-bold">B</span>
    </button>
    <button type="button" :class="cls(active.italic)" :disabled="disabled" title="斜体 ⌘I"
      @click="editor?.chain().focus().toggleItalic().run()">
      <span class="italic">I</span>
    </button>
    <button type="button" :class="cls(active.underline)" :disabled="disabled" title="下划线 ⌘U"
      @click="editor?.chain().focus().toggleUnderline().run()">
      <span class="underline">U</span>
    </button>
    <button type="button" :class="cls(active.strike)" :disabled="disabled" title="删除线"
      @click="editor?.chain().focus().toggleStrike().run()">
      <span class="line-through">S</span>
    </button>
    <button type="button" :class="cls(active.code)" :disabled="disabled" title="行内代码"
      @click="editor?.chain().focus().toggleCode().run()">
      <span class="font-mono">&lt;/&gt;</span>
    </button>
    <button type="button" :class="cls(active.highlight)" :disabled="disabled" title="高亮"
      @click="editor?.chain().focus().toggleHighlight().run()">
      <span class="rounded-sm bg-amber-200 px-1">H</span>
    </button>
    <button type="button" :class="cls(active.subscript)" :disabled="disabled" title="下标"
      @click="editor?.chain().focus().toggleSubscript().run()">
      <span>A<sub class="text-[9px]">2</sub></span>
    </button>
    <button type="button" :class="cls(active.superscript)" :disabled="disabled" title="上标"
      @click="editor?.chain().focus().toggleSuperscript().run()">
      <span>A<sup class="text-[9px]">2</sup></span>
    </button>

    <span :class="divider" />

    <!-- 标题 -->
    <button type="button" :class="cls(active.h1)" :disabled="disabled" title="一级标题"
      @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">H1</button>
    <button type="button" :class="cls(active.h2)" :disabled="disabled" title="二级标题"
      @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
    <button type="button" :class="cls(active.h3)" :disabled="disabled" title="三级标题"
      @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>

    <span :class="divider" />

    <!-- 块 -->
    <button type="button" :class="cls(active.bulletList)" :disabled="disabled" title="无序列表"
      @click="editor?.chain().focus().toggleBulletList().run()">•≡</button>
    <button type="button" :class="cls(active.orderedList)" :disabled="disabled" title="有序列表"
      @click="editor?.chain().focus().toggleOrderedList().run()">1≡</button>
    <button type="button" :class="cls(active.taskList)" :disabled="disabled" title="待办列表"
      @click="editor?.chain().focus().toggleTaskList().run()">☑</button>
    <button type="button" :class="cls(active.blockquote)" :disabled="disabled" title="引用"
      @click="editor?.chain().focus().toggleBlockquote().run()">❝</button>
    <button type="button" :class="cls(active.codeBlock)" :disabled="disabled" title="代码块"
      @click="editor?.chain().focus().toggleCodeBlock().run()">{ }</button>

    <span :class="divider" />

    <!-- 插入 -->
    <button type="button" :class="cls(false)" :disabled="disabled" title="插入 3×3 表格"
      @click="editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">▦</button>
    <button type="button" :class="cls(false)" :disabled="disabled" title="分割线"
      @click="editor?.chain().focus().setHorizontalRule().run()">—</button>

    <!-- 链接：点开一个小气泡输入地址 -->
    <button type="button" :class="cls(active.link || linkOpen)" :disabled="disabled" title="链接"
      @click="toggleLinkPopover()">🔗</button>

    <div
      v-if="linkOpen"
      class="absolute top-full left-5 z-30 mt-1 flex w-80 items-center gap-1 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"
    >
      <input
        v-model="linkDraft"
        type="text"
        placeholder="https://example.com"
        class="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
        @keydown.enter.prevent="applyLink()"
        @keydown.esc.prevent="linkOpen = false"
      />
      <button type="button" class="rounded bg-stone-800 px-2 py-1 text-xs text-white hover:bg-stone-700"
        @click="applyLink()">
        确定
      </button>
      <button v-if="active.link" type="button"
        class="rounded px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-100" @click="removeLink()">
        移除
      </button>
    </div>
  </div>
</template>

import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** 一处命中：文档里的 [from, to) 区间 */
export interface SearchMatch {
  from: number
  to: number
}

export interface SearchHighlightState {
  matches: SearchMatch[]
  /** 当前命中的下标，-1 表示没有 */
  current: number
}

export const EMPTY_SEARCH_STATE: SearchHighlightState = { matches: [], current: -1 }

export const searchHighlightKey = new PluginKey<SearchHighlightState>('noteSearchHighlight')

/**
 * 在文档里找 query 的全部命中（大小写不敏感）。
 *
 * 只扫 text 节点，所以命中不会跨 mark / 节点边界（例如 `**加**粗` 里搜「加粗」
 * 找不到）—— 这是有意的取舍：跨节点命中需要拼接文本再反推位置，成本高收益低。
 */
export function findMatches(doc: PMNode, query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  const matches: SearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || node.text === undefined) return true
    const haystack = node.text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = haystack.indexOf(needle, index + needle.length)
    }
    return true
  })
  return matches
}

/** 把命中结果交给插件渲染（走 meta，不修改文档，不进 undo 栈） */
export function applySearchState(editor: Editor, state: SearchHighlightState): void {
  editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, state))
}

/**
 * 搜索高亮的唯一职责是「把命中画出来」，不注册任何节点 / mark，
 * 因此不影响 SPEC §2 白名单与前端的契约校验。
 *
 * 命中区间由使用方（TiptapEditor 的搜索条）计算后通过 meta 传进来：
 * 插件不持有 query，也就不会因为输入法组合、doc 变更而自己失效。
 */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightKey,
        state: {
          init: () => EMPTY_SEARCH_STATE,
          apply: (tr, value) => {
            const meta = tr.getMeta(searchHighlightKey) as SearchHighlightState | undefined
            if (meta) return meta
            // 文档改过之后旧区间就失效了，先清空；使用方会重新算一份再 dispatch 进来
            if (tr.docChanged && value.matches.length > 0) return EMPTY_SEARCH_STATE
            return value
          },
        },
        props: {
          decorations(state) {
            const value = searchHighlightKey.getState(state)
            if (!value || value.matches.length === 0) return null
            return DecorationSet.create(
              state.doc,
              value.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class: index === value.current ? 'note-search-hit is-current' : 'note-search-hit',
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})

/**
 * 契约校验：用真实的 Tiptap schema 反序列化后端产出的 JSON。
 *
 * 目的：前端注册的扩展集合（src/editor/extensions.ts）必须与后端 markdown 转换器
 * （backend/app/md_convert.py）产出的节点 / mark 类型完全对齐；一旦有名字不一致或
 * 嵌套不合法，ProseMirror 会**静默丢弃**内容，只在运行时才看得出来。
 *
 * 跑法（由 scripts/check-contract.sh 调用）：
 *   vite build --ssr scripts/check-schema.ts --outDir .tmp-check && node .tmp-check/check-schema.js <content.json>
 */

import { readFileSync } from 'node:fs'
import { getSchema, type JSONContent } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions'
import { toPayloadContent } from '../src/editor/document'
import { collectHeadings, outlineBaseLevel } from '../src/editor/outline'

/** SPEC §2 白名单（唯一真相） */
const SPEC_NODES = [
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'text',
  'hardBreak',
]

const SPEC_MARKS = [
  'bold',
  'italic',
  'strike',
  'code',
  'underline',
  'link',
  'highlight',
  'subscript',
  'superscript',
]

/** Tiptap 插件类扩展会额外注册的「非 schema」节点，白名单里没有但允许存在 */
const ALLOWED_EXTRA_NODES = new Set<string>([])

const failures: string[] = []
let checks = 0

function check(label: string, ok: boolean, extra = ''): void {
  checks += 1
  if (!ok) failures.push(`[${label}] ${extra}`)
}

const schema = getSchema(buildExtensions())
const nodeNames = Object.keys(schema.nodes)
const markNames = Object.keys(schema.marks)

console.log('schema 节点:', [...nodeNames].sort().join(', '))
console.log('schema mark:', [...markNames].sort().join(', '))
console.log('')

for (const name of SPEC_NODES) {
  check(`节点缺失 ${name}`, nodeNames.includes(name), `schema 里没有 ${name}`)
}
for (const name of markNames) {
  check(`mark 越界 ${name}`, SPEC_MARKS.includes(name), `schema 注册了白名单外的 mark`)
}
for (const name of nodeNames) {
  check(`节点越界 ${name}`, SPEC_NODES.includes(name) || ALLOWED_EXTRA_NODES.has(name), 'schema 注册了白名单外的节点')
}

// ---------------------------------------------------------------- 反序列化后端产物

const file = process.argv[2]
if (!file) {
  console.error('用法: node check-schema.js <content.json>')
  process.exit(2)
}

const doc = JSON.parse(readFileSync(file, 'utf8')) as JSONContent
const parsed = schema.nodeFromJSON(doc)
// check() 会校验内容表达式是否满足（例如 tableCell 里必须放 block）
parsed.check()

// 真实链路是「解析 → 保存前按 SPEC §2 裁剪 attrs（sanitizeContentForSpec）」，
// 因为 Tiptap 的 Link / Image 等扩展会补出 rel、class、title 这类默认 attrs。
const payload = toPayloadContent(parsed.toJSON())

/**
 * 规范化序列化：递归排序对象键。
 * JSON 对象键序无语义，Tiptap 产出的 text 节点会把 marks 排在 text 前面，
 * 后端排在后面，两者等价，不能当成契约不一致。
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

const fromJson = canonical(payload)
const original = canonical(doc)

/** 收集 JSON 里出现的全部节点 / mark 类型 */
function collect(json: unknown, nodes: Set<string>, marks: Set<string>): void {
  if (Array.isArray(json)) {
    json.forEach((item) => collect(item, nodes, marks))
    return
  }
  if (typeof json !== 'object' || json === null) return
  const record = json as { type?: string; marks?: { type?: string }[]; content?: unknown }
  if (typeof record.type === 'string') nodes.add(record.type)
  for (const mark of record.marks ?? []) {
    if (typeof mark.type === 'string') marks.add(mark.type)
  }
  collect(record.content, nodes, marks)
}

function collectInto(json: unknown): { nodes: Set<string>; marks: Set<string> } {
  const nodes = new Set<string>()
  const marks = new Set<string>()
  collect(json, nodes, marks)
  return { nodes, marks }
}

const usedNodes = new Set<string>()
const usedMarks = new Set<string>()
collect(doc, usedNodes, usedMarks)

console.log('后端产出的节点:', [...usedNodes].sort().join(', '))
console.log('后端产出的 mark:', [...usedMarks].sort().join(', '))
console.log('')

console.log('解析→裁剪后的节点:', [...collectInto(payload).nodes].sort().join(', '))
console.log('解析→裁剪后的 mark:', [...collectInto(payload).marks].sort().join(', '))
console.log('')

for (const name of usedNodes) {
  check(`后端节点未注册 ${name}`, nodeNames.includes(name), '前端 schema 接受不了，内容会被丢弃')
}
for (const name of usedMarks) {
  check(`后端 mark 未注册 ${name}`, markNames.includes(name), '前端 schema 接受不了，格式会被丢弃')
}

// ------------------------------------------------------------------ 目录（TOC）

// 与 NoteOutline.vue 共用同一份实现（src/editor/outline.ts），不是复制的测试实现
const headings = collectHeadings(parsed)
const baseLevel = outlineBaseLevel(headings)

console.log('目录:')
for (const item of headings) {
  console.log(`  ${'  '.repeat(item.level - baseLevel)}H${item.level} @${item.pos}  ${item.text}`)
}
console.log('')

check('目录:抽到标题', headings.length > 0, '一个标题都没抽到')
check('目录:层级递增合法', headings.every((h) => h.level >= 1 && h.level <= 6), '有非法 level')
check('目录:位置合法', headings.every((h) => h.pos >= 0 && h.pos < parsed.content.size), 'pos 越界')
check(
  '目录:位置互不相同',
  new Set(headings.map((h) => h.pos)).size === headings.length,
  'pos 重复',
)
// pos 必须真的是「该标题所在位置的节点」—— 跳转靠的就是它
for (const item of headings) {
  const node = parsed.nodeAt(item.pos)
  check(`目录:pos 指向标题 (${item.text})`, node?.type.name === 'heading', `实际是 ${node?.type.name}`)
  check(`目录:文本一致 (${item.text})`, (node?.textContent ?? '').trim() === item.text, `节点文本是 ${node?.textContent}`)
}

// 样例文档的标题结构是已知的，固定住防止回归
const expected = [
  [1, '一级标题'],
  [2, '二级标题'],
  [3, '三级标题'],
  [4, '四级标题'],
  [5, '五级标题'],
  [6, '六级标题'],
  [2, '列表'],
  [2, '引用与代码'],
  [2, '表格'],
  [2, '图片与分割线'],
  [2, '降级兜底'],
]
check(
  '目录:sample.md 结构',
  JSON.stringify(headings.map((h) => [h.level, h.text])) === JSON.stringify(expected),
  `实际 ${JSON.stringify(headings.map((h) => [h.level, h.text]))}`,
)

// 往返必须一致 —— 任何差异都说明有内容在反序列化时被改写或丢弃
if (fromJson !== original) {
  check('往返一致性', false, '反序列化后 JSON 发生变化')
  const a = original
  const b = fromJson
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  console.error('\n首个差异位置:', i)
  console.error('原始:', a.slice(Math.max(0, i - 60), i + 120))
  console.error('结果:', b.slice(Math.max(0, i - 60), i + 120))
}

console.log(`共检查 ${checks} 项`)
if (failures.length > 0) {
  console.error(`\n❌ 契约不一致 ${failures.length} 项：`)
  for (const item of failures) console.error('  -', item)
  process.exit(1)
}
console.log('✅ 前后端契约一致，且往返无内容损失')

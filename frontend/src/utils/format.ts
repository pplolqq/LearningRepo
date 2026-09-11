/** 时间展示工具：后端统一返回 UTC ISO8601 字符串 */

/** 解析 ISO 字符串；若缺少时区信息则按 UTC 处理（避免被当成本地时间） */
function parseIso(iso: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** 2024-05-06 14:03 */
export function formatDateTime(iso: string): string {
  const date = parseIso(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 具体日期 */
export function formatRelativeTime(iso: string): string {
  const date = parseIso(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 0) return formatDateTime(iso)
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return formatDateTime(iso)
}

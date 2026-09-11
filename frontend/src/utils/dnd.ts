/** HTML5 拖拽用到的自定义 MIME 类型 */

export const NOTE_DND_TYPE = 'application/x-notetiptap-note'
export const FOLDER_DND_TYPE = 'application/x-notetiptap-folder'

export type DragKind = 'note' | 'folder'

export interface DragData {
  kind: DragKind
  id: number
}

export function setDragData(event: DragEvent, data: DragData): void {
  const transfer = event.dataTransfer
  if (!transfer) return
  transfer.setData(data.kind === 'note' ? NOTE_DND_TYPE : FOLDER_DND_TYPE, String(data.id))
  transfer.effectAllowed = 'move'
}

/** dragover 阶段浏览器处于保护模式，读不到 data，只能靠 types 判断类型 */
export function readDragKind(event: DragEvent): DragKind | null {
  const types = event.dataTransfer?.types
  if (!types) return null
  if (types.includes(NOTE_DND_TYPE)) return 'note'
  if (types.includes(FOLDER_DND_TYPE)) return 'folder'
  return null
}

/** drop 阶段才能读到真实数据 */
export function readDragData(event: DragEvent): DragData | null {
  const transfer = event.dataTransfer
  if (!transfer) return null
  const noteId = transfer.getData(NOTE_DND_TYPE)
  if (noteId !== '') return { kind: 'note', id: Number(noteId) }
  const folderId = transfer.getData(FOLDER_DND_TYPE)
  if (folderId !== '') return { kind: 'folder', id: Number(folderId) }
  return null
}

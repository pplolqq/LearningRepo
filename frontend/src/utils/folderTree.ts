import type { FolderNode } from '@/api/types'

/** 深度优先展平文件夹树 */
export function flattenFolders(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (list: FolderNode[]): void => {
    for (const node of list) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** 取某个文件夹及其所有后代的 id（用于级联删除、拖拽合法性判断） */
export function collectSubtreeIds(nodes: FolderNode[], id: number): number[] {
  const target = flattenFolders(nodes).find((node) => node.id === id)
  if (!target) return [id]
  return flattenFolders([target]).map((node) => node.id)
}

/** candidateId 是否就是 ancestorId 本身或其后代 */
export function isSelfOrDescendantOf(
  nodes: FolderNode[],
  candidateId: number,
  ancestorId: number,
): boolean {
  if (candidateId === ancestorId) return true
  return collectSubtreeIds(nodes, ancestorId).includes(candidateId)
}

/** 根据 id 找文件夹名（找不到返回 null） */
export function findFolderName(nodes: FolderNode[], id: number | null): string | null {
  if (id === null) return null
  return flattenFolders(nodes).find((node) => node.id === id)?.name ?? null
}

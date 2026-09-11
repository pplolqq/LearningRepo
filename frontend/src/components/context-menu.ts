/** 右键菜单条目（ContextMenu.vue 的 props 契约） */
export interface ContextMenuItem {
  label: string
  /** 危险项（删除）显示红色 */
  danger?: boolean
  action: () => void
}

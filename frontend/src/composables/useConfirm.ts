import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（删除）用红色确认按钮 */
  danger?: boolean
}

interface ConfirmState extends Required<ConfirmOptions> {
  visible: boolean
}

/** 全局唯一的二次确认弹窗状态（由 ConfirmDialog.vue 渲染） */
export const confirmState = reactive<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let resolver: ((confirmed: boolean) => void) | null = null

/** 打开二次确认，resolve(true) = 用户确认 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  closeConfirm(false)
  confirmState.title = options.title
  confirmState.message = options.message
  confirmState.confirmText = options.confirmText ?? '确定'
  confirmState.cancelText = options.cancelText ?? '取消'
  confirmState.danger = options.danger ?? false
  confirmState.visible = true
  return new Promise<boolean>((resolve) => {
    resolver = resolve
  })
}

export function closeConfirm(confirmed: boolean): void {
  confirmState.visible = false
  const resolve = resolver
  resolver = null
  if (resolve) resolve(confirmed)
}

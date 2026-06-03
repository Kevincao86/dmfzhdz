import type { ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  children: ReactNode
  /** 固定在滚动区与底部按钮之间（如日期弹窗的时间选择） */
  pinnedBottom?: ReactNode
  /** 城市选择等较高内容 */
  tall?: boolean
}

/** 小程序风格底部小弹窗（点击遮罩关闭） */
export default function PublishSheet({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = '确认',
  children,
  pinnedBottom,
  tall,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-3 sm:p-6 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-lg flex flex-col rounded-2xl border border-white/10 bg-[#1a1a28] shadow-2xl ${
          tall ? 'max-h-[min(88vh,720px)]' : 'max-h-[min(75vh,560px)]'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-sheet-title"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
          <h3 id="publish-sheet-title" className="font-semibold text-[15px]">
            {title}
          </h3>
          <button type="button" className="text-slate-400 hover:text-white text-sm px-2 py-1" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="flex-1 overflow-auto px-4 py-3 min-h-0">{children}</div>
        {pinnedBottom ? <div className="shrink-0 border-t border-white/10">{pinnedBottom}</div> : null}
        {onConfirm ? (
          <footer className="px-4 py-3 border-t border-white/10 shrink-0">
            <button type="button" className="w-full py-2.5 rounded-xl bg-violet-600 text-sm font-medium" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

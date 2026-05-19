import type { ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** 关闭弹窗后的次要操作，如「去绑定」 */
  primaryAction?: { label: string; onClick: () => void }
}

export default function BindGuideModal({
  open,
  title,
  onClose,
  children,
  primaryAction,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platform-bind-guide-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,900px)] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 id="platform-bind-guide-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="关闭"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            关闭
          </button>
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {primaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** 智能体抽屉内详情弹层（z-index 高于 AiAgentDrawer） */
export function AiAgentOverlayModal({ open, title, subtitle, onClose, children, footer }: Props) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-agent-detail-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 id="ai-agent-detail-title" className="text-base font-semibold text-slate-900">
              {title}
            </h3>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 px-4 py-3 sm:px-5">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

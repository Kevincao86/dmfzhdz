import type { ReactNode } from 'react'
import PartnerScopedBanner from '../components/PartnerScopedBanner'

export default function ModulePage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-cyan-500 to-teal-500" aria-hidden />
          <h1 className="erp-page-title">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-slate-600">{subtitle}</div>}
        </div>
        {actions}
      </div>
      <PartnerScopedBanner />
      {children ?? (
        <div className="erp-panel p-10 text-center text-slate-500">
          本模块界面已与线上路由对齐；业务数据需连接后端后展示。
        </div>
      )}
    </div>
  )
}

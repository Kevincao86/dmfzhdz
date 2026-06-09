import { ChevronRight, ExternalLink, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AiRecruitmentOrderDetail } from '../lib/aiAgentTypes'
import { cn } from '../cn'
import { AiAgentOverlayModal } from './AiAgentOverlayModal'

export function AiAgentRecruitmentOrderDetailCard({ order }: { order: AiRecruitmentOrderDetail }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const tiers = [
    ['V3', order.allocation.v3],
    ['V4', order.allocation.v4],
    ['V5', order.allocation.v5],
    ['V5+', order.allocation.v5plus],
  ] as const

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={cn(
          'mt-3 w-full overflow-hidden rounded-xl border border-emerald-200/90 bg-white text-left shadow-sm ring-1 ring-emerald-100/60',
          'transition-all hover:border-emerald-300 hover:shadow-md hover:ring-2 hover:ring-emerald-100',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
        )}
      >
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50/80 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-emerald-800">达人招募订单</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{order.orderId}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
              {order.opsStatusLabel}
            </span>
          </div>
        </div>
        <div className="space-y-3 px-4 py-3 text-sm text-slate-700">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Row label="投放平台" value={order.platform} />
            <Row label="主推品" value={order.mainProductName} />
            <Row label="预算" value={`¥${order.budgetYuan.toLocaleString('zh-CN')}`} />
            <Row label="计划达人数" value={`${order.totalHeadcount} 人`} />
          </dl>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {tiers.map(([label, n]) => (
              <div key={label} className="rounded-md bg-slate-50 px-1 py-1.5 ring-1 ring-slate-100">
                <p className="text-[9px] text-slate-500">{label}</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">{n}</p>
              </div>
            ))}
          </div>
          {order.briefExcerpt ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">Brief：{order.briefExcerpt}</p>
          ) : null}
          <p className="flex items-center justify-end gap-0.5 text-[10px] font-medium text-emerald-700">
            查看订单详情
            <ChevronRight className="h-3 w-3" />
          </p>
        </div>
      </button>

      <AiAgentOverlayModal
        open={detailOpen}
        title="招募订单详情"
        subtitle={order.orderId}
        onClose={() => setDetailOpen(false)}
        footer={
          <Link
            to="/recruitment"
            onClick={() => setDetailOpen(false)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
          >
            在达人招募页继续跟进
            <ExternalLink className="h-3 w-3" />
          </Link>
        }
      >
        <div className="space-y-4 text-sm text-slate-700">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="投放平台" value={order.platform} />
            <Row label="主推品" value={order.mainProductName} />
            <Row label="门店/商户" value={order.storeName} />
            <Row label="预算" value={`¥${order.budgetYuan.toLocaleString('zh-CN')}`} />
            <Row label="计划达人数" value={`${order.totalHeadcount} 人`} />
            <Row label="创建时间" value={order.createdAt} />
            <Row label="运营状态" value={order.opsStatusLabel} />
          </dl>
          {order.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {order.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          <AllocationBlock order={order} tiers={tiers} />
          {order.briefText ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Brief 全文</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {order.briefText}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </AiAgentOverlayModal>
    </>
  )
}

function AllocationBlock({
  order,
  tiers,
}: {
  order: AiRecruitmentOrderDetail
  tiers: ReadonlyArray<readonly [string, number]>
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        order.allocation.source === 'library' || order.allocation.source === 'ai'
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-slate-200 bg-slate-50/80',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
        AI 智能分配 · 达人档位
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            order.allocation.source === 'library' || order.allocation.source === 'ai'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-200 text-slate-700',
          )}
        >
          {order.allocation.source === 'library'
            ? '达人库测算'
            : order.allocation.source === 'ai'
              ? '模型估算'
              : '规则估算'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {tiers.map(([label, n]) => (
          <div key={label} className="rounded-md bg-white/90 px-1 py-2 ring-1 ring-slate-100">
            <p className="text-[10px] text-slate-500">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{n}</p>
          </div>
        ))}
      </div>
      {order.allocation.costHint ? (
        <p className="mt-2 text-xs text-slate-600">{order.allocation.costHint}</p>
      ) : null}
      {order.allocation.notes ? <p className="mt-1 text-xs text-slate-500">{order.allocation.notes}</p> : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

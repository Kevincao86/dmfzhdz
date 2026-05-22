import { ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import {
  buildIceVideoSlotProgress,
  findMpOrderForMerchantIce,
  summarizeIceSlotProgress,
  type IceSlotProgressStage,
  type IceVideoSlotProgressRow,
} from '../lib/iceDispatchSlotProgress'
import { fetchOpsRegistry } from '../lib/opsRegistryClient'
import type { RegistryRecruitmentOrder } from '../lib/opsRegistryTypes'

const POLL_MS = 5000
const COLLAPSE_THRESHOLD = 5
const COLLAPSED_PREVIEW = 3

const STAGE_STYLE: Record<IceSlotProgressStage, string> = {
  ops_pending: 'bg-zinc-200 text-zinc-700',
  waiting_talent: 'bg-amber-100 text-amber-900',
  pending_confirm: 'bg-sky-100 text-sky-900',
  in_progress: 'bg-indigo-100 text-indigo-900',
  verify_pending: 'bg-violet-100 text-violet-900',
  done: 'bg-emerald-100 text-emerald-900',
  verify_failed: 'bg-red-100 text-red-900',
}

type Props = {
  merchantOrderId: string
  onRefreshError?: (msg: string | null) => void
}

export function IceDispatchProgressPanel({ merchantOrderId, onRefreshError }: Props) {
  const [rows, setRows] = useState<IceVideoSlotProgressRow[]>([])
  const [merchantOrder, setMerchantOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    try {
      const reg = await fetchOpsRegistry()
      const mo =
        reg.recruitmentOrders?.find((o) => o.id === merchantOrderId) ?? null
      const mp = findMpOrderForMerchantIce(reg, mo)
      const next = buildIceVideoSlotProgress(mo, mp)
      setMerchantOrder(mo)
      setRows(next)
      onRefreshError?.(null)
    } catch (e) {
      onRefreshError?.(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [merchantOrderId, onRefreshError])

  useEffect(() => {
    setLoading(true)
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const summary = useMemo(() => summarizeIceSlotProgress(rows), [rows])
  const shouldCollapse = rows.length > COLLAPSE_THRESHOLD
  const showAll = !shouldCollapse || expanded
  const visibleRows = showAll ? rows : rows.slice(0, COLLAPSED_PREVIEW)

  if (loading && rows.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-3 text-xs text-violet-900">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载达人接单进度…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-violet-200 bg-white/80 px-3 py-3 text-xs text-violet-800">
        暂无成片槽位进度，请确认运营台已下发云剪单。
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => shouldCollapse && setExpanded((v) => !v)}
        disabled={!shouldCollapse}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-violet-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">达人投放进度</p>
            <p className="mt-0.5 text-xs text-zinc-600">
              共 {summary.total} 条 · 待接单 {summary.waiting} · 进行中 {summary.accepted} · 已完成{' '}
              {summary.done}
            </p>
          </div>
        </div>
        {shouldCollapse ? (
          expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          )
        ) : null}
      </button>

      {merchantOrder?.linkedMpOrderId ? (
        <p className="border-t border-violet-100 px-4 py-1.5 font-mono text-[10px] text-violet-700/80">
          小程序单 {merchantOrder.linkedMpOrderId}
        </p>
      ) : (
        <p className="border-t border-violet-100 px-4 py-1.5 text-[10px] text-amber-800">
          待运营在后台下发云剪单至达人小程序后，进度将自动更新
        </p>
      )}

      <ul className="max-h-[min(420px,50vh)] space-y-1.5 overflow-y-auto border-t border-violet-100 px-3 py-2">
        {visibleRows.map((r) => (
          <li
            key={r.slotId}
            className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-900">
                {r.label}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  STAGE_STYLE[r.stage],
                )}
              >
                {r.stageLabel}
              </span>
            </div>
            {r.talentName ? (
              <p className="mt-1 text-[11px] text-zinc-700">
                达人：{r.talentName}
                {r.talentPlatform ? ` · ${r.talentPlatform}` : ''}
              </p>
            ) : null}
            {r.detail ? <p className="mt-0.5 text-[10px] text-zinc-500">{r.detail}</p> : null}
          </li>
        ))}
      </ul>

      {shouldCollapse && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-violet-100 py-2 text-center text-xs font-medium text-violet-700 hover:bg-violet-50/50"
        >
          展开全部 {rows.length} 条进度
        </button>
      ) : shouldCollapse && expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full border-t border-violet-100 py-2 text-center text-xs text-zinc-500 hover:bg-zinc-50"
        >
          收起列表
        </button>
      ) : null}
    </div>
  )
}

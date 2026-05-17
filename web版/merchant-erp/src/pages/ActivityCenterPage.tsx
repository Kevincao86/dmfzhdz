import { CalendarDays, Loader2, Megaphone, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import StorePlatformSwitcher from '../components/store/StorePlatformSwitcher'
import type { MarketingActivityItem, MarketingActivityUiStatus } from '../lib/marketingActivityTypes'
import type { StorePlatformTab } from '../services/merchantStoresApi'
import {
  fetchMarketingActivities,
  type MarketingActivityStatusFilter,
} from '../services/marketingActivitiesApi'

const STATUS_TABS: { id: MarketingActivityStatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'ongoing', label: '进行中' },
  { id: 'enrollable', label: '可报名' },
  { id: 'ended', label: '已结束' },
]

function platformTabToApi(p: StorePlatformTab): 'douyin' | 'meituan' | 'xiaohongshu' | null {
  if (p === 'douyin' || p === 'meituan' || p === 'xiaohongshu') return p
  return null
}

function statusBadge(ui: MarketingActivityUiStatus): { label: string; className: string } {
  if (ui === 'ongoing') return { label: '进行中', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
  if (ui === 'enrollable') return { label: '可报名', className: 'bg-sky-50 text-sky-800 ring-sky-200' }
  if (ui === 'ended') return { label: '已结束', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  return { label: '未知', className: 'bg-amber-50 text-amber-900 ring-amber-200' }
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function ActivityCenterPage() {
  const [platformTab, setPlatformTab] = useState<StorePlatformTab>('douyin')
  const [statusFilter, setStatusFilter] = useState<MarketingActivityStatusFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [items, setItems] = useState<MarketingActivityItem[]>([])
  const [syncedAt, setSyncedAt] = useState<string | null>(null)

  const apiPlatform = useMemo(() => platformTabToApi(platformTab), [platformTab])

  const load = useCallback(async () => {
    if (!apiPlatform) {
      setItems([])
      setError(null)
      setNote('京东本地生活营销活动接口尚未接入')
      return
    }
    setLoading(true)
    setError(null)
    setNote(null)
    const r = await fetchMarketingActivities({
      platform: apiPlatform,
      status: statusFilter,
    })
    setLoading(false)
    if (!r.ok) {
      setItems([])
      setError(r.message)
      return
    }
    setItems(r.items)
    setSyncedAt(r.syncedAt)
    setNote(r.upstreamNote ?? null)
  }, [apiPlatform, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="relative pl-4">
          <span
            className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500"
            aria-hidden
          />
          <h1 className="erp-page-title flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-violet-600" aria-hidden />
            活动中心
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            对接抖音来客、美团、小红书平台营销活动 OpenAPI，按状态查看进行中、可报名与已结束活动
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !apiPlatform}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
      </div>

      <div className="mb-4">
        <StorePlatformSwitcher value={platformTab} onChange={setPlatformTab} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatusFilter(t.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition',
              statusFilter === t.id
                ? 'bg-violet-600 text-white ring-violet-600'
                : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {syncedAt && (
        <p className="mb-3 text-xs text-slate-500">
          最近同步：{formatTime(syncedAt)}
          {note ? ` · ${note}` : ''}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {!apiPlatform ? (
        <div className="erp-panel p-10 text-center text-slate-500">当前平台暂不支持营销活动列表</div>
      ) : loading && items.length === 0 ? (
        <div className="erp-panel flex items-center justify-center gap-2 p-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在拉取平台活动…
        </div>
      ) : items.length === 0 ? (
        <div className="erp-panel p-10 text-center text-slate-500">
          暂无符合筛选条件的活动
          {statusFilter !== 'all' ? '，可切换「全部」或确认平台侧是否已发布活动' : ''}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((act) => {
            const badge = statusBadge(act.uiStatus)
            return (
              <li key={`${act.platform}-${act.id}`} className="erp-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{act.title}</h2>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {act.summary && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{act.summary}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        开始 {formatTime(act.startAt)}
                      </span>
                      <span>结束 {formatTime(act.endAt)}</span>
                      {act.enrollDeadline && <span>报名截止 {formatTime(act.enrollDeadline)}</span>}
                    </div>
                  </div>
                  {act.enrollUrl && (
                    <a
                      href={act.enrollUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
                    >
                      去报名
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-slate-500">
        抖音文档：
        <a
          href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/marketing/activity-query"
          target="_blank"
          rel="noreferrer"
          className="text-violet-700 underline"
        >
          营销活动查询
        </a>
        。若列表为空，请在来客开放平台开通对应 scope，或由运维配置 DOUYIN_MARKETING_ACTIVITY_QUERY_PATH。
      </p>
    </div>
  )
}

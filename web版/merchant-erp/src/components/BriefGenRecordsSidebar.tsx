import { ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMpBriefGenRecords,
  type MpBriefGenRecordRow,
} from '../services/mpBriefGenRecordsClient'
import { PLATFORM_OPTIONS, STYLE_OPTIONS } from '../services/viralBriefAi'

function formatRecordTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function briefRecordTitle(row: { orderTitle?: string; orderId?: string }): string {
  const title = String(row.orderTitle || '').trim()
  if (title) return title
  const id = String(row.orderId || '').trim()
  if (id.startsWith('brief-direct-') || id.startsWith('direct-')) return '直接生成'
  if (id) return id
  return '直接生成'
}

function platformLabel(id: string): string {
  return PLATFORM_OPTIONS.find((p) => p.id === id)?.label ?? id
}

function styleLabel(id: string): string {
  return STYLE_OPTIONS.find((s) => s.id === id)?.label ?? id
}

type Props = {
  limit?: number
  refreshToken?: number
  className?: string
}

/** Brief 生成页右侧：最近记录摘要 + 跳转全部记录 */
export default function BriefGenRecordsSidebar({
  limit = 5,
  refreshToken = 0,
  className,
}: Props) {
  const [records, setRecords] = useState<MpBriefGenRecordRow[]>([])
  const [retentionDays, setRetentionDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMpBriefGenRecords()
      setRecords(data.records)
      setRetentionDays(data.retentionDays)
    } catch (e) {
      setRecords([])
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const recent = useMemo(
    () =>
      [...records]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit),
    [records, limit],
  )

  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className ?? ''}`}
      aria-label="最近生成记录"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold embed-text-primary">最近生成记录</h2>
          <p className="mt-0.5 text-xs embed-text-muted">近 {retentionDays} 天 · 最多展示 {limit} 条</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg p-1.5 text-[var(--shell-muted,theme(colors.gray.500))] hover:bg-gray-100 disabled:opacity-50"
          title="刷新"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      {loading && recent.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 py-6 text-xs embed-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : null}

      {!loading && !error && recent.length === 0 ? (
        <p className="mt-4 py-6 text-center text-xs embed-text-muted">暂无记录，生成成功后会出现在这里</p>
      ) : null}

      {recent.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {recent.map((row) => {
            const preview = String(row.fullMarkdown || '').trim().slice(0, 72)
            return (
              <li key={row.id}>
                <Link
                  to={`records?highlight=${encodeURIComponent(row.id)}`}
                  className="block rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 transition-colors hover:border-violet-200 hover:bg-violet-50/50"
                >
                  <p className="truncate text-sm font-medium embed-text-primary">
                    {briefRecordTitle(row)}
                  </p>
                  <p className="mt-0.5 text-[11px] embed-text-muted">
                    {platformLabel(row.platform)} · {styleLabel(row.style)} · {formatRecordTime(row.createdAt)}
                  </p>
                  {preview ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed embed-text-muted">{preview}</p>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Link
        to="records"
        className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100"
      >
        查看全部生成记录
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  )
}

import { ChevronDown, ChevronUp, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMpBriefGenRecords,
  type MpBriefGenRecordRow,
} from '../services/mpBriefGenRecordsClient'
import { PLATFORM_OPTIONS, STYLE_OPTIONS } from '../services/viralBriefAi'

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

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

function platformLabel(id: string): string {
  return (PLATFORM_OPTIONS.find((p) => p.id === id)?.label ?? id) || '—'
}

function styleLabel(id: string): string {
  return (STYLE_OPTIONS.find((s) => s.id === id)?.label ?? id) || '—'
}

export default function BriefGenRecordsPage() {
  const [records, setRecords] = useState<MpBriefGenRecordRow[]>([])
  const [retentionDays, setRetentionDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copyTip, setCopyTip] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMpBriefGenRecords()
      setRecords(data.records)
      setRetentionDays(data.retentionDays)
    } catch (e) {
      setRecords([])
      setError(e instanceof Error ? e.message : '加载生成记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sortedRecords = useMemo(
    () =>
      [...records].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [records],
  )

  const onCopy = async (text: string) => {
    if (!text) return
    const ok = await copyTextToClipboard(text)
    setCopyTip(ok ? '已复制到剪贴板' : '复制失败')
    window.setTimeout(() => setCopyTip(null), 2500)
  }

  return (
    <div className="ai-content-page mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="erp-page-title">生成记录</h1>
          <p className="mt-1 text-sm embed-text-muted">
            近 {retentionDays} 天内生成的 Brief / 文稿；超过 {retentionDays} 天将自动清除。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium embed-text-primary hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
      </div>

      {copyTip ? <p className="text-xs text-emerald-700">{copyTip}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading && records.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm embed-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : null}

      {!loading && !error && sortedRecords.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm embed-text-muted">近 {retentionDays} 天暂无生成记录</p>
          <p className="mt-1 text-xs embed-text-muted">成功生成 Brief 后会自动保存到此列表</p>
        </section>
      ) : null}

      {sortedRecords.length > 0 ? (
        <ul className="space-y-3">
          {sortedRecords.map((row) => {
            const expanded = expandedId === row.id
            const preview = String(row.fullMarkdown || '').trim().slice(0, 160)
            return (
              <li
                key={row.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-4 text-left"
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold embed-text-primary">
                      {row.orderTitle || row.orderId || '未命名订单'}
                    </p>
                    <p className="mt-1 text-xs embed-text-muted">
                      {platformLabel(row.platform)} · {styleLabel(row.style)} ·{' '}
                      {formatRecordTime(row.createdAt)}
                    </p>
                    {!expanded && preview ? (
                      <p className="mt-2 line-clamp-2 text-xs embed-text-muted">{preview}</p>
                    ) : null}
                  </div>
                  {expanded ? (
                    <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 embed-text-muted" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 embed-text-muted" />
                  )}
                </button>
                {expanded ? (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void onCopy(row.fullMarkdown)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制全文
                      </button>
                    </div>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-relaxed embed-text-primary">
                      {row.fullMarkdown || '（无正文）'}
                    </pre>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

import { Loader2, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import { isXhsCommercialBound } from '../../lib/xhsCommercialBinding'
import { toUserFacingError } from '../../lib/userFacingError'
import { XHS_CLUE_CONVERT_STATES, type XhsClueConvertState, type XhsClueRow } from '../../lib/xhsCommercialTypes'
import { fetchXhsClues, postXhsClueAiSuggest, postXhsClueCallback } from '../../services/xhsCommercialApi'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function XhsZhongxiaocaoLeadsPanel() {
  const [items, setItems] = useState<XhsClueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'new' | 'done'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [callbackBusy, setCallbackBusy] = useState(false)
  const [callbackState, setCallbackState] = useState<XhsClueConvertState>('CLUE_CONFIRM')

  const selected = useMemo(
    () => items.find((i) => i.clueId === selectedId) ?? null,
    [items, selectedId],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchXhsClues()
      if (r.ok) {
        setItems(r.list)
        setDemoMode(Boolean(r.demoMode))
      } else setError(r.message)
    } catch (e) {
      setError(toUserFacingError(e, '同步种小草线索'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    if (filter === 'new') return items.filter((i) => i.convertState === 'NEW' || !i.callbackDone)
    if (filter === 'done') return items.filter((i) => i.callbackDone || i.convertState !== 'NEW')
    return items
  }, [items, filter])

  const bound = isXhsCommercialBound()

  return (
    <>
      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          尚未绑定小红书商业化账号。
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            前往商业化后台
          </Link>
          配置聚光/种小草授权（同一套 Token）。
        </div>
      ) : demoMode ? (
        <div className="erp-panel mb-6 border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
          演示模式：配置 XHS_COMMERCIAL_API_BASE_URL 后拉取真实线索。
        </div>
      ) : null}

      {error ? <p className="mb-4 text-sm text-amber-700">{error}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          同步线索
        </button>
        {(['all', 'new', 'done'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium',
              filter === f ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {f === 'all' ? '全部' : f === 'new' ? '待跟进' : '已回传'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="erp-panel divide-y divide-slate-100 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">{loading ? '加载中…' : '暂无线索'}</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.clueId}
                type="button"
                onClick={() => setSelectedId(row.clueId)}
                className={cn(
                  'flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-slate-50',
                  selectedId === row.clueId && 'bg-rose-50/50',
                )}
              >
                <span className="font-medium text-slate-900">{row.name}</span>
                <span className="text-xs text-slate-500">
                  {row.phone} · {row.convertStateLabel} · {formatTime(row.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div className="erp-panel flex flex-col gap-3 p-4">
            <p className="font-semibold text-slate-900">{selected.name}</p>
            <p className="text-sm text-slate-600">{selected.phone}</p>
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              placeholder="跟进话术"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={suggestBusy}
                onClick={async () => {
                  setSuggestBusy(true)
                  const r = await postXhsClueAiSuggest(selected)
                  if (r.ok) setReplyDraft(r.suggestion)
                  setSuggestBusy(false)
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white"
              >
                {suggestBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                AI 话术
              </button>
            </div>
            <select
              value={callbackState}
              onChange={(e) => setCallbackState(e.target.value as XhsClueConvertState)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {XHS_CLUE_CONVERT_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={callbackBusy}
              onClick={async () => {
                setCallbackBusy(true)
                const r = await postXhsClueCallback({
                  clueId: selected.clueId,
                  convertState: callbackState,
                  remark: replyDraft,
                })
                if (r.ok) void reload()
                else setError(r.message)
                setCallbackBusy(false)
              }}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white"
            >
              {callbackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              回传状态
            </button>
            <p className="flex items-center gap-1 text-[10px] text-slate-400">
              <MessageSquare className="h-3 w-3" />
              种小草线索回传
            </p>
          </div>
        ) : (
          <div className="erp-panel flex items-center justify-center p-8 text-sm text-slate-400">
            选择一条线索
          </div>
        )}
      </div>
    </>
  )
}

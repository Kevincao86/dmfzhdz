import { Loader2, MessageSquare, Send, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../cn'
import { clueStatsByPromotion } from '../../lib/localPromotionAnalytics'
import { CLUE_CONVERT_STATES, type ClueConvertState, type LocalClueRow } from '../../lib/localPromotionTypes'
import { postClueAiSuggest, postClueCallback } from '../../services/localPromotionApi'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

type Props = {
  clues: LocalClueRow[]
  loading: boolean
  onReload: () => Promise<void>
}

export default function LocalPromotionLeadsAnalysisPanel({ clues, loading, onReload }: Props) {
  const [filter, setFilter] = useState<'all' | 'new' | 'done'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [callbackBusy, setCallbackBusy] = useState(false)
  const [callbackState, setCallbackState] = useState<ClueConvertState>('CLUE_CONFIRM')

  const selected = useMemo(
    () => clues.find((i) => i.clueId === selectedId) ?? null,
    [clues, selectedId],
  )

  const filtered = useMemo(() => {
    if (filter === 'new') return clues.filter((i) => i.convertState === 'NEW' || !i.callbackDone)
    if (filter === 'done') return clues.filter((i) => i.callbackDone || i.convertState !== 'NEW')
    return clues
  }, [clues, filter])

  const byPromotion = useMemo(() => clueStatsByPromotion(clues), [clues])

  const runAiSuggest = async () => {
    if (!selected) return
    setSuggestBusy(true)
    try {
      const r = await postClueAiSuggest({
        name: selected.name,
        phone: selected.phone,
        promotionName: selected.promotionName,
        convertState: selected.convertState,
        convertStateLabel: selected.convertStateLabel,
      })
      if (r.ok) setReplyDraft(r.suggestion)
    } finally {
      setSuggestBusy(false)
    }
  }

  const submitCallback = async () => {
    if (!selected) return
    setCallbackBusy(true)
    try {
      const r = await postClueCallback({
        clueId: selected.clueId,
        convertState: callbackState,
      })
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await onReload()
    } finally {
      setCallbackBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">线索分析</h3>
        <p className="mt-1 text-sm text-slate-500">
          按广告计划归因线索量，支持 AI 跟进话术与状态回传至巨量。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="erp-panel p-4">
          <p className="text-xs text-slate-500">线索总量</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{clues.length}</p>
        </div>
        <div className="erp-panel p-4">
          <p className="text-xs text-slate-500">待跟进</p>
          <p className="mt-1 text-xl font-semibold text-orange-600">
            {clues.filter((c) => c.convertState === 'NEW' || !c.callbackDone).length}
          </p>
        </div>
        <div className="erp-panel p-4">
          <p className="text-xs text-slate-500">已回传</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">
            {clues.filter((c) => c.callbackDone || c.convertState !== 'NEW').length}
          </p>
        </div>
      </div>

      {byPromotion.length > 0 ? (
        <div className="erp-panel overflow-hidden">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
            按广告计划线索分布
          </p>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">来源广告</th>
                <th className="px-4 py-2">线索数</th>
                <th className="px-4 py-2">待跟进</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byPromotion.map((row) => (
                <tr key={row.promotionName}>
                  <td className="px-4 py-2 text-slate-800">{row.promotionName}</td>
                  <td className="px-4 py-2">{row.total}</td>
                  <td className="px-4 py-2 text-orange-700">{row.newCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', '全部'],
            ['new', '待跟进'],
            ['done', '已回传'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              filter === k ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="erp-panel max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                {loading ? '加载中…' : '暂无线索'}
              </p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.clueId}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.clueId)
                    setReplyDraft('')
                  }}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-slate-50',
                    selectedId === row.clueId && 'bg-cyan-50/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.phone}</p>
                    </div>
                    <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
                      {row.convertStateLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {row.promotionName ?? '—'} · {formatTime(row.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="erp-panel space-y-4 p-5">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">{selected.name}</h4>
                <p className="text-sm text-slate-500">{selected.phone}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {selected.city ?? '—'} · {selected.clueSource ?? '—'} · {selected.promotionName ?? '—'}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">回传状态</label>
                <select
                  value={callbackState}
                  onChange={(e) => setCallbackState(e.target.value as ClueConvertState)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {CLUE_CONVERT_STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">跟进话术</label>
                  <button
                    type="button"
                    onClick={() => void runAiSuggest()}
                    disabled={suggestBusy}
                    className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"
                  >
                    {suggestBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI 生成
                  </button>
                </div>
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="AI 生成或自行编写跟进话术"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={callbackBusy}
                  onClick={() => void submitCallback()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  {callbackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  回传至巨量
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (replyDraft.trim()) void navigator.clipboard.writeText(replyDraft)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <MessageSquare className="h-4 w-4" />
                  复制话术
                </button>
              </div>
            </div>
          ) : (
            <div className="erp-panel flex min-h-[14rem] items-center justify-center p-8 text-sm text-slate-500">
              请选择线索查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

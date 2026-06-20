import { Loader2, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import { isLocalPromotionBound } from '../lib/localPromotionBinding'
import { toUserFacingError } from '../lib/userFacingError'
import { CLUE_CONVERT_STATES, type ClueConvertState, type LocalClueRow } from '../lib/localPromotionTypes'
import ModulePage from './ModulePage'
import {
  fetchLocalClues,
  postClueAiSuggest,
  postClueCallback,
} from '../services/localPromotionApi'
import XhsZhongxiaocaoLeadsPanel from './leads/XhsZhongxiaocaoLeadsPanel'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

type LeadChannel = 'local_promotion' | 'zhongxiaocao'

export default function LocalPromotionLeadsPage() {
  const [channel, setChannel] = useState<LeadChannel>('local_promotion')
  const [items, setItems] = useState<LocalClueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'new' | 'done'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [callbackBusy, setCallbackBusy] = useState(false)
  const [callbackState, setCallbackState] = useState<ClueConvertState>('CLUE_CONFIRM')

  const selected = useMemo(
    () => items.find((i) => i.clueId === selectedId) ?? null,
    [items, selectedId],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchLocalClues()
      if (r.ok) {
        setItems(r.list)
        setDemoMode(Boolean(r.demoMode))
        setError(null)
      } else {
        setError(r.message)
      }
    } catch (e) {
      setError(toUserFacingError(e, '拉取线索'))
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
      else setError(r.message)
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
      window.alert('已向巨量回传线索状态' + (replyDraft.trim() ? '；跟进话术已生成，请自行发送给顾客。' : ''))
      await reload()
    } finally {
      setCallbackBusy(false)
    }
  }

  const bound = isLocalPromotionBound()

  return (
    <ModulePage
      title="线索"
      subtitle="巨量本地推（抖音）与种小草（小红书）分平台回收线索；投流页「线索分析」可查看按广告归因统计"
      actions={
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          同步线索
        </button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChannel('local_promotion')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'local_promotion' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          巨量本地推 <span className="text-[10px] opacity-80">(抖音)</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('zhongxiaocao')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'zhongxiaocao' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          种小草 <span className="text-[10px] opacity-80">(小红书)</span>
        </button>
      </div>

      {channel === 'zhongxiaocao' ? (
        <XhsZhongxiaocaoLeadsPanel />
      ) : (
        <>
      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          尚未绑定本地推。
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            系统设置 · 商业化后台
          </Link>
          中完成授权后可拉取真实线索。
        </div>
      ) : demoMode ? (
        <div className="erp-panel mb-6 border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
          演示模式：以下为样例线索。
        </div>
      ) : null}

      {error ? (
        <div className="erp-panel mb-4 border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
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
          <div className="erp-panel max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
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
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                        row.convertState === 'NEW'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {row.convertStateLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{formatTime(row.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="erp-panel space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
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
                <p className="mt-1 text-[10px] text-slate-400">
                  回传后巨量本地推将更新该线索的跟进阶段。
                </p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">跟进话术（发送给顾客）</label>
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
                    AI 生成话术
                  </button>
                </div>
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="点击「AI 生成话术」或自行编写微信/电话跟进内容"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={callbackBusy}
                  onClick={() => void submitCallback()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  {callbackBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  回传状态至巨量
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
            <div className="erp-panel flex min-h-[16rem] items-center justify-center p-8 text-sm text-slate-500">
              请选择左侧线索
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 erp-panel border-dashed p-4 text-xs text-slate-500">
        <p className="mb-2 font-medium text-slate-700">AI 智能体可用能力（线索）</p>
        <ul className="list-inside list-disc space-y-1">
          <li>按线索来源广告、城市、状态生成个性化跟进话术</li>
          <li>批量筛选「待跟进」线索并建议优先联系顺序</li>
          <li>识别无效线索标签并辅助填写 INVALID_EVENT 回传原因</li>
          <li>统计各广告计划线索转化率，联动投流页优化预算</li>
        </ul>
      </div>
        </>
      )}
    </ModulePage>
  )
}

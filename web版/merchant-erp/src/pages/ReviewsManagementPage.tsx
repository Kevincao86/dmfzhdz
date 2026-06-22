import {
  CheckCircle2,
  CircleDot,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import StorePlatformSwitcher from '../components/store/StorePlatformSwitcher'
import { DouyinStorePickerTrigger } from '../components/store/DouyinStorePickerModal'
import { DouyinProductPickerTrigger } from '../components/store/DouyinProductPickerModal'
import {
  fetchAllDouyinOnlineProductIds,
  fetchAllDouyinPoiIds,
  douyinPoiIdsMatch,
} from '../lib/douyinReviewSyncHelpers'
import type {
  ReviewKind,
  ReviewListItem,
  ReviewListStats,
  ReviewReplyStatusFilter,
  ReviewSentimentFilter,
  ReviewsApiPlatform,
} from '../services/reviewsMerchantApi'
import {
  postReviewAiSuggest,
  postReviewReply,
  postReviewsSync,
  reviewsTabToApiPlatform,
} from '../services/reviewsMerchantApi'
import type { StorePlatformTab } from '../services/merchantStoresApi'

const AI_LS_KEY = 'meoo_reviews_ai_reply_enabled'
const REVIEWS_CACHE_PREFIX = 'meoo_reviews_cache_v3'

function reviewsCacheKey(platform: ReviewsApiPlatform, kind: ReviewKind): string {
  return `${REVIEWS_CACHE_PREFIX}:${platform}:${kind}`
}

function readReviewsCache(
  platform: ReviewsApiPlatform,
  kind: ReviewKind,
): { items: ReviewListItem[]; syncedAt: string } | null {
  try {
    const raw = window.sessionStorage.getItem(reviewsCacheKey(platform, kind))
    if (!raw) return null
    const j = JSON.parse(raw) as { items?: ReviewListItem[]; syncedAt?: string }
    if (!Array.isArray(j.items)) return null
    return { items: j.items, syncedAt: j.syncedAt ?? new Date().toISOString() }
  } catch {
    return null
  }
}

function writeReviewsCache(
  platform: ReviewsApiPlatform,
  kind: ReviewKind,
  items: ReviewListItem[],
  syncedAt: string,
) {
  try {
    window.sessionStorage.setItem(
      reviewsCacheKey(platform, kind),
      JSON.stringify({ items, syncedAt }),
    )
  } catch {
    /* ignore */
  }
}

function readAiToggle(): boolean {
  try {
    return window.localStorage.getItem(AI_LS_KEY) === '1'
  } catch {
    return false
  }
}

function writeAiToggle(on: boolean) {
  try {
    window.localStorage.setItem(AI_LS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function sentimentLabel(s: ReviewListItem['sentiment']): string {
  if (s === 'good') return '好评'
  if (s === 'neutral') return '中评'
  return '差评'
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StarRow({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} 星`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < n ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-200',
          )}
        />
      ))}
    </span>
  )
}

export default function ReviewsManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const reviewKind: ReviewKind = searchParams.get('kind') === 'product' ? 'product' : 'store'
  const setReviewKind = (kind: ReviewKind) => {
    setSearchParams(kind === 'product' ? { kind: 'product' } : {}, { replace: true })
  }
  const [tab, setTab] = useState<StorePlatformTab>('douyin')
  const [sentiment, setSentiment] = useState<ReviewSentimentFilter>('all')
  const [replyStatus, setReplyStatus] = useState<ReviewReplyStatusFilter>('all')
  const [listStats, setListStats] = useState<ReviewListStats | null>(null)
  const [aiReplyOn, setAiReplyOn] = useState(() => readAiToggle())
  const [sourceItems, setSourceItems] = useState<ReviewListItem[]>([])
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [suggestingId, setSuggestingId] = useState<string | null>(null)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [autoReplyBusy, setAutoReplyBusy] = useState(false)
  const [processingAutoId, setProcessingAutoId] = useState<string | null>(null)
  const [filterPoiId, setFilterPoiId] = useState<string | null>(null)
  const [filterPoiName, setFilterPoiName] = useState('')
  const [filterProductId, setFilterProductId] = useState<string | null>(null)
  const [filterProductName, setFilterProductName] = useState('')

  const apiPlatform = useMemo(() => reviewsTabToApiPlatform(tab), [tab])
  const reviewOpts = useMemo(
    () => ({
      kind: reviewKind,
      poiId: reviewKind === 'store' && filterPoiId ? filterPoiId : undefined,
      productId: reviewKind === 'product' && filterProductId ? filterProductId : undefined,
    }),
    [reviewKind, filterPoiId, filterProductId],
  )

  useEffect(() => {
    setFilterPoiId(null)
    setFilterPoiName('')
    setFilterProductId(null)
    setFilterProductName('')
    setSourceItems([])
    setSyncedAt(null)
  }, [reviewKind, tab])

  const scopedItems = useMemo(() => {
    let rows = sourceItems
    if (reviewKind === 'store' && filterPoiId) {
      rows = rows.filter((x) => douyinPoiIdsMatch(x.poiId, filterPoiId))
    }
    if (reviewKind === 'product' && filterProductId) {
      rows = rows.filter((x) => String(x.productId ?? '') === filterProductId)
    }
    return rows
  }, [sourceItems, reviewKind, filterPoiId, filterProductId])

  const items = useMemo(() => {
    let rows = scopedItems
    if (sentiment === 'good') rows = rows.filter((r) => r.sentiment === 'good')
    else if (sentiment === 'neutral') rows = rows.filter((r) => r.sentiment === 'neutral')
    else if (sentiment === 'bad') rows = rows.filter((r) => r.sentiment === 'bad')
    if (replyStatus === 'replied') rows = rows.filter((r) => r.replied)
    else if (replyStatus === 'unreplied') rows = rows.filter((r) => !r.replied)
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [scopedItems, sentiment, replyStatus])

  useEffect(() => {
    setListStats({
      total: scopedItems.length,
      replied: scopedItems.filter((x) => x.replied).length,
      unreplied: scopedItems.filter((x) => !x.replied).length,
    })
  }, [scopedItems])

  const runAutoReplies = useCallback(async (platform: ReviewsApiPlatform, candidates: ReviewListItem[]) => {
    const pending = candidates.filter((r) => !r.replied)
    if (pending.length === 0) return
    setAutoReplyBusy(true)
    setError(null)
    try {
      for (const row of pending) {
        setProcessingAutoId(row.id)
        const sug = await postReviewAiSuggest(platform, row.id)
        if (!sug.ok) {
          setError(sug.message)
          break
        }
        const rep = await postReviewReply(platform, row.id, sug.suggestion)
        if (!rep.ok) {
          setError(rep.message)
          break
        }
        setSourceItems((curr) => {
          const next = curr.map((x) => (x.id === row.id ? rep.item : x))
          if (platform) {
            writeReviewsCache(platform, reviewKind, next, syncedAt ?? new Date().toISOString())
          }
          return next
        })
      }
    } finally {
      setProcessingAutoId(null)
      setAutoReplyBusy(false)
    }
  }, [reviewKind, syncedAt])

  const load = useCallback(async () => {
    if (!apiPlatform) {
      setSourceItems([])
      setSyncedAt(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const cached = readReviewsCache(apiPlatform, reviewKind)
    if (cached) {
      setSourceItems(cached.items)
      setSyncedAt(cached.syncedAt)
    } else {
      setSourceItems([])
      setSyncedAt(null)
    }
    setLoading(false)

    if (aiReplyOn && cached && cached.items.length > 0) {
      const pending = cached.items.filter((r) => !r.replied)
      if (pending.length > 0) {
        await runAutoReplies(apiPlatform, pending)
      }
    }
  }, [apiPlatform, reviewKind, aiReplyOn, runAutoReplies])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setSelected(new Set())
  }, [tab, sentiment, replyStatus])

  const toggleAi = (on: boolean) => {
    setAiReplyOn(on)
    writeAiToggle(on)
  }

  const onSync = async () => {
    if (!apiPlatform) return
    setSyncing(true)
    setError(null)
    let syncPayload: Parameters<typeof postReviewsSync>[1] = { ...reviewOpts }
    if (apiPlatform === 'douyin') {
      if (reviewKind === 'store') {
        if (filterPoiId) {
          syncPayload = { kind: 'store', poiId: filterPoiId }
        } else {
          const r = await fetchAllDouyinPoiIds()
          if (!r.ok) {
            setSyncing(false)
            setError(r.message)
            return
          }
          if (r.ids.length === 0) {
            setSyncing(false)
            setError('未找到已绑定门店，请先在「店铺信息」同步抖音门店。')
            return
          }
          syncPayload = { kind: 'store', poiIds: r.ids }
        }
      } else if (filterProductId) {
        syncPayload = { kind: 'product', productId: filterProductId }
      } else {
        const r = await fetchAllDouyinOnlineProductIds()
        if (!r.ok) {
          setSyncing(false)
          setError(r.message)
          return
        }
        if (r.ids.length === 0) {
          setSyncing(false)
          setError('未找到在线商品，请先在「商品」页同步抖音团购商品。')
          return
        }
        syncPayload = { kind: 'product', productIds: r.ids }
      }
    }
    const res = await postReviewsSync(apiPlatform, syncPayload)
    setSyncing(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    if (res.items?.length) {
      const syncedAtIso = res.syncedAt ?? new Date().toISOString()
      setSourceItems(res.items)
      writeReviewsCache(apiPlatform, reviewKind, res.items, syncedAtIso)
      setSyncedAt(syncedAtIso)
      if (res.message) setError(null)
      return
    }
    await load()
  }

  const setDraft = (id: string, text: string) => {
    setDrafts((d) => ({ ...d, [id]: text }))
  }

  const onSuggest = async (row: ReviewListItem) => {
    if (!apiPlatform) return
    setSuggestingId(row.id)
    setError(null)
    const res = await postReviewAiSuggest(apiPlatform, row.id)
    setSuggestingId(null)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setDraft(row.id, res.suggestion)
  }

  const onReply = async (row: ReviewListItem) => {
    if (!apiPlatform) return
    const text = (drafts[row.id] ?? '').trim()
    if (!text) {
      setError('请先填写回复内容')
      return
    }
    setReplyingId(row.id)
    setError(null)
    const res = await postReviewReply(apiPlatform, row.id, text)
    setReplyingId(null)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setDrafts((d) => {
      const next = { ...d }
      delete next[row.id]
      return next
    })
    setSelected((s) => {
      const n = new Set(s)
      n.delete(row.id)
      return n
    })
    if (res.item) {
      setSourceItems((curr) => {
        const next = curr.map((x) => (x.id === row.id ? res.item! : x))
        if (apiPlatform) {
          writeReviewsCache(apiPlatform, reviewKind, next, syncedAt ?? new Date().toISOString())
        }
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectedList = items.filter((r) => !r.replied && selected.has(r.id))

  const openBatch = () => {
    if (selectedList.length === 0) {
      setError('请先勾选需要回复的评论')
      return
    }
    setBatchText('')
    setBatchOpen(true)
  }

  const confirmBatch = async () => {
    if (!apiPlatform) return
    const text = batchText.trim()
    if (!text) {
      setError('请填写批量回复话术')
      return
    }
    setBatchBusy(true)
    setError(null)
    for (const row of selectedList) {
      const res = await postReviewReply(apiPlatform, row.id, text)
      if (!res.ok) {
        setError(res.message)
        setBatchBusy(false)
        return
      }
      if (res.item) {
        setSourceItems((curr) => curr.map((x) => (x.id === row.id ? res.item! : x)))
      }
    }
    setBatchBusy(false)
    setBatchOpen(false)
    setSelected(new Set())
    setSourceItems((curr) => {
      if (apiPlatform) {
        writeReviewsCache(apiPlatform, reviewKind, curr, syncedAt ?? new Date().toISOString())
      }
      return curr
    })
  }

  const sentimentTabs: { id: ReviewSentimentFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'good', label: '好评' },
    { id: 'neutral', label: '中评' },
    { id: 'bad', label: '差评' },
  ]

  const replyTabs: { id: ReviewReplyStatusFilter; label: string; icon: typeof CircleDot }[] = [
    { id: 'all', label: '全部', icon: CircleDot },
    { id: 'unreplied', label: '未回复', icon: MessageSquareText },
    { id: 'replied', label: '已回复', icon: CheckCircle2 },
  ]

  return (
    <div className="relative min-h-[calc(100vh-6rem)] pb-12">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-90"
        aria-hidden
        style={{
          background:
            'radial-gradient(900px 420px at 10% -10%, rgb(219 234 254), transparent), radial-gradient(700px 380px at 100% 0%, rgb(237 233 254), transparent), rgb(248 250 252)',
        }}
      />

      <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
        <header className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40">
          <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-6">
            <div className="flex gap-4">
              <div className="hidden h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 text-white shadow-md shadow-blue-600/25 sm:flex sm:items-center sm:justify-center">
                <MessageSquareText className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="erp-page-title">评价管理</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                  抖音评价查询须指定门店或商品维度。可在下方切换
                  {reviewKind === 'store' ? '门店评价' : '商品评价'}
                  并按条件筛选同步，支持 AI 统一回复管理。
                  <span className="font-medium text-slate-800">关闭</span>
                  「24&nbsp;小时智能自动回复」时可自行打字回复，也可用「智能生成话术」帮您起草。
                  <span className="font-medium text-slate-800">开启</span>
                  后，在同步或载入列表时会按当前所选类型与状态下、尚未回复的留言逐条尝试自动回复（请先在系统设置中完成智能相关配置）。
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={aiReplyOn}
              title={aiReplyOn ? '自动回复开启时请先关闭，再使用批量人工回复' : undefined}
              onClick={openBatch}
              className="shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              批量回复
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setReviewKind('store')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium',
              reviewKind === 'store' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            门店评价
          </button>
          <button
            type="button"
            onClick={() => setReviewKind('product')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium',
              reviewKind === 'product' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            商品评价
          </button>
        </div>

        <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <StorePlatformSwitcher value={tab} onChange={setTab} />
          {tab === 'douyin' && reviewKind === 'store' ? (
            <div className="mt-4">
              <DouyinStorePickerTrigger
                label="筛选门店"
                value={filterPoiId}
                valueLabel={filterPoiId ? filterPoiName || filterPoiId : '全部门店（同步全部绑定门店）'}
                placeholder="全部门店（同步全部绑定门店）"
                showAllOption
                onChange={(id, row) => {
                  setFilterPoiId(id)
                  setFilterPoiName(row?.name ?? '')
                }}
              />
            </div>
          ) : null}
          {tab === 'douyin' && reviewKind === 'product' ? (
            <div className="mt-4">
              <DouyinProductPickerTrigger
                label="筛选商品"
                value={filterProductId}
                valueLabel={filterProductId ? filterProductName || filterProductId : '全部在线商品'}
                placeholder="全部在线商品"
                showAllOption
                onChange={(id, row) => {
                  setFilterProductId(id)
                  setFilterProductName(row?.name ?? '')
                }}
              />
            </div>
          ) : null}
        </section>

        {!apiPlatform ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 py-16 text-center">
            <p className="text-sm font-medium text-slate-600">该平台评价接入敬请期待</p>
            <p className="mt-1 text-xs text-slate-400">切换至抖音来客、美团或小红书查看数据</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-8">
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      评价类型
                    </p>
                    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1">
                      {sentimentTabs.map((t) => {
                        const on = sentiment === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSentiment(t.id)}
                            className={cn(
                              'rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
                              on
                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                                : 'text-slate-600 hover:text-slate-900',
                            )}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      回复状态
                    </p>
                    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1">
                      {replyTabs.map((t) => {
                        const on = replyStatus === t.id
                        const Icon = t.icon
                        const count =
                          t.id === 'all'
                            ? listStats?.total
                            : t.id === 'replied'
                              ? listStats?.replied
                              : listStats?.unreplied
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setReplyStatus(t.id)}
                            className={cn(
                              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
                              on
                                ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-slate-200/80'
                                : 'text-slate-600 hover:text-slate-900',
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0 opacity-80" />
                            {t.label}
                            {typeof count === 'number' && (
                              <span
                                className={cn(
                                  'min-w-[1.25rem] rounded-md px-1.5 py-0.5 text-center text-xs tabular-nums',
                                  on ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-600',
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={aiReplyOn}
                      onChange={(e) => toggleAi(e.target.checked)}
                    />
                    <span className="text-sm font-medium leading-snug text-slate-800">
                      24 小时智能自动回复
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        同步后，对仍未回复的顾客评价逐条尝试自动回复
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={syncing || loading || autoReplyBusy}
                    onClick={() => void onSync()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
                    同步评价
                  </button>
                </div>
              </div>
            </section>

            {syncedAt && (
              <p className="px-1 text-xs text-slate-500">
                列表更新时间：<span className="tabular-nums text-slate-600">{formatTime(syncedAt)}</span>
              </p>
            )}

            {autoReplyBusy && (
              <div className="flex items-center gap-3 rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-sm text-violet-950 shadow-sm">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-600" />
                <span>正在为未回复评价自动生成并提交回复…</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 py-20 shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-slate-600">加载评价中…</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/90 bg-white/80 py-20 text-center shadow-sm">
                <div className="rounded-2xl bg-slate-100 p-4 text-slate-400">
                  <MessageSquareText className="h-10 w-10" strokeWidth={1.25} />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-700">暂无符合条件的评价</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  没有数据时，可先试试「同步评价」；仍为空则可能是当前门店近期暂无顾客评价，或需在抖音来客侧确认账号与门店已正确关联。
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:border-blue-200/70 hover:shadow-md"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500 opacity-0 transition group-hover:opacity-100" />
                    <div className="relative flex flex-wrap items-start gap-3 p-4 sm:gap-4 sm:p-5">
                      {!row.replied && (
                        <label className="mt-0.5 flex cursor-pointer rounded-lg border border-transparent p-1 hover:border-slate-200 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            aria-label="选中以批量回复"
                          />
                        </label>
                      )}
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 gap-y-2">
                          <span
                            className={cn(
                              'rounded-lg px-2.5 py-1 text-xs font-semibold',
                              row.sentiment === 'good' && 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
                              row.sentiment === 'neutral' &&
                                'bg-amber-50 text-amber-900 ring-1 ring-amber-100',
                              row.sentiment === 'bad' && 'bg-rose-50 text-rose-800 ring-1 ring-rose-100',
                            )}
                          >
                            {sentimentLabel(row.sentiment)}
                          </span>
                          {row.replied ? (
                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80">
                              已回复
                            </span>
                          ) : (
                            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-100">
                              待回复
                            </span>
                          )}
                          <span className="text-sm font-medium text-slate-800">{row.userName}</span>
                          <StarRow n={row.ratingStars} />
                          <span className="text-xs tabular-nums text-slate-400 sm:text-sm">
                            {formatTime(row.createdAt)}
                          </span>
                        </div>
                        <p className="text-[15px] leading-relaxed text-slate-800">{row.content}</p>
                        {row.replied && row.replyText && (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3 text-sm leading-relaxed text-slate-700">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                              门店回复
                            </span>
                            {row.replyText}
                          </div>
                        )}
                        {!row.replied && aiReplyOn && (
                          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white px-4 py-3 text-sm text-violet-950">
                            <p className="leading-relaxed text-violet-900/95">
                              已开启自动回复：同步或载入列表后，系统将结合本条内容由智能辅助生成文案并尝试提交回复。
                            </p>
                            {processingAutoId === row.id && (
                              <p className="mt-2 flex items-center gap-2 text-xs font-medium text-violet-800">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                正在为本条生成并提交…
                              </p>
                            )}
                          </div>
                        )}

                        {!row.replied && !aiReplyOn && (
                          <div className="space-y-2 border-t border-slate-100 pt-3">
                            <textarea
                              value={drafts[row.id] ?? ''}
                              onChange={(e) => setDraft(row.id, e.target.value)}
                              placeholder="撰写回复；可先点「智能生成话术」预填草稿，再修改后发送"
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            />
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={suggestingId === row.id || autoReplyBusy}
                                onClick={() => void onSuggest(row)}
                                title="根据本条评价智能起草回复草稿，不会自动发出"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:opacity-50"
                              >
                                <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
                                {suggestingId === row.id ? '生成中…' : '智能生成话术'}
                              </button>
                              <button
                                type="button"
                                disabled={replyingId === row.id || autoReplyBusy}
                                onClick={() => void onReply(row)}
                                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
                              >
                                {replyingId === row.id ? '发送中…' : '发送回复'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {batchOpen && apiPlatform && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl shadow-slate-900/20"
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-reply-title"
          >
            <h2 id="batch-reply-title" className="text-lg font-bold text-slate-900">
              批量回复
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              将使用同一段话术回复已勾选的 <span className="font-semibold text-slate-800">{selectedList.length}</span>{' '}
              条未回复评价。
            </p>
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              placeholder="请输入要批量发送的回复正文"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => setBatchOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => void confirmBatch()}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
              >
                {batchBusy ? '提交中…' : '确认发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

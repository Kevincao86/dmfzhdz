import { Check, ChevronLeft, Copy, Loader2, Sparkles, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../cn'
import { appendKolBriefRecord, type KolBriefRecord } from '../../lib/kolBriefStorage'
import {
  fetchIndustryProductTagsAi,
  generateThreeKolBriefs,
  type BriefProductPick,
} from '../../services/recruitmentBriefAi'
import { loadProductEditLibraryDraftBriefPicks } from '../../lib/productEditLibrary'
import { getDouyinGoodsProductOnlineQuery } from '../../services/douyinProductApi'

function briefProductSourceLabel(source?: BriefProductPick['source']): string {
  if (source === 'douyin_online') return '抖音线上'
  if (source === 'erp_draftbox') return '草稿箱'
  return '—'
}

function briefProductSourceBadgeClass(source?: BriefProductPick['source']): string {
  if (source === 'douyin_online')
    return 'rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900'
  return 'rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900'
}

const PLATFORMS: { id: string; label: string }[] = [
  { id: 'douyin_life', label: '抖音来客' },
  { id: 'meituan', label: '美团点评' },
  { id: 'xhs', label: '小红书' },
  { id: 'jd_local', label: '京东本地生活' },
]

type Step = 1 | 2 | 3

type Props = {
  open: boolean
  onClose: () => void
  industry: string
  onSaved?: () => void
}

export default function RecruitmentBriefWizard({ open, onClose, industry, onSaved }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [platformId, setPlatformId] = useState('')
  const [synced, setSynced] = useState<BriefProductPick[]>([])
  const [syncOpen, setSyncOpen] = useState(false)
  const [pickIds, setPickIds] = useState<string[]>([])
  const [mainId, setMainId] = useState('')
  const [secondaryId, setSecondaryId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [tagsBusy, setTagsBusy] = useState(false)
  const [briefs, setBriefs] = useState<[string, string, string] | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [copyTip, setCopyTip] = useState<string | null>(null)
  const [productSearchKw, setProductSearchKw] = useState('')
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncErr, setSyncErr] = useState<string | null>(null)
  const [catalogHits, setCatalogHits] = useState<BriefProductPick[]>([])

  const reset = useCallback(() => {
    setStep(1)
    setPlatformId('')
    setSynced([])
    setSyncOpen(false)
    setPickIds([])
    setMainId('')
    setSecondaryId('')
    setTags([])
    setTagOptions([])
    setBriefs(null)
    setGenBusy(false)
    setTagsBusy(false)
    setCopyTip(null)
    setProductSearchKw('')
    setSyncBusy(false)
    setSyncErr(null)
    setCatalogHits([])
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (step !== 2) return
    if (!mainId && synced[0]) setMainId(synced[0].id)
  }, [step, synced, mainId])

  if (!open) return null

  const platformLabel = PLATFORMS.find((p) => p.id === platformId)?.label ?? '选定平台'
  const effectiveSynced = synced
  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const runSmartTags = async () => {
    setTagsBusy(true)
    try {
      const next = await fetchIndustryProductTagsAi(industry || '餐饮')
      setTagOptions(next)
      setTags((prev) => {
        const keep = prev.filter((x) => next.includes(x))
        const add = next.filter((x) => !keep.includes(x)).slice(0, 4)
        return [...keep, ...add].slice(0, 8)
      })
    } finally {
      setTagsBusy(false)
    }
  }

  const runGenerate = async () => {
    const main = effectiveSynced.find((p) => p.id === mainId)
    if (!main || effectiveSynced.length === 0) return
    const sec = secondaryId ? effectiveSynced.find((p) => p.id === secondaryId) : undefined
    setGenBusy(true)
    try {
      const out = await generateThreeKolBriefs({
        platformLabel,
        industry: industry || '餐饮',
        main,
        secondary: sec && sec.id !== main.id ? sec : null,
        tags: tags.length ? tags : tagOptions.slice(0, 4),
      })
      setBriefs(out)
      setStep(3)
    } finally {
      setGenBusy(false)
    }
  }

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyTip(`已复制：${label}`)
      window.setTimeout(() => setCopyTip(null), 2000)
    } catch {
      setCopyTip('复制失败，请手动选择文本')
    }
  }

  const finishSaveRecord = () => {
    if (!briefs || !mainId) return
    const main = effectiveSynced.find((p) => p.id === mainId)
    if (!main) return
    const sec = secondaryId ? effectiveSynced.find((p) => p.id === secondaryId) : undefined
    const row: KolBriefRecord = {
      id: `br-${Date.now()}`,
      createdAt: new Date().toISOString(),
      platform: platformLabel,
      mainProductName: main.name,
      secondaryProductName: sec && sec.id !== main.id ? sec.name : undefined,
      tags: [...tags],
      previews: briefs,
    }
    appendKolBriefRecord(row)
    onSaved?.()
    onClose()
    reset()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-lg font-semibold">AI达人Brief智能生成</span>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => {
              onClose()
              reset()
            }}
            className="rounded-lg p-1 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    step === n ? 'bg-blue-600 text-white' : step > n ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {step > n ? <Check className="h-4 w-4" /> : n}
                </div>
                <span className={cn('hidden sm:inline', step === n ? 'font-medium text-blue-700' : 'text-gray-500')}>
                  {n === 1 ? '选择平台' : n === 2 ? '选择商品' : '生成结果'}
                </span>
                {n < 3 ? <div className="hidden h-px flex-1 bg-gray-200 sm:block" /> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900">选择投放平台</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatformId(p.id)}
                    className={cn(
                      'rounded-xl border-2 px-3 py-6 text-center text-sm font-medium transition-colors',
                      platformId === p.id ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-blue-900">商品库同步</p>
                    <p className="mt-1 text-xs text-blue-800/90">
                      拉取时合并：① 抖音来客线上商品（关键词仅用于此项模糊查询）；② ERP
                      商品列表中的本地草稿箱（与「创建商品」保存草稿同源，**不受关键词过滤**，与列表一致）。来客需已绑定；草稿仅在本机浏览器。每条展示来源标签。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncOpen((v) => !v)}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    同步商品
                  </button>
                </div>
                {syncOpen ? (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
                    <label className="mb-2 block text-xs font-medium text-gray-700">商品名称关键词（可选）</label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={productSearchKw}
                        onChange={(e) => setProductSearchKw(e.target.value)}
                        placeholder="可选：输入关键词后点击拉取，将额外合并抖音线上搜索结果；留空则仅展示草稿箱"
                        className="min-w-[12rem] flex-1 rounded border border-gray-200 px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={syncBusy}
                        onClick={async () => {
                          setSyncErr(null)
                          const kw = productSearchKw.trim()
                          const erpDrafts = loadProductEditLibraryDraftBriefPicks(80)
                          const mergedById = new Map<string, BriefProductPick>()
                          for (const p of erpDrafts) {
                            mergedById.set(p.id, {
                              id: p.id,
                              name: p.name,
                              priceYuan: p.priceYuan,
                              source: 'erp_draftbox',
                            })
                          }
                          setSyncBusy(true)
                          try {
                            if (kw.length >= 1) {
                              const r = await getDouyinGoodsProductOnlineQuery({ product_name: kw, count: 24 })
                              if (r.ok) {
                                for (const h of r.hits) {
                                  const id = (h.product_id && String(h.product_id).trim()) || `dy-${h.product_name}`
                                  mergedById.set(id, {
                                    id,
                                    name: h.product_name,
                                    priceYuan: Math.round(h.price_yuan ?? 0),
                                    source: 'douyin_online',
                                  })
                                }
                              } else if (erpDrafts.length === 0) {
                                setSyncErr(r.message)
                                setCatalogHits([])
                                return
                              } else {
                                setSyncErr(`${r.message}（已展示草稿箱商品，可继续勾选）`)
                              }
                            }

                            if (mergedById.size === 0) {
                              setSyncErr(
                                '暂无商品：草稿箱为空。请先在「商品创建」保存草稿，或在上方输入关键词拉取抖音线上商品。',
                              )
                              setCatalogHits([])
                              return
                            }

                            const rows = [...mergedById.values()].sort((a, b) => {
                              const rank = (s?: BriefProductPick['source']) => (s === 'erp_draftbox' ? 0 : 1)
                              return rank(a.source) - rank(b.source) || a.name.localeCompare(b.name, 'zh-CN')
                            })
                            setCatalogHits(rows)
                            setPickIds(rows.map((x) => x.id))
                          } finally {
                            setSyncBusy(false)
                          }
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {syncBusy ? '拉取中…' : '拉取商品'}
                      </button>
                    </div>
                    {syncErr ? <p className="mt-2 text-xs text-red-600">{syncErr}</p> : null}
                    <div className="mb-2 mt-3 flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        onClick={() => setPickIds(catalogHits.map((p) => p.id))}
                      >
                        全选
                      </button>
                      <button type="button" className="text-gray-600 hover:underline" onClick={() => setPickIds([])}>
                        取消全选
                      </button>
                    </div>
                    <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                      {catalogHits.map((p) => {
                        const on = pickIds.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              setPickIds((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                            }
                            className={cn(
                              'flex flex-col rounded-lg border p-3 text-left text-sm transition-colors',
                              on ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300',
                            )}
                          >
                            <span className="font-medium text-gray-900">{p.name}</span>
                            <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
                              <span className={briefProductSourceBadgeClass(p.source)}>
                                {briefProductSourceLabel(p.source)}
                              </span>
                              <span className="text-xs text-gray-500">¥{p.priceYuan}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {catalogHits.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        点击「拉取商品」：默认列出草稿箱全部（最多 80 条）；填写关键词后会合并抖音线上搜索结果，来源见标签。
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const rows = catalogHits.filter((p) => pickIds.includes(p.id))
                          if (!rows.length) {
                            setSyncErr('请至少勾选 1 个商品')
                            return
                          }
                          setSynced(rows)
                          setMainId(rows[0]!.id)
                          setSyncOpen(false)
                          setSyncErr(null)
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        确认同步
                      </button>
                    </div>
                  </div>
                ) : null}
                {effectiveSynced.length ? (
                  <p className="mt-2 text-xs text-blue-900/80">已同步 {effectiveSynced.length} 个商品</p>
                ) : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">
                  选择主推品 <span className="text-red-500">*</span>
                </p>
                {effectiveSynced.length === 0 ? (
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    请先点击「同步商品」→「拉取商品」：将列出草稿箱与（可选）抖音线上结果，再点「确认同步」。
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {effectiveSynced.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setMainId(p.id)}
                      className={cn(
                        'rounded-lg border p-3 text-left text-sm',
                        mainId === p.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200',
                      )}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        <span className={briefProductSourceBadgeClass(p.source)}>
                          {briefProductSourceLabel(p.source)}
                        </span>
                        <span>¥{p.priceYuan}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">选择次推品（可选）</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {effectiveSynced.map((p) => (
                    <button
                      key={`sec-${p.id}`}
                      type="button"
                      onClick={() => setSecondaryId((cur) => (cur === p.id ? '' : p.id))}
                      className={cn(
                        'rounded-lg border p-3 text-left text-sm',
                        secondaryId === p.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200',
                      )}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        <span className={briefProductSourceBadgeClass(p.source)}>
                          {briefProductSourceLabel(p.source)}
                        </span>
                        <span>¥{p.priceYuan}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">选择商品标签（多选）</p>
                  <button
                    type="button"
                    disabled={tagsBusy}
                    onClick={() => void runSmartTags()}
                    className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {tagsBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                    按行业 AI 获取标签
                  </button>
                </div>
                {tagOptions.length === 0 ? (
                  <p className="text-xs text-gray-500">点击「按行业 AI 获取标签」加载候选（失败时请检查 API Key）。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium',
                          tags.includes(t) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && briefs ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">已生成 3 版 Brief，可分别复制；关闭前可保存到「达人Brief记录」。</p>
              {briefs.map((text, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">版本 {String.fromCharCode(65 + i)}</span>
                    <button
                      type="button"
                      onClick={() => void copyText(`版本${String.fromCharCode(65 + i)}`, text)}
                      className="inline-flex items-center text-xs font-medium text-blue-600 hover:underline"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      复制
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-gray-800">{text}</pre>
                </div>
              ))}
              {copyTip ? <p className="text-xs text-emerald-600">{copyTip}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              上一步
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {step === 1 ? (
              <button
                type="button"
                disabled={!platformId}
                onClick={() => setStep(2)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                下一步
              </button>
            ) : null}
            {step === 2 ? (
              <button
                type="button"
                disabled={!mainId || genBusy}
                onClick={() => void runGenerate()}
                className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {genBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                AI智能生成
              </button>
            ) : null}
            {step === 3 ? (
              <button
                type="button"
                onClick={finishSaveRecord}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                保存到记录并关闭
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

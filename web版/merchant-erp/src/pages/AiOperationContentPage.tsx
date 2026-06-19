import { Copy, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import {
  buildContextProductName,
  buildTitleDraftFromOrder,
  filterRecruitOrderRows,
  mapRecruitOrderPickerRow,
  type RecruitOrderPickerRow,
} from '../lib/aiRecruitOrderContext'
import { fetchOpsRegistry } from '../lib/opsRegistryClient'
import {
  listAiUiModelOptions,
  postDouyinGoodsAiAssist,
  type AiAssistAction,
  type AiModelId,
} from '../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import { resolveTextAiModelForRequest } from '../services/merchantAiModelStorage'

type MainTab = 'article' | 'topic' | 'brief'

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

export default function AiOperationContentPage() {
  const [mainTab, setMainTab] = useState<MainTab>('article')
  const [orderRows, setOrderRows] = useState<RecruitOrderPickerRow[]>([])
  const [orderKeyword, setOrderKeyword] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [showOrderPicker, setShowOrderPicker] = useState(false)
  const [extraHint, setExtraHint] = useState('')

  const [aiModelUiTick, setAiModelUiTick] = useState(0)

  const [aiOptsReload, setAiOptsReload] = useState(0)

  useEffect(() => {
    const b = () => setAiOptsReload((n) => n + 1)
    window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, b)
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, b)
    return () => {
      window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, b)
      window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, b)
    }
  }, [])

  const aiModelPickOptions = useMemo(() => listAiUiModelOptions(), [aiOptsReload])

  const effectiveTextAiModel = useMemo(
    () => resolveTextAiModelForRequest() as AiModelId,
    [aiModelUiTick, aiOptsReload],
  )

  const [articleOut, setArticleOut] = useState('')
  const [articleBusy, setArticleBusy] = useState(false)
  const [articleErr, setArticleErr] = useState<string | null>(null)
  const [articleCopyTip, setArticleCopyTip] = useState<string | null>(null)

  const [topicOut, setTopicOut] = useState('')
  const [topicBusy, setTopicBusy] = useState(false)
  const [topicErr, setTopicErr] = useState<string | null>(null)
  const [topicCopyTip, setTopicCopyTip] = useState<string | null>(null)

  const [briefOut, setBriefOut] = useState('')
  const [briefBusy, setBriefBusy] = useState(false)
  const [briefErr, setBriefErr] = useState<string | null>(null)

  const selectedOrder = useMemo(
    () => orderRows.find((r) => r.id === selectedOrderId) ?? null,
    [orderRows, selectedOrderId],
  )

  const filteredOrders = useMemo(
    () => filterRecruitOrderRows(orderRows, orderKeyword),
    [orderRows, orderKeyword],
  )

  const reloadOrders = useCallback(async () => {
    try {
      const reg = await fetchOpsRegistry()
      const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const rows = list
        .map((mp) => mapRecruitOrderPickerRow(mp))
        .filter((r) => r.id)
        .sort((a, b) => b.id.localeCompare(a.id))
      setOrderRows(rows)
    } catch {
      setOrderRows([])
    }
  }, [])

  useEffect(() => {
    void reloadOrders()
    const onSync = () => void reloadOrders()
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
    return () => window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
  }, [reloadOrders])

  const runAssist = useCallback(
    async (action: AiAssistAction, mode: 'article' | 'topic' | 'brief') => {
      if (!selectedOrder) {
        return { ok: false as const, message: '请先选择招募订单。' }
      }
      return postDouyinGoodsAiAssist({
        model: resolveTextAiModelForRequest() as AiModelId,
        action,
        product_name: buildContextProductName(selectedOrder),
        title_draft: buildTitleDraftFromOrder(selectedOrder, mode, extraHint),
      })
    },
    [selectedOrder, extraHint],
  )

  const onGenerateArticle = async () => {
    setArticleErr(null)
    setArticleCopyTip(null)
    setArticleBusy(true)
    try {
      const r = await runAssist('operation_article', 'article')
      if (!r.ok) {
        setArticleErr(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → AI 模型绑定」中的「管理各模型 API Key」完成配置。`
            : r.message,
        )
        return
      }
      setArticleOut(r.description ?? '')
    } finally {
      setArticleBusy(false)
    }
  }

  const onGenerateTopic = async () => {
    setTopicErr(null)
    setTopicCopyTip(null)
    setTopicBusy(true)
    try {
      const r = await runAssist('operation_topic', 'topic')
      if (!r.ok) {
        setTopicErr(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → AI 模型绑定」中的「管理各模型 API Key」完成配置。`
            : r.message,
        )
        return
      }
      setTopicOut(r.description ?? '')
    } finally {
      setTopicBusy(false)
    }
  }

  const onCopyArticle = async () => {
    if (!articleOut) return
    const ok = await copyTextToClipboard(articleOut)
    setArticleCopyTip(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本复制')
    window.setTimeout(() => setArticleCopyTip(null), 2500)
  }

  const onCopyTopic = async () => {
    if (!topicOut) return
    const ok = await copyTextToClipboard(topicOut)
    setTopicCopyTip(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本复制')
    window.setTimeout(() => setTopicCopyTip(null), 2500)
  }

  const onGenerateBrief = async () => {
    setBriefErr(null)
    setBriefBusy(true)
    try {
      const r = await runAssist('operation_article', 'brief')
      if (!r.ok) {
        setBriefErr(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → AI 模型绑定」完成配置。`
            : r.message,
        )
        return
      }
      setBriefOut(r.description ?? '')
    } finally {
      setBriefBusy(false)
    }
  }

  const onCopyBrief = async () => {
    if (!briefOut) return
    await copyTextToClipboard(briefOut)
  }

  return (
    <div className="ai-content-page mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">AI 文章与话题</h1>
        <p className="mt-1 text-sm embed-text-muted">
          选择招募订单后，按订单实际要求生成文章、选题或云剪 Brief（无需抖音林客绑定）。
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {(['article', 'topic', 'brief'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMainTab(tab)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                mainTab === tab
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'embed-text-muted hover:embed-text-primary',
              )}
            >
              {tab === 'article' ? 'AI 文章生成' : tab === 'topic' ? 'AI 话题推荐' : '招募 Brief'}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <span className="block text-sm font-medium embed-text-primary">招募订单筛选</span>
          <input
            value={orderKeyword}
            onChange={(e) => setOrderKeyword(e.target.value)}
            placeholder="搜索订单标题、区域、品类…"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowOrderPicker((v) => !v)}
            className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm"
          >
            <span className="embed-text-muted">当前订单：</span>
            <span className="font-medium embed-text-primary">
              {selectedOrder ? selectedOrder.title : '点击选择招募订单'}
            </span>
          </button>
          {showOrderPicker ? (
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200">
              {filteredOrders.length === 0 ? (
                <p className="p-3 text-xs embed-text-muted">暂无匹配订单</p>
              ) : (
                filteredOrders.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(row.id)
                      setShowOrderPicker(false)
                      setOrderKeyword('')
                    }}
                    className={cn(
                      'block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50',
                      selectedOrderId === row.id && 'bg-indigo-50',
                    )}
                  >
                    <div className="font-medium embed-text-primary">{row.title}</div>
                    <div className="text-xs embed-text-muted">
                      {row.platform} · {row.region} · {row.category}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
          <label className="mt-4 block text-xs embed-text-muted">补充要点（可选）</label>
          <textarea
            value={extraHint}
            onChange={(e) => setExtraHint(e.target.value)}
            rows={2}
            placeholder="如：强调周末引流、套餐性价比等"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold embed-text-primary">文案用 AI 模型</span>
            <AiModelAutoPicker
              kind="text"
              options={aiModelPickOptions}
              onResolutionChange={() => setAiModelUiTick((n) => n + 1)}
            />
          </div>
          <p className="mt-2 text-xs embed-text-muted">
            当前请求使用：
            <span className="font-medium embed-text-primary">
              {aiModelPickOptions.find((m) => m.id === effectiveTextAiModel)?.label ?? effectiveTextAiModel}
            </span>
          </p>
        </div>

        {mainTab === 'article' ? (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold embed-text-primary">AI 文章生成</h2>
            <p className="mt-1 text-sm embed-text-muted">基于所选招募订单生成图文稿件。</p>
            {articleErr && <p className="mt-2 text-sm text-red-600">{articleErr}</p>}
            <button
              type="button"
              disabled={articleBusy || !selectedOrder}
              onClick={() => void onGenerateArticle()}
              className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {articleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成文章
            </button>
            {articleOut ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium embed-text-primary">生成结果</p>
                  <button type="button" onClick={() => void onCopyArticle()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50">
                    <Copy className="h-3.5 w-3.5" />
                    复制全文
                  </button>
                </div>
                {articleCopyTip && <p className="mt-1 text-xs text-emerald-700">{articleCopyTip}</p>}
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed embed-text-primary whitespace-pre-wrap">
                  {articleOut}
                </div>
              </div>
            ) : null}
          </div>
        ) : mainTab === 'topic' ? (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold embed-text-primary">AI 话题推荐</h2>
            <p className="mt-1 text-sm embed-text-muted">结合招募订单生成本周选题建议。</p>
            {topicErr && <p className="mt-2 text-sm text-red-600">{topicErr}</p>}
            <button
              type="button"
              disabled={topicBusy || !selectedOrder}
              onClick={() => void onGenerateTopic()}
              className="mt-4 inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {topicBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成选题
            </button>
            {topicOut ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium embed-text-primary">推荐选题</p>
                  <button type="button" onClick={() => void onCopyTopic()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50">
                    <Copy className="h-3.5 w-3.5" />
                    复制全文
                  </button>
                </div>
                {topicCopyTip && <p className="mt-1 text-xs text-emerald-700">{topicCopyTip}</p>}
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed embed-text-primary whitespace-pre-wrap">
                  {topicOut}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold embed-text-primary">招募 Brief（云剪文案）</h2>
            <p className="mt-1 text-sm embed-text-muted">生成【剪辑指令】+【字幕文案】，可用于灵祺 AI 云剪。</p>
            {briefErr && <p className="mt-2 text-sm text-red-600">{briefErr}</p>}
            <button
              type="button"
              disabled={briefBusy || !selectedOrder}
              onClick={() => void onGenerateBrief()}
              className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {briefBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成 Brief
            </button>
            {briefOut ? (
              <div className="mt-4">
                <button type="button" onClick={() => void onCopyBrief()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50">
                  <Copy className="h-3.5 w-3.5" />
                  复制全文
                </button>
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed embed-text-primary whitespace-pre-wrap">
                  {briefOut}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

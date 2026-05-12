import { Copy, Loader2, Sparkles, Store } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import DouyinStorePickerModal from '../components/store/DouyinStorePickerModal'
import { cn } from '../cn'
import { readMerchantSession } from '../lib/merchantSession'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import {
  listAiUiModelOptions,
  postDouyinGoodsAiAssist,
  type AiAssistAction,
  type AiModelId,
} from '../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import { resolveTextAiModelForRequest } from '../services/merchantAiModelStorage'

type MainTab = 'article' | 'topic'
type PlatformId = 'douyin' | 'meituan' | 'xhs'
type ScopeMode = 'brand' | 'store'

const PLATFORM_OPTIONS: { id: PlatformId; label: string; disabled?: boolean }[] = [
  { id: 'douyin', label: '抖音来客' },
  { id: 'meituan', label: '美团点评', disabled: true },
  { id: 'xhs', label: '小红书', disabled: true },
]

function readDouyinToken(): string | null {
  return readMerchantSession('meoo_douyin_merchant_token')
}

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
  const [platformId, setPlatformId] = useState<PlatformId>('douyin')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('brand')
  const [brandName, setBrandName] = useState('')
  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([])
  const [selectedStoreRows, setSelectedStoreRows] = useState<{ id: string; name: string }[]>([])
  const [storePickerOpen, setStorePickerOpen] = useState(false)

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

  const [articleBrief, setArticleBrief] = useState('')
  const [articleOut, setArticleOut] = useState('')
  const [articleBusy, setArticleBusy] = useState(false)
  const [articleErr, setArticleErr] = useState<string | null>(null)
  const [articleCopyTip, setArticleCopyTip] = useState<string | null>(null)

  const [topicFocus, setTopicFocus] = useState('')
  const [topicOut, setTopicOut] = useState('')
  const [topicBusy, setTopicBusy] = useState(false)
  const [topicErr, setTopicErr] = useState<string | null>(null)
  const [topicCopyTip, setTopicCopyTip] = useState<string | null>(null)

  const buildContextProductName = useCallback((): string => {
    const plat = PLATFORM_OPTIONS.find((x) => x.id === platformId)?.label ?? '抖音来客'
    if (platformId !== 'douyin') {
      return `${plat}（当前仅抖音来客支持 AI 生成）`
    }
    if (scopeMode === 'brand') {
      return `${plat}；品牌：${brandName.trim() || '（未填写）'}`
    }
    if (selectedStoreRows.length === 0) {
      return `${plat}；门店：（未选择）`
    }
    const names = selectedStoreRows.map((r) => r.name).join('、')
    return `${plat}；门店：${names}（共 ${selectedStoreRows.length} 家）`
  }, [platformId, scopeMode, brandName, selectedStoreRows])

  const runAssist = useCallback(
    async (action: AiAssistAction, title_draft: string) => {
      if (platformId !== 'douyin') {
        return {
          ok: false as const,
          message: '当前仅「抖音来客」平台支持 AI 生成，请先选择抖音来客。',
        }
      }
      if (!readDouyinToken()) {
        return {
          ok: false as const,
          message: '请先在「系统设置 → 平台连接」完成抖音来客绑定后再使用 AI 能力。',
        }
      }
      return postDouyinGoodsAiAssist({
        model: resolveTextAiModelForRequest() as AiModelId,
        action,
        product_name: buildContextProductName(),
        title_draft: title_draft.trim(),
      })
    },
    [platformId, buildContextProductName],
  )

  const onGenerateArticle = async () => {
    setArticleErr(null)
    setArticleCopyTip(null)
    setArticleBusy(true)
    try {
      const r = await runAssist('operation_article', articleBrief)
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
      const r = await runAssist('operation_topic', topicFocus)
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

  const storeSummary =
    selectedStoreRows.length === 0
      ? '尚未选择门店'
      : selectedStoreRows.length <= 2
        ? selectedStoreRows.map((r) => r.name).join('、')
        : `${selectedStoreRows
            .slice(0, 2)
            .map((r) => r.name)
            .join('、')} 等 ${selectedStoreRows.length} 家`

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">AI 文章与话题</h1>
        <p className="mt-1 text-sm text-gray-500">
          选择平台与品牌或适用门店后，使用下方文案模型生成内容（需已完成抖音来客绑定）。
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setMainTab('article')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              mainTab === 'article'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            AI 文章生成
          </button>
          <button
            type="button"
            onClick={() => setMainTab('topic')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              mainTab === 'topic'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            AI 话题推荐
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-800">平台</label>
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value as PlatformId)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.id} value={p.id} disabled={p.disabled}>
                  {p.label}
                  {p.disabled ? '（即将支持）' : ''}
                </option>
              ))}
            </select>
            {platformId !== 'douyin' && (
              <p className="mt-1 text-xs text-amber-800">AI 生成请先选择「抖音来客」。</p>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-800">品牌 / 门店</span>
            <div className="mt-2 inline-flex rounded-lg border border-gray-200 p-1">
              <button
                type="button"
                onClick={() => setScopeMode('brand')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  scopeMode === 'brand'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                品牌
              </button>
              <button
                type="button"
                onClick={() => setScopeMode('store')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  scopeMode === 'store'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                门店
              </button>
            </div>
            {scopeMode === 'brand' ? (
              <div className="mt-3 space-y-1.5">
                <label className="block text-xs text-gray-600">
                  品牌名称
                  {platformId === 'douyin' ? (
                    <span className="text-gray-400">（手动填写，与来客「门店品牌」一致即可）</span>
                  ) : null}
                </label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={platformId === 'douyin' ? '如：魔楽斑马' : '填写品牌名称'}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setStorePickerOpen(true)}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 sm:w-auto"
                >
                  <Store className="mr-2 h-4 w-4" />
                  选择适用门店
                </button>
                <p className="text-xs text-gray-600">
                  已选 <span className="font-semibold text-gray-900">{selectedPoiIds.length}</span> 家：
                  {storeSummary}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">文案用 AI 模型</span>
            <AiModelAutoPicker
              kind="text"
              options={aiModelPickOptions}
              onResolutionChange={() => setAiModelUiTick((n) => n + 1)}
            />
          </div>
          <p className="mt-2 text-xs text-gray-600">
            开启「自动」时与系统设置默认一致；关闭后可指定模型。当前请求使用：
            <span className="font-medium text-gray-800">
              {aiModelPickOptions.find((m) => m.id === effectiveTextAiModel)?.label ?? effectiveTextAiModel}
            </span>
          </p>
        </div>

        {mainTab === 'article' ? (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold text-gray-900">AI 文章生成</h2>
            <p className="mt-1 text-sm text-gray-500">基于上方平台与品牌/门店信息，以及下列要点生成图文稿件。</p>
            <label className="mt-4 block text-sm font-medium text-gray-800">
              写作要点与活动信息 <span className="text-red-500">*</span>
              <textarea
                value={articleBrief}
                onChange={(e) => setArticleBrief(e.target.value)}
                rows={6}
                placeholder="活动主题、卖点、套餐、适用人群、时间节点等，至少 8 个字"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            {articleErr && <p className="mt-2 text-sm text-red-600">{articleErr}</p>}
            <button
              type="button"
              disabled={articleBusy || platformId !== 'douyin'}
              onClick={() => void onGenerateArticle()}
              className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {articleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成文章
            </button>
            {articleOut ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">生成结果</p>
                  <button
                    type="button"
                    onClick={() => void onCopyArticle()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制全文
                  </button>
                </div>
                {articleCopyTip && <p className="mt-1 text-xs text-emerald-700">{articleCopyTip}</p>}
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                  {articleOut}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold text-gray-900">AI 话题推荐</h2>
            <p className="mt-1 text-sm text-gray-500">结合上方平台与品牌/门店信息，生成本周选题建议。</p>
            <label className="mt-4 block text-sm font-medium text-gray-800">
              品类与客群 / 经营重点 <span className="text-red-500">*</span>
              <textarea
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                rows={5}
                placeholder="如：火锅团购、家庭聚餐、周末引流，至少 6 个字"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            {topicErr && <p className="mt-2 text-sm text-red-600">{topicErr}</p>}
            <button
              type="button"
              disabled={topicBusy || platformId !== 'douyin'}
              onClick={() => void onGenerateTopic()}
              className="mt-4 inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {topicBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成选题
            </button>
            {topicOut ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">推荐选题</p>
                  <button
                    type="button"
                    onClick={() => void onCopyTopic()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制全文
                  </button>
                </div>
                {topicCopyTip && <p className="mt-1 text-xs text-emerald-700">{topicCopyTip}</p>}
                <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                  {topicOut}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <DouyinStorePickerModal
        open={storePickerOpen}
        onClose={() => setStorePickerOpen(false)}
        initialPoiIds={selectedPoiIds}
        onConfirm={(poiIds, rows) => {
          setSelectedPoiIds(poiIds)
          setSelectedStoreRows(rows)
          setStorePickerOpen(false)
        }}
      />
    </div>
  )
}

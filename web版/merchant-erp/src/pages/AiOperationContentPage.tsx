import { Copy, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import RecruitmentPlatformChips, {
  type RecruitmentPlatform,
} from '../components/recruitment/RecruitmentPlatformChips'
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
type ScopeMode = 'brand' | 'store'

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
  const [deliveryPlatform, setDeliveryPlatform] = useState<RecruitmentPlatform>('抖音')
  const isDouyin = deliveryPlatform === '抖音'
  const [scopeMode, setScopeMode] = useState<ScopeMode>('brand')
  const [brandName, setBrandName] = useState('')
  const [storeName, setStoreName] = useState('')

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
    if (!isDouyin) {
      return `${deliveryPlatform}（当前仅「抖音」支持 AI 生成）`
    }
    if (scopeMode === 'brand') {
      return `${deliveryPlatform}；品牌：${brandName.trim() || '（未填写）'}`
    }
    return `${deliveryPlatform}；门店：${storeName.trim() || '（未填写）'}`
  }, [deliveryPlatform, isDouyin, scopeMode, brandName, storeName])

  const runAssist = useCallback(
    async (action: AiAssistAction, title_draft: string) => {
      if (!isDouyin) {
        return {
          ok: false as const,
          message: '当前仅「抖音」平台支持 AI 文章与话题生成，请先选择抖音。',
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
    [isDouyin, buildContextProductName],
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

  return (
    <div className="ai-content-page mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">AI 文章与话题</h1>
        <p className="mt-1 text-sm embed-text-muted">
          选择投放平台与品牌或适用门店后，使用下方文案模型生成内容（抖音平台需已完成来客绑定）。
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setMainTab('article')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              mainTab === 'article'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'embed-text-muted hover:embed-text-primary',
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
                : 'embed-text-muted hover:embed-text-primary',
            )}
          >
            AI 话题推荐
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <RecruitmentPlatformChips
              value={deliveryPlatform}
              onChange={setDeliveryPlatform}
              label="平台"
              required
            />
            {!isDouyin ? (
              <p className="mt-2 text-xs text-amber-800">
                {deliveryPlatform === '小红书'
                  ? '小红书平台 AI 文案即将支持；当前请切换为「抖音」生成内容。'
                  : `「${deliveryPlatform}」平台 AI 文案即将支持；当前请切换为「抖音」生成内容。`}
              </p>
            ) : null}
          </div>

          <div>
            <span className="block text-sm font-medium embed-text-primary">品牌 / 门店</span>
            <div className="mt-2 inline-flex rounded-lg border border-gray-200 p-1">
              <button
                type="button"
                onClick={() => setScopeMode('brand')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  scopeMode === 'brand'
                    ? 'bg-indigo-600 text-white'
                    : 'embed-text-muted hover:bg-gray-50',
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
                    : 'embed-text-muted hover:bg-gray-50',
                )}
              >
                门店
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              <label className="block text-xs embed-text-muted">
                {scopeMode === 'brand' ? '品牌名称' : '门店名称'}
              </label>
              <input
                value={scopeMode === 'brand' ? brandName : storeName}
                onChange={(e) =>
                  scopeMode === 'brand' ? setBrandName(e.target.value) : setStoreName(e.target.value)
                }
                placeholder={scopeMode === 'brand' ? '如：魔楽斑马' : '如：魔楽斑马生活科技馆（天一店）'}
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
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
            开启「自动」时与系统设置默认一致；关闭后可指定模型。当前请求使用：
            <span className="font-medium embed-text-primary">
              {aiModelPickOptions.find((m) => m.id === effectiveTextAiModel)?.label ?? effectiveTextAiModel}
            </span>
          </p>
        </div>

        {mainTab === 'article' ? (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold embed-text-primary">AI 文章生成</h2>
            <p className="mt-1 text-sm embed-text-muted">基于上方平台与品牌/门店信息，以及下列要点生成图文稿件。</p>
            <label className="mt-4 block text-sm font-medium embed-text-primary">
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
              disabled={articleBusy || !isDouyin}
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
                  <button
                    type="button"
                    onClick={() => void onCopyArticle()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50"
                  >
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
        ) : (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h2 className="text-lg font-semibold embed-text-primary">AI 话题推荐</h2>
            <p className="mt-1 text-sm embed-text-muted">结合上方平台与品牌/门店信息，生成本周选题建议。</p>
            <label className="mt-4 block text-sm font-medium embed-text-primary">
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
              disabled={topicBusy || !isDouyin}
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
                  <button
                    type="button"
                    onClick={() => void onCopyTopic()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50"
                  >
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
        )}
      </section>

    </div>
  )
}

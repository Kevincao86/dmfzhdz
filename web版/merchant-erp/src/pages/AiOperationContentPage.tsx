import { Copy, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import { loadAddonRecruitOrderPickerRows } from '../lib/addonRecruitOrderPicker'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import {
  filterRecruitOrderRows,
  type RecruitOrderPickerRow,
} from '../lib/aiRecruitOrderContext'
import { listAiUiModelOptions, type AiModelId } from '../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import { resolveTextAiModelForRequest } from '../services/merchantAiModelStorage'
import {
  generateViralBrief,
  PLATFORM_OPTIONS,
  resolveViralBriefPlatform,
  stripAiMarkdown,
  STYLE_OPTIONS,
  type ViralBriefPlatform,
  type ViralBriefResult,
  type ViralBriefStyle,
} from '../services/viralBriefAi'

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
  const [orderRows, setOrderRows] = useState<RecruitOrderPickerRow[]>([])
  const [orderKeyword, setOrderKeyword] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLoadError, setOrdersLoadError] = useState<string | null>(null)
  const [extraHint, setExtraHint] = useState('')
  const [platform, setPlatform] = useState<ViralBriefPlatform>('douyin')
  const [style, setStyle] = useState<ViralBriefStyle>('review')
  const [platformTouched, setPlatformTouched] = useState(false)

  const [aiModelUiTick, setAiModelUiTick] = useState(0)
  const [aiOptsReload, setAiOptsReload] = useState(0)

  const [briefResult, setBriefResult] = useState<ViralBriefResult | null>(null)
  const [briefBusy, setBriefBusy] = useState(false)
  const [briefErr, setBriefErr] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [copyTip, setCopyTip] = useState<string | null>(null)

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

  const selectedOrder = useMemo(
    () => orderRows.find((r) => r.id === selectedOrderId) ?? null,
    [orderRows, selectedOrderId],
  )

  const filteredOrders = useMemo(
    () => filterRecruitOrderRows(orderRows, orderKeyword),
    [orderRows, orderKeyword],
  )

  useEffect(() => {
    if (!selectedOrder || platformTouched) return
    setPlatform(resolveViralBriefPlatform(selectedOrder))
  }, [selectedOrder, platformTouched])

  const reloadOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersLoadError(null)
    try {
      const rows = await loadAddonRecruitOrderPickerRows()
      setOrderRows(rows)
      if (rows.length === 0) {
        setOrdersLoadError('暂无在招招募订单，请先在「我的发单 → 已发布」确认是否有进行中订单。')
      }
    } catch (e) {
      setOrderRows([])
      setOrdersLoadError(e instanceof Error ? e.message : '加载招募订单失败')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadOrders()
    const onSync = () => void reloadOrders()
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
    return () => window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
  }, [reloadOrders])

  const onGenerateBrief = async () => {
    if (!selectedOrder) {
      setBriefErr('请先选择招募订单。')
      return
    }
    setBriefErr(null)
    setCopyTip(null)
    setBriefResult(null)
    setBriefBusy(true)
    setProgressMsg('准备生成…')
    try {
      const result = await generateViralBrief({
        order: selectedOrder,
        platform,
        style,
        extraHint,
        onProgress: setProgressMsg,
      })
      setBriefResult(result)
      setProgressMsg('生成完成')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setBriefErr(
        /api key|vendor|模型/i.test(msg)
          ? `${msg} 请前往「系统设置 → AI 模型绑定」完成配置。`
          : msg,
      )
      setProgressMsg('')
    } finally {
      setBriefBusy(false)
    }
  }

  const onCopy = async (text: string) => {
    if (!text) return
    const ok = await copyTextToClipboard(text)
    setCopyTip(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本复制')
    window.setTimeout(() => setCopyTip(null), 2500)
  }

  return (
    <div className="ai-content-page mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">爆款 Brief 生成</h1>
        <p className="mt-1 text-sm embed-text-muted">
          选择招募订单后，AI 先通读需求再输出多平台爆款 Brief：钩子、分镜、话题、执行分工与审片清单。
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <span className="block text-sm font-medium embed-text-primary">招募订单</span>
          <input
            value={orderKeyword}
            onChange={(e) => setOrderKeyword(e.target.value)}
            placeholder="搜索订单标题、区域、品类…"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="mt-3 block text-xs embed-text-muted">当前订单</label>
          <select
            value={selectedOrderId}
            disabled={ordersLoading || filteredOrders.length === 0}
            onChange={(e) => {
              setSelectedOrderId(e.target.value)
              setPlatformTouched(false)
              setBriefResult(null)
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm embed-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {ordersLoading
                ? '正在加载招募订单…'
                : filteredOrders.length === 0
                  ? '暂无可选招募订单'
                  : '请选择招募订单'}
            </option>
            {filteredOrders.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title} · {row.platform} · {row.region || '—'}
              </option>
            ))}
          </select>
          {ordersLoadError ? <p className="mt-2 text-xs text-amber-700">{ordersLoadError}</p> : null}
          {!ordersLoading && orderRows.length > 0 ? (
            <p className="mt-1 text-xs embed-text-muted">共 {orderRows.length} 条招募订单</p>
          ) : null}

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs embed-text-muted">目标平台</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPlatform(p.id)
                      setPlatformTouched(true)
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      platform === p.id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 embed-text-muted hover:border-gray-300',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs embed-text-muted">内容风格</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      style === s.id
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-gray-200 embed-text-muted hover:border-gray-300',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="mt-4 block text-xs embed-text-muted">补充要点（可选）</label>
          <textarea
            value={extraHint}
            onChange={(e) => setExtraHint(e.target.value)}
            rows={2}
            placeholder="如：强调周末引流、必拍出片氛围、禁提竞品等"
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

        <div className="mt-8 border-t border-gray-100 pt-8">
          <h2 className="text-lg font-semibold embed-text-primary">一键生成爆款 Brief</h2>
          <p className="mt-1 text-sm embed-text-muted">
            两阶段：通读订单需求 → 输出钩子、标题、分镜、话题、分工与审片 Checklist。
          </p>
          {progressMsg && briefBusy ? (
            <p className="mt-2 text-sm text-indigo-600">{progressMsg}</p>
          ) : null}
          {briefErr && <p className="mt-2 text-sm text-red-600">{briefErr}</p>}
          <button
            type="button"
            disabled={briefBusy || !selectedOrder}
            onClick={() => void onGenerateBrief()}
            className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {briefBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            生成爆款 Brief
          </button>

          {briefResult ? (
            <div className="mt-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium embed-text-primary">生成结果</p>
                <button
                  type="button"
                  onClick={() => void onCopy(briefResult.fullMarkdown)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium embed-text-primary hover:bg-gray-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制全文
                </button>
              </div>
              {copyTip && <p className="text-xs text-emerald-700">{copyTip}</p>}

              <BriefBlock title="一、需求汇总" text={briefResult.requirementSummary} onCopy={onCopy} />

              {briefResult.unifiedSolutions.length > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold embed-text-primary">二、解决方案</h3>
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed embed-text-primary">
                    {briefResult.unifiedSolutions.map((s) => (
                      <li key={s.title}>
                        <strong>{s.title}</strong>：{s.desc}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ListBlock title="三、爆款钩子（前 3 秒）" items={briefResult.hooks} onCopy={onCopy} />
              <ListBlock title="四、标题 / 封面文案" items={briefResult.titles} onCopy={onCopy} />

              {briefResult.structure.length > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold embed-text-primary">五、内容结构 / 分镜</h3>
                  <div className="mt-3 space-y-3">
                    {briefResult.structure.map((sc, i) => (
                      <div key={`${sc.scene}-${i}`} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                        <p className="font-medium embed-text-primary">
                          镜头 {i + 1}：{sc.scene}
                        </p>
                        <p className="mt-1 embed-text-muted">画面：{sc.visual}</p>
                        <p className="mt-1 embed-text-primary">口播：{sc.voice}</p>
                        {sc.subtitle ? <p className="mt-1 embed-text-muted">字幕：{sc.subtitle}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <ListBlock title="六、必提卖点" items={briefResult.mustMention} onCopy={onCopy} />
              <ListBlock title="七、禁忌事项" items={briefResult.forbidden} onCopy={onCopy} />
              <ListBlock title="八、话题 / 标签" items={briefResult.topics} onCopy={onCopy} />

              {(briefResult.roles.talent || briefResult.roles.shoot || briefResult.roles.edit) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm embed-text-primary">
                  <h3 className="font-semibold">九、执行分工</h3>
                  {briefResult.roles.talent ? <p className="mt-2">达人：{briefResult.roles.talent}</p> : null}
                  {briefResult.roles.shoot ? <p className="mt-1">拍摄：{briefResult.roles.shoot}</p> : null}
                  {briefResult.roles.edit ? <p className="mt-1">剪辑：{briefResult.roles.edit}</p> : null}
                </div>
              )}

              <ListBlock title="十、审片 Checklist" items={briefResult.checklist} onCopy={onCopy} />

              {isBriefStructurallyIncomplete(briefResult) ? (
                <BriefBlock
                  title="完整 Brief 全文"
                  text={stripAiMarkdown(briefResult.fullMarkdown)}
                  onCopy={onCopy}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}


function isBriefStructurallyIncomplete(result: ViralBriefResult): boolean {
  return (
    result.hooks.length === 0 &&
    result.titles.length === 0 &&
    result.structure.length === 0 &&
    result.mustMention.length === 0
  )
}

function BriefBlock({
  title,
  text,
  onCopy,
}: {
  title: string
  text: string
  onCopy: (t: string) => void
}) {
  if (!text) return null
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold embed-text-primary">{title}</h3>
        <button
          type="button"
          onClick={() => onCopy(text)}
          className="text-xs text-indigo-600 hover:underline"
        >
          复制
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed embed-text-primary">{text}</p>
    </div>
  )
}

function ListBlock({
  title,
  items,
  onCopy,
}: {
  title: string
  items: string[]
  onCopy: (t: string) => void
}) {
  if (!items.length) return null
  const text = items.map((x, i) => `${i + 1}. ${x}`).join('\n')
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold embed-text-primary">{title}</h3>
        <button type="button" onClick={() => onCopy(text)} className="text-xs text-indigo-600 hover:underline">
          复制
        </button>
      </div>
      <ul className="mt-2 list-inside list-decimal space-y-1 text-sm embed-text-primary">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

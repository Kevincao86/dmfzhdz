import { Copy, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import BriefGenRecordsSidebar from '../components/BriefGenRecordsSidebar'
import { loadAddonRecruitOrderPickerRows } from '../lib/addonRecruitOrderPicker'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import {
  filterRecruitOrderRows,
  type RecruitOrderPickerRow,
} from '../lib/aiRecruitOrderContext'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import { listAiUiModelOptions } from '../services/douyinAiAssistApi'
import {
  briefVendorFallbackHint,
  generateViralBrief,
  isCopyManuscriptPlatform,
  PLATFORM_OPTIONS,
  resolveBriefTextAiModelForRequest,
  resolveViralBriefPlatform,
  stripAiMarkdown,
  STYLE_OPTIONS,
  type ViralBriefPlatform,
  type ViralBriefResult,
  type ViralBriefStyle,
} from '../services/viralBriefAi'
import { spendMpBriefPoints, checkMpBriefPointsAffordable } from '../services/mpAiPointsSpendClient'
import { saveMpBriefGenRecord } from '../services/mpBriefGenRecordsClient'
import { MP_POINTS_BRIEF_PER_USE } from '../lib/mpPointsEconomics'

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
  const [pointsTip, setPointsTip] = useState<string | null>(null)
  const [canGenerateBrief, setCanGenerateBrief] = useState(false)
  const [affordHint, setAffordHint] = useState<string | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const [affordChecking, setAffordChecking] = useState(false)
  const [recordsRefresh, setRecordsRefresh] = useState(0)

  const copyManuscriptMode = isCopyManuscriptPlatform(platform)

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
    () => resolveBriefTextAiModelForRequest(),
    [aiModelUiTick, aiOptsReload],
  )
  const briefFallbackHint = useMemo(() => briefVendorFallbackHint(), [aiModelUiTick, aiOptsReload])

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

  const refreshAffordState = useCallback(async () => {
    setAffordChecking(true)
    try {
      const result = await checkMpBriefPointsAffordable()
      if (result.ok) {
        setCanGenerateBrief(true)
        setAffordHint(null)
        setPointsBalance(result.balance)
      } else {
        setCanGenerateBrief(false)
        setAffordHint(result.message)
        setPointsBalance(result.balance ?? null)
      }
    } catch (e) {
      setCanGenerateBrief(false)
      setAffordHint(e instanceof Error ? e.message : String(e))
    } finally {
      setAffordChecking(false)
    }
  }, [])

  useEffect(() => {
    void refreshAffordState()
    const onSync = () => void refreshAffordState()
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
    return () => window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync)
  }, [refreshAffordState])

  const onGenerateBrief = async () => {
    if (!selectedOrder) {
      setBriefErr('请先选择招募订单。')
      return
    }
    const afford = await checkMpBriefPointsAffordable()
    if (!afford.ok) {
      setCanGenerateBrief(false)
      setAffordHint(afford.message)
      setBriefErr(afford.message)
      return
    }
    setBriefErr(null)
    setCopyTip(null)
    setPointsTip(null)
    setBriefResult(null)
    setBriefBusy(true)
    setProgressMsg('准备生成…')
    const genKey = `brief-${selectedOrder.id}-${platform}-${Date.now()}`
    try {
      const result = await generateViralBrief({
        order: selectedOrder,
        platform,
        style,
        extraHint,
        onProgress: setProgressMsg,
      })
      setBriefResult(result)
      setProgressMsg('生成完成，正在扣减积分…')
      try {
        const spend = await spendMpBriefPoints({
          idempotencyKey: genKey,
          note: `brief:${selectedOrder.id}:${platform}`,
        })
        if (spend && spend.pointsCharged > 0) {
          setPointsTip(`已扣 ${spend.pointsCharged} 积分，当前余额 ${spend.balance.toLocaleString('zh-CN')}`)
        } else if (spend?.already) {
          setPointsTip('积分已扣减（重复请求已忽略）')
        }
        void refreshAffordState()
      } catch (spendErr) {
        const msg = spendErr instanceof Error ? spendErr.message : String(spendErr)
        setPointsTip(`生成成功，但积分扣减失败：${msg}`)
      }
      try {
        await saveMpBriefGenRecord({
          orderId: selectedOrder.id,
          orderTitle: selectedOrder.title,
          platform,
          style,
          outputMode: result.outputMode,
          resultJson: JSON.stringify(result),
          fullMarkdown: result.fullMarkdown,
          idempotencyKey: genKey,
        })
        setRecordsRefresh((n) => n + 1)
      } catch {
        /* 记录保存失败不阻断主流程 */
      }
      setProgressMsg('生成完成')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setBriefErr(
        /缺少.*凭据|NEED_VENDOR_KEY|未配置.*key|invalid.*api.*key|鉴权失败|api key/i.test(msg)
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
    <div className="ai-content-page mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="erp-page-title">爆款 Brief 生成</h1>
        <p className="mt-1 text-sm embed-text-muted">
          {copyManuscriptMode
            ? '小红书 / 大众点评为图文文稿平台：选择订单后生成可直接发布的种草笔记/评价文稿。'
            : '选择招募订单后，AI 先通读需求再输出多平台爆款 Brief：钩子、分镜、话题、执行分工与审片清单。'}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_min(320px,32%)]">
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
            （失败时自动切换 {briefFallbackHint}）
          </p>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-8">
          <h2 className="text-lg font-semibold embed-text-primary">
            {copyManuscriptMode ? '一键生成爆款文稿' : '一键生成爆款 Brief'}
          </h2>
          <p className="mt-1 text-sm embed-text-muted">
            {copyManuscriptMode
              ? `两阶段：通读订单需求 → 输出标题、开篇、正文分段与完整可发布文稿（${MP_POINTS_BRIEF_PER_USE} 积分/篇，生成成功后扣减）。`
              : `两阶段：① 通读订单生成 Brief 文字版；② 检索抖音/网页相似探店视频与场景图（只返回链接/预览，不生图不生视频，${MP_POINTS_BRIEF_PER_USE} 积分/篇，生成成功后扣减）。`}
          </p>
          {affordHint && !briefBusy ? (
            <p className="mt-2 text-sm text-amber-700">{affordHint}</p>
          ) : null}
          {!affordChecking && canGenerateBrief && pointsBalance != null ? (
            <p className="mt-2 text-xs embed-text-muted">当前积分 {pointsBalance.toLocaleString('zh-CN')}</p>
          ) : null}
          {progressMsg && briefBusy ? (
            <p className="mt-2 text-sm text-indigo-600">{progressMsg}</p>
          ) : null}
          {briefErr && <p className="mt-2 text-sm text-red-600">{briefErr}</p>}
          {pointsTip && !briefBusy ? (
            <p className={`mt-2 text-sm ${pointsTip.includes('失败') ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pointsTip}
            </p>
          ) : null}
          <button
            type="button"
            disabled={briefBusy || affordChecking || !canGenerateBrief || !selectedOrder}
            onClick={() => void onGenerateBrief()}
            className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {briefBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {copyManuscriptMode ? '生成爆款文稿' : '生成爆款 Brief'}
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

              {briefResult.outputMode === 'copy_manuscript' ? (
                <CopyManuscriptResult result={briefResult} onCopy={onCopy} />
              ) : (
                <VideoBriefResult result={briefResult} onCopy={onCopy} />
              )}
            </div>
          ) : null}
        </div>
      </section>

        <BriefGenRecordsSidebar
          refreshToken={recordsRefresh}
          className="hidden lg:sticky lg:top-4 lg:block lg:self-start"
        />
      </div>

      <BriefGenRecordsSidebar refreshToken={recordsRefresh} className="lg:hidden" />
    </div>
  )
}

function VideoBriefResult({
  result,
  onCopy,
}: {
  result: ViralBriefResult
  onCopy: (t: string) => void
}) {
  return (
    <>
              <BriefBlock title="一、需求汇总" text={result.requirementSummary} onCopy={onCopy} />

              {result.unifiedSolutions.length > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold embed-text-primary">二、解决方案</h3>
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed embed-text-primary">
                    {result.unifiedSolutions.map((s) => (
                      <li key={s.title}>
                        <strong>{s.title}</strong>：{s.desc}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ListBlock title="三、爆款钩子（前 3 秒）" items={result.hooks} onCopy={onCopy} />
              <ListBlock title="四、标题 / 封面文案" items={result.titles} onCopy={onCopy} />

              {result.structure.length > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold embed-text-primary">五、内容结构 / 分镜</h3>
                  <div className="mt-3 space-y-3">
                    {result.structure.map((sc, i) => (
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

              <ListBlock title="六、必提卖点" items={result.mustMention} onCopy={onCopy} />
              <ListBlock title="七、禁忌事项" items={result.forbidden} onCopy={onCopy} />
              <ListBlock title="八、话题 / 标签" items={result.topics} onCopy={onCopy} />

              {(result.roles.talent || result.roles.shoot || result.roles.edit) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm embed-text-primary">
                  <h3 className="font-semibold">九、执行分工</h3>
                  {result.roles.talent ? <p className="mt-2">达人：{result.roles.talent}</p> : null}
                  {result.roles.shoot ? <p className="mt-1">拍摄：{result.roles.shoot}</p> : null}
                  {result.roles.edit ? <p className="mt-1">剪辑：{result.roles.edit}</p> : null}
                </div>
              )}

              <ListBlock title="十、审片 Checklist" items={result.checklist} onCopy={onCopy} />

              {result.referenceCases && result.referenceCases.length > 0 ? (
                <ReferenceCasesBlock cases={result.referenceCases} onCopy={onCopy} />
              ) : null}

              {isBriefStructurallyIncomplete(result) ? (
                <BriefBlock
                  title="完整 Brief 全文"
                  text={stripAiMarkdown(result.fullMarkdown)}
                  onCopy={onCopy}
                />
              ) : null}
    </>
  )
}

function CopyManuscriptResult({
  result,
  onCopy,
}: {
  result: ViralBriefResult
  onCopy: (t: string) => void
}) {
  const titles = result.coverTitles?.length ? result.coverTitles : result.titles
  return (
    <>
      <BriefBlock title="一、需求汇总" text={result.requirementSummary} onCopy={onCopy} />

      {result.unifiedSolutions.length > 0 ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold embed-text-primary">二、解决方案</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed embed-text-primary">
            {result.unifiedSolutions.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>：{s.desc}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ListBlock title="三、标题 / 封面文案（备选）" items={titles} onCopy={onCopy} />
      {result.openingParagraph ? (
        <BriefBlock title="四、开篇" text={result.openingParagraph} onCopy={onCopy} />
      ) : null}

      {result.bodySections && result.bodySections.length > 0 ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold embed-text-primary">五、正文</h3>
          <div className="mt-3 space-y-4">
            {result.bodySections.map((sec) => (
              <div key={sec.heading} className="rounded-md border border-gray-200 bg-white p-4 text-sm">
                <p className="font-semibold embed-text-primary">{sec.heading}</p>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed embed-text-primary">{sec.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.closingParagraph ? (
        <BriefBlock title="六、结尾互动" text={result.closingParagraph} onCopy={onCopy} />
      ) : null}

      {result.fullCopy ? (
        <BriefBlock title="完整可发布文稿" text={result.fullCopy} onCopy={onCopy} />
      ) : null}

      <ListBlock title="必提卖点" items={result.mustMention} onCopy={onCopy} />
      <ListBlock title="禁忌事项" items={result.forbidden} onCopy={onCopy} />
      <ListBlock title="话题 / 标签 / SEO" items={result.topics} onCopy={onCopy} />
      <ListBlock title="发布前自检" items={result.checklist} onCopy={onCopy} />
    </>
  )
}


function ReferenceCasesBlock({
  cases,
  onCopy,
}: {
  cases: NonNullable<ViralBriefResult['referenceCases']>
  onCopy: (t: string) => void
}) {
  const copyLines = cases.map((c, i) => {
    const lines = [`${i + 1}. ${c.title}（${c.aiPickReason || c.matchReason}）`]
    if (c.originalVideoUrl) lines.push(`视频：${c.originalVideoUrl}`)
    ;(c.originalSceneImages || c.sceneImages).forEach((img) => lines.push(`场景图：${img}`))
    return lines.join('\n')
  })
  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold embed-text-primary">十一、相似案例参考（检索）</h3>
        <button
          type="button"
          onClick={() => onCopy(copyLines.join('\n\n'))}
          className="text-xs text-indigo-600 hover:underline"
        >
          复制原链接
        </button>
      </div>
      <p className="mt-1 text-xs embed-text-muted">
        先从运营案例库匹配，再检索抖音/网页相似视频与场景图（只检索链接与预览，不 AI 生图/生视频）。
      </p>
      <div className="mt-4 space-y-4">
        {cases.map((c) => (
          <div key={c.id} className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium embed-text-primary">{c.title}</p>
            <p className="mt-1 text-xs embed-text-muted">{c.aiPickReason || c.matchReason}</p>
            {c.videoPreviewUrl || c.originalVideoUrl ? (
              <div className="mt-3 space-y-2">
                {c.videoPreviewUrl ? (
                  <video
                    src={c.videoPreviewUrl}
                    controls
                    preload="metadata"
                    className="max-h-48 w-full rounded-md border border-gray-100 bg-black object-contain"
                  />
                ) : null}
                {c.originalVideoUrl ? (
                  <a
                    href={c.originalVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-indigo-600 hover:underline"
                  >
                    {c.source === 'platform_search' ? '打开平台搜索页' : '打开原视频链接'}
                  </a>
                ) : null}
              </div>
            ) : null}
            {c.sceneImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {c.sceneImages.map((url, idx) => (
                  <a
                    key={`${c.id}-scene-${idx}`}
                    href={c.originalSceneImages?.[idx] || url}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="block overflow-hidden rounded-md border border-gray-100"
                  >
                    <img src={url} alt="拍摄场景参考" className="h-24 w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            ) : c.thumbUrl ? (
              <div className="mt-3">
                <img src={c.thumbUrl} alt="视频封面" className="h-24 w-auto rounded-md border border-gray-100 object-cover" loading="lazy" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
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

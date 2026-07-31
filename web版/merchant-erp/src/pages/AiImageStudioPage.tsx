import {
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '../cn'
import {
  compressImageBlobToJpeg,
  fetchImageBlob,
  pngBlobFromImageUrl,
  sliceCarouselFiveStrips,
  triggerBlobDownload,
} from '../lib/aiImageDelivery'
import { compressImageFileToDataUrl } from '../lib/aiImageCompress'
import {
  applyIndustryChange,
  applyIndustrySubChange,
  applyPlatformSeriesPlaybook,
  applyPlaybookToFormWithVariants,
  applyPlaybookVariantToForm,
  buildVisualStudioPrompt,
  clearPlatformSeriesPlaybook,
  DEFAULT_VISUAL_STUDIO_FORM,
  effectiveVariantCountForForm,
  generateCopySuggestions,
  getPlaybookVariantConfig,
  getPlaybooksForIndustry,
  getStylePresetsForIndustrySub,
  getSubCategoriesForIndustry,
  isPlatformSeriesPlaybook,
  LOCAL_LIFE_INDUSTRIES,
  PLATFORM_SERIES_CHANNELS,
  platformCarouselMasterGenSize,
  platformCarouselMasterGptSize,
  preferWanxPosterForIntent,
  resolveFormOutputPlaybookId,
  resolveFormPlatformSeries,
  publishChannelLogoSrc,
  PUBLISH_CHANNELS,
  resolveAiImageSizePreset,
  resolveChannel,
  resolveIndustryProfile,
  resolveIndustrySceneContext,
  referenceUploadSubtitle,
  resolvePlaybook,
  resolvePlaybookSizeDisplay,
  resolvePlaybookSizePresetId,
  resolveSeriesSlotLabel,
  type CopySuggestion,
  type LocalLifeIndustryId,
  type PublishChannelId,
  type VisualPlaybookId,
  type VisualStudioForm,
  type VisualStudioReferenceAnalysis,
} from '../lib/aiImageStudioPresets'
import {
  MP_POINTS_VISUAL_STUDIO_COPY_PER_USE,
  MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE,
  MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE,
  VISUAL_STUDIO_PRO_IMAGE_MODEL,
  mpPointsCostForVisualStudioImages,
} from '../lib/mpPointsEconomics'
import { postAiAgentNativeImage } from '../services/ai/aiClient'
import { fetchVisualStudioCopyFromAi, analyzeVisualStudioReferenceImage, fetchVisualStudioReferenceKeywordsFromAi } from '../services/ai/visualStudioAi'
import {
  checkVisualStudioCopyAffordable,
  checkVisualStudioImageBatchAffordable,
  spendVisualStudioCopyPoints,
  spendVisualStudioImagePoints,
} from '../services/mpAiPointsSpendClient'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { fetchStoresForPlatform } from '../services/merchantStoresApi'
import { postDouyinPoiDecorate } from '../services/merchantStoreDecorationApi'
import { uploadDouyinProductImage } from '../services/douyinProductApi'
import type { DouyinStoreRow } from '../services/douyinMerchantApi'

type VariantResult = {
  id: string
  channelId: PublishChannelId
  variantIndex: number
  status: 'pending' | 'running' | 'done' | 'error'
  imageUrl?: string
  previewUrl?: string
  fileExt?: 'jpg' | 'png'
  message?: string
}

function StudioPanel({
  step,
  title,
  subtitle,
  children,
  className,
}: {
  step?: string
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:p-5',
        className,
      )}
    >
      <div className="mb-3 flex items-start gap-2.5">
        {step ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm">
            {step}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ChannelChip({
  channelId,
  active,
  onClick,
  disabled,
}: {
  channelId: PublishChannelId
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const ch = resolveChannel(channelId)
  const logoSrc = publishChannelLogoSrc(channelId)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20'
          : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          className={cn(
            'h-4 w-4 shrink-0 rounded-sm object-contain',
            active && 'bg-white/90 p-0.5',
          )}
        />
      ) : channelId === 'offline_print' ? (
        <Printer className="h-3.5 w-3.5 shrink-0 opacity-70" />
      ) : (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: active ? '#fff' : ch.color }}
        />
      )}
      {ch.short}
    </button>
  )
}

function DevicePreview({
  channelId,
  previewUrl,
  headline,
  empty,
  previewAspect,
}: {
  channelId: PublishChannelId
  previewUrl?: string
  headline: string
  empty?: boolean
  /** 覆盖渠道默认比例（五连图横图 / 详情图竖图） */
  previewAspect?: 'vertical' | 'horizontal' | 'square'
}) {
  const ch = resolveChannel(channelId)
  const logoSrc = publishChannelLogoSrc(channelId)
  const isVertical =
    previewAspect === 'vertical' ||
    (previewAspect !== 'horizontal' &&
      previewAspect !== 'square' &&
      ch.primarySizeId === 'moments_vertical')
  const isSquare = previewAspect === 'square'
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'relative overflow-hidden rounded-[2rem] border-[5px] border-slate-800 bg-slate-900 shadow-2xl shadow-slate-400/30 ring-1 ring-white/10',
          isVertical
            ? 'h-[min(520px,58vh)] w-[240px]'
            : isSquare
              ? 'h-[280px] w-[280px]'
              : 'h-[220px] w-[380px]',
        )}
      >
        <div className="absolute left-1/2 top-2.5 z-10 h-1 w-16 -translate-x-1/2 rounded-full bg-slate-700" />
        <div className="absolute left-3 top-9 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow-sm">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" />
          ) : (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: ch.color }}
            />
          )}
          {ch.short}
        </div>
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 via-white to-violet-50 p-6 text-center">
            {empty ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-inner ring-1 ring-slate-200/80">
                  <Sparkles className="h-7 w-7 text-violet-400" />
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  选玩法 → 填文案 → 一键出图
                </p>
              </>
            ) : (
              <Loader2 className="h-9 w-9 animate-spin text-violet-500" />
            )}
          </div>
        )}
      </div>
      {headline && !previewUrl && (
        <p className="mt-3 max-w-[240px] truncate text-center text-xs text-slate-500">{headline}</p>
      )}
    </div>
  )
}

export default function AiImageStudioPage() {
  const [form, setForm] = useState<VisualStudioForm>(DEFAULT_VISUAL_STUDIO_FORM)
  const [productRefs, setProductRefs] = useState<Array<{ id: string; dataUrl: string; name: string }>>([])
  const [referenceAnalysis, setReferenceAnalysis] = useState<VisualStudioReferenceAnalysis | null>(null)
  const [refAnalyzeBusy, setRefAnalyzeBusy] = useState(false)
  const [refAnalyzeHint, setRefAnalyzeHint] = useState<string | null>(null)
  const [copyOptions, setCopyOptions] = useState<CopySuggestion[]>([])
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [copyAiHint, setCopyAiHint] = useState<string | null>(null)
  const [keywordsAiBusy, setKeywordsAiBusy] = useState(false)
  const [keywordsAiHint, setKeywordsAiHint] = useState<string | null>(null)
  const [selectedPreviewChannel, setSelectedPreviewChannel] = useState<PublishChannelId>('douyin')
  const [selectedPreviewVariantId, setSelectedPreviewVariantId] = useState<string | null>(null)
  const [variants, setVariants] = useState<VariantResult[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** 常规=万相；高级=TokenMix GPT Image 2 */
  const [imageTier, setImageTier] = useState<'standard' | 'pro'>('standard')
  const [refineNote, setRefineNote] = useState('')
  const [storeLoadHint, setStoreLoadHint] = useState<string | null>(null)
  const [decorStores, setDecorStores] = useState<DouyinStoreRow[]>([])
  const [decorPoiId, setDecorPoiId] = useState('')
  const [decorBusy, setDecorBusy] = useState(false)
  const [decorMsg, setDecorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const copyAbortRef = useRef<AbortController | null>(null)
  const keywordsAbortRef = useRef<AbortController | null>(null)
  const refAnalyzeAbortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initRef = useRef(false)

  const playbook = useMemo(() => resolvePlaybook(form.playbook), [form.playbook])
  const industryProfile = useMemo(() => resolveIndustryProfile(form.industry), [form.industry])
  const playbookVariantConfig = useMemo(
    () => getPlaybookVariantConfig(form.playbook, form.industry, form.industrySubId),
    [form.playbook, form.industry, form.industrySubId],
  )
  const activePlaybookVariant = useMemo(
    () => playbookVariantConfig?.options.find((o) => o.id === form.playbookVariantId) ?? null,
    [playbookVariantConfig, form.playbookVariantId],
  )
  const industryScene = useMemo(() => resolveIndustrySceneContext(form), [form.industry, form.industrySubId])
  const stylePresets = useMemo(
    () => getStylePresetsForIndustrySub(form.industrySubId, form.industry),
    [form.industrySubId, form.industry],
  )
  const subCategories = useMemo(() => getSubCategoriesForIndustry(form.industry), [form.industry])
  const visiblePlaybooks = useMemo(
    () => getPlaybooksForIndustry(form.industry).filter((p) => !isPlatformSeriesPlaybook(p.id)),
    [form.industry],
  )
  const platformSeries = resolveFormPlatformSeries(form)
  const outputPlaybookId = resolveFormOutputPlaybookId(form)
  const isPlatformSeries = platformSeries != null
  const isCarouselFive = platformSeries === 'platform_carousel_five'
  const perPlatformCount = effectiveVariantCountForForm(form)
  const activeGenerateChannels = useMemo(
    () => (form.multiChannelPack ? form.channels : [form.channels[0] ?? 'douyin']),
    [form.channels, form.multiChannelPack],
  )
  const generatePlan = useMemo(() => {
    const channelCount = activeGenerateChannels.length
    const variantCount = perPlatformCount
    const isCarousel = isCarouselFive
    // 五连图：每平台 1 张整幅主图（再裁 5 条），按主图计费
    const billable = isCarousel ? channelCount : channelCount * variantCount
    const total = channelCount * variantCount
    const perImage =
      imageTier === 'pro'
        ? MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE
        : MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE
    const pointsCost = mpPointsCostForVisualStudioImages(billable, imageTier)
    const tierLabel = imageTier === 'pro' ? '高级·GPT Image 2' : '常规·万相'
    const pointsDetail = isCarousel
      ? `${tierLabel} · ${perImage} 积分/整幅 × ${billable} 平台 = ${pointsCost} 积分（裁 5 条不另扣）`
      : `${tierLabel} · ${perImage} 积分/张 × ${billable} 张 = ${pointsCost} 积分`
    const primary = resolveChannel(activeGenerateChannels[0] ?? 'douyin')
    const unitLabel = isPlatformSeries
      ? isCarousel
        ? '张五连图'
        : '张详情图'
      : '种构图'
    if (channelCount === 1) {
      return {
        buttonLabel: isPlatformSeries ? '生成平台长图' : '一键出图',
        detail: isPlatformSeries
          ? `${primary.short} · ${variantCount} ${unitLabel}`
          : variantCount > 1
            ? `${primary.short} · ${variantCount} 种构图版式`
            : `${primary.short}`,
        total,
        pointsCost,
        pointsDetail,
      }
    }
    if (form.multiChannelPack) {
      return {
        buttonLabel: isPlatformSeries ? `生成 ${channelCount} 平台长图` : `一键出 ${channelCount} 平台套装`,
        detail: isPlatformSeries
          ? `每平台 ${variantCount} ${unitLabel} · 共 ${total} 张`
          : `每平台 ${variantCount} 种构图 · 共 ${total} 张`,
        total,
        pointsCost,
        pointsDetail,
      }
    }
    return {
      buttonLabel: isPlatformSeries ? `生成 ${variantCount} 张` : `一键出 ${variantCount} 张构图`,
      detail: `${primary.short}`,
      total,
      pointsCost,
      pointsDetail,
    }
  }, [
    activeGenerateChannels,
    form.multiChannelPack,
    imageTier,
    isCarouselFive,
    isPlatformSeries,
    perPlatformCount,
  ])
  const previewAspect = useMemo((): 'vertical' | 'horizontal' | 'square' | undefined => {
    if (platformSeries === 'platform_carousel_five') return 'horizontal'
    if (platformSeries === 'platform_detail_page') return 'vertical'
    return undefined
  }, [platformSeries])
  const activeChannel = resolveChannel(selectedPreviewChannel)
  const fieldLabels = industryProfile.fieldLabels
  const copySuggestions = useMemo(
    () => (copyOptions.length ? copyOptions : generateCopySuggestions(form)),
    [copyOptions, form.playbook, form.storeName, form.industry, form.offer],
  )

  const loadAiCopy = useCallback(async (snapshot: VisualStudioForm, opts?: { billable?: boolean }) => {
    copyAbortRef.current?.abort()
    const ac = new AbortController()
    copyAbortRef.current = ac
    if (opts?.billable) {
      const afford = await checkVisualStudioCopyAffordable()
      if (!afford.ok) {
        setCopyAiHint(afford.message)
        return
      }
    }
    setCopyAiBusy(true)
    setCopyAiHint(null)
    const r = await fetchVisualStudioCopyFromAi(snapshot, { signal: ac.signal })
    if (ac.signal.aborted) return
    setCopyAiBusy(false)
    copyAbortRef.current = null
    if (r.ok) {
      setCopyOptions(r.items)
      if (r.source === 'ai' && opts?.billable) {
        const spendKey = `vs-copy-${snapshot.playbook}-${snapshot.industry}-${Date.now()}`
        void spendVisualStudioCopyPoints({
          idempotencyKey: spendKey,
          note: snapshot.storeName.trim() || resolvePlaybook(snapshot.playbook).label,
        })
      }
      setCopyAiHint(r.source === 'ai' ? '已由 AI 模型生成文案' : null)
      return
    }
    if (r.message !== '已取消') {
      setCopyOptions(r.fallback)
      setCopyAiHint(r.message)
    }
  }, [])

  const patchForm = useCallback((patch: Partial<VisualStudioForm>) => {
    setForm((f) => ({ ...f, ...patch }))
  }, [])

  useEffect(() => {
    void (async () => {
      const r = await fetchStoresForPlatform('douyin', { page: 1, pageSize: 5 })
      const storeName = r.ok && r.items?.[0]?.name?.trim() ? r.items[0].name.trim() : ''
      if (r.ok && r.items?.length) {
        setDecorStores(r.items)
        setDecorPoiId((prev) => prev || r.items[0]?.id || '')
      }
      setForm((f) => {
        if (initRef.current) {
          return storeName && !f.storeName ? { ...f, storeName } : f
        }
        initRef.current = true
        const base = applyPlaybookToFormWithVariants(
          { ...f, storeName: f.storeName || storeName },
          f.playbook,
          { keepChannels: true, templateIndex: 0 },
        )
        void loadAiCopy(base)
        if (storeName) setStoreLoadHint(`已从抖音门店带入：${storeName}`)
        return base
      })
    })()
  }, [loadAiCopy])

  useEffect(() => {
    if (platformSeries !== 'platform_carousel_five') return
    if (decorStores.length >= 10) return
    void (async () => {
      const r = await fetchStoresForPlatform('douyin', {
        page: 1,
        pageSize: 50,
        claimScope: 'claimed',
      })
      if (r.ok && r.items?.length) {
        setDecorStores(r.items)
        setDecorPoiId((prev) => prev || r.items[0]?.id || '')
      }
    })()
  }, [platformSeries, decorStores.length])

  const toggleChannel = (id: PublishChannelId) => {
    setForm((f) => {
      const has = f.channels.includes(id)
      const channels = has
        ? f.channels.length > 1
          ? f.channels.filter((c) => c !== id)
          : f.channels
        : [...f.channels, id]
      return { ...f, channels }
    })
  }

  const changeIndustry = (ind: LocalLifeIndustryId) => {
    setForm((f) => {
      const next = applyIndustryChange(f, ind)
      void loadAiCopy(next)
      return next
    })
  }

  const changeIndustrySub = (subId: string) => {
    setForm((f) => {
      const next = applyIndustrySubChange(f, subId)
      void loadAiCopy(next)
      return next
    })
  }

  const selectPlaybook = (id: VisualPlaybookId) => {
    if (isPlatformSeriesPlaybook(id)) return
    setForm((f) => {
      // 保留五连图/详情图叠加；兼容旧数据（playbook 曾直接等于五连图）
      const series = resolveFormPlatformSeries(f)
      const next = applyPlaybookToFormWithVariants(
        { ...f, platformSeries: series },
        id,
        { keepChannels: true, templateIndex: 0 },
      )
      const merged = { ...next, playbook: id, platformSeries: series }
      void loadAiCopy(merged)
      return merged
    })
  }

  const selectPlatformSeries = (id: 'platform_carousel_five' | 'platform_detail_page') => {
    setForm((f) => {
      // 已选中再点一次 → 仅取消平台长图，保留下方场景玩法
      if (resolveFormPlatformSeries(f) === id) {
        const next = clearPlatformSeriesPlaybook(f)
        void loadAiCopy(next)
        return next
      }
      const next = applyPlatformSeriesPlaybook(f, id)
      void loadAiCopy(next)
      return next
    })
  }

  const selectPlaybookVariant = (variantId: string) => {
    setForm((f) => {
      const next = applyPlaybookVariantToForm(f, variantId)
      void loadAiCopy(next)
      return next
    })
  }

  const refreshCopy = () => {
    void loadAiCopy(form, { billable: true })
  }

  const refreshReferenceKeywords = useCallback(async () => {
    keywordsAbortRef.current?.abort()
    const ac = new AbortController()
    keywordsAbortRef.current = ac
    setKeywordsAiBusy(true)
    setKeywordsAiHint(null)
    const r = await fetchVisualStudioReferenceKeywordsFromAi(form, {
      signal: ac.signal,
      referenceAnalysis,
    })
    if (ac.signal.aborted) return
    setKeywordsAiBusy(false)
    keywordsAbortRef.current = null
    if (r.ok) {
      patchForm({ referenceKeywords: r.keywords })
      setKeywordsAiHint(r.source === 'ai' ? '已由 AI 生成参考关键词，可继续手改' : '已用本地规则生成，可继续手改')
      return
    }
    if (r.message !== '已取消') {
      patchForm({ referenceKeywords: r.fallback })
      setKeywordsAiHint(r.message)
    }
  }, [form, referenceAnalysis, patchForm])

  const applyCopy = (c: CopySuggestion) => {
    patchForm({
      headline: c.headline,
      subheadline: c.subheadline,
      offer: c.offer,
      ...(c.timeRange !== undefined ? { timeRange: c.timeRange } : {}),
      ...(c.note !== undefined ? { note: c.note } : {}),
    })
  }

  const analyzeReferenceImage = useCallback(
    async (dataUrl: string, snapshot: VisualStudioForm) => {
      refAnalyzeAbortRef.current?.abort()
      const ac = new AbortController()
      refAnalyzeAbortRef.current = ac
      setRefAnalyzeBusy(true)
      setRefAnalyzeHint('AI 正在理解参考图核心元素…')
      const res = await analyzeVisualStudioReferenceImage(dataUrl, snapshot, { signal: ac.signal })
      if (ac.signal.aborted) return
      setRefAnalyzeBusy(false)
      if (res.ok) {
        setReferenceAnalysis(res.analysis)
        setRefAnalyzeHint('已提取参考图核心元素，出图时将自动并入')
      } else {
        setReferenceAnalysis(null)
        setRefAnalyzeHint(res.message)
      }
    },
    [],
  )

  const onPickProductFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const next = [...productRefs]
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        // 压缩后再存，避免 data URL 过大导致图生图 reference_image_too_large
        const dataUrl = await compressImageFileToDataUrl(file, 1280, 0.82)
        next.push({ id: `${Date.now()}-${Math.random()}`, dataUrl, name: file.name })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '参考图处理失败'
      setRefAnalyzeHint(msg)
      return
    }
    setProductRefs(next)
    const first = next[0]?.dataUrl
    if (first) {
      void analyzeReferenceImage(first, form)
    } else {
      setReferenceAnalysis(null)
      setRefAnalyzeHint(null)
    }
  }

  const removeProductRef = (id: string) => {
    setProductRefs((prev) => {
      const next = prev.filter((x) => x.id !== id)
      if (!next.length) {
        refAnalyzeAbortRef.current?.abort()
        setReferenceAnalysis(null)
        setRefAnalyzeHint(null)
        setRefAnalyzeBusy(false)
      } else if (prev[0]?.id === id) {
        void analyzeReferenceImage(next[0]!.dataUrl, form)
      }
      return next
    })
  }

  const pickReferenceImage = () => productRefs[0]?.dataUrl

  const mapGenErrorMessage = (raw: string) => {
    const t = (raw || '').trim()
    if (/支付网关|502|504|Bad Gateway|Gateway Timeout/i.test(t)) {
      return '生图服务暂时不可用（502），请稍后重试；若刚完成部署可能是轻量 auth-api 重启中'
    }
    return t || '生图失败'
  }

  const buildJobs = (): VariantResult[] => {
    const jobs: VariantResult[] = []
    const channels = form.multiChannelPack ? form.channels : [form.channels[0] ?? 'douyin']
    const slotCount = perPlatformCount
    for (const ch of channels) {
      for (let vi = 0; vi < slotCount; vi++) {
        jobs.push({
          id: `${ch}-${vi}`,
          channelId: ch,
          variantIndex: vi,
          status: 'pending',
        })
      }
    }
    return jobs
  }

  const runGenerate = async (opts?: { refine?: string }) => {
    if (!form.headline.trim() && playbook.intent !== 'logo') {
      setError('请先填写主标题，或点「换一版文案」自动生成')
      return
    }
    if (busy) return
    const jobList = buildJobs()
    const seriesMode = resolveFormPlatformSeries(form)
    const carouselFive = seriesMode === 'platform_carousel_five'
    const billingTier: 'standard' | 'pro' = imageTier
    // 五连图：每平台只生成 1 张整幅主图再裁 5 张，按主图张数预检积分
    const billingUnits = carouselFive
      ? new Set(jobList.map((j) => j.channelId)).size
      : jobList.length

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const usePro = imageTier === 'pro'

    // 先立刻刷新按钮/方案墙；商家 JWT 由 API 门禁扣费，跳过前端预检以缩短等待
    jobList.forEach((j) => {
      j.status = 'running'
    })
    flushSync(() => {
      setBusy(true)
      setError(null)
      setProgress(
        usePro
          ? carouselFive
            ? '高级整幅生图中（目标 2～3 分钟内完成）…'
            : '高级生图中（GPT Image 2）…'
          : carouselFive
            ? '常规整幅生图中…'
            : '常规生图中…',
      )
      setVariants([...jobList])
      if (jobList[0]) {
        setSelectedPreviewChannel(jobList[0].channelId)
        setSelectedPreviewVariantId(jobList[0].id)
      }
    })

    if (readMpSessionToken()) {
      setProgress('校验积分…')
      const afford = await checkVisualStudioImageBatchAffordable(billingUnits, billingTier)
      if (!afford.ok) {
        setBusy(false)
        setProgress('')
        setVariants([])
        abortRef.current = null
        const raw = afford.message || '积分不足'
        setError(
          /支付网关|502|504|Bad Gateway|Gateway Timeout/i.test(raw)
            ? '生图服务暂时不可用（502），请稍后重试；若刚完成部署可能是轻量 auth-api 重启中'
            : raw,
        )
        return
      }
      if (ac.signal.aborted) {
        setBusy(false)
        setProgress('')
        return
      }
      setProgress(
        usePro
          ? carouselFive
            ? '高级整幅生图中（目标 2～3 分钟内完成）…'
            : '高级生图中（GPT Image 2）…'
          : carouselFive
            ? '常规整幅生图中…'
            : '常规生图中…',
      )
    }

    // 高级 GPT Image 2 暂不支持参考图；有参考图时仍走高级纯文生图（不传参考图）
    const refImage = usePro ? undefined : pickReferenceImage()
    const preferPoster = preferWanxPosterForIntent(playbook.intent)
    const refine = opts?.refine ?? refineNote

    const spendAfterImage = (job: VariantResult, ch: ReturnType<typeof resolveChannel>, usedPro: boolean) => {
      // ERP JWT 生图已由 /api/meoo-ai-agent-image 扣费；仅星选 mp 会话在此扣
      if (!readMpSessionToken()) return
      void spendVisualStudioImagePoints({
        idempotencyKey: `vs-img-${runId}-${job.id}`,
        note: `${ch.short} ${
          seriesMode
            ? resolveSeriesSlotLabel(seriesMode, job.variantIndex)
            : `方案${job.variantIndex + 1}`
        }${usedPro ? '·高级' : ''}`,
        tier: usedPro ? 'pro' : 'standard',
      })
    }

    const finishVariantFromBlob = async (
      job: VariantResult,
      blob: Blob,
      ch: ReturnType<typeof resolveChannel>,
      usedPro: boolean,
      opts?: { skipSpend?: boolean },
    ) => {
      job.status = 'done'
      try {
        if (form.delivery === 'platform') {
          const jpeg = await compressImageBlobToJpeg(blob)
          job.previewUrl = URL.createObjectURL(jpeg)
          job.fileExt = 'jpg'
        } else {
          job.previewUrl = URL.createObjectURL(blob)
          job.fileExt = 'png'
        }
      } catch {
        job.previewUrl = URL.createObjectURL(blob)
        job.fileExt = form.delivery === 'platform' ? 'jpg' : 'png'
      }
      if (!opts?.skipSpend) spendAfterImage(job, ch, usedPro)
    }

    if (carouselFive) {
      const channelIds = [...new Set(jobList.map((j) => j.channelId))]
      for (let ci = 0; ci < channelIds.length; ci++) {
        if (ac.signal.aborted) break
        const channelId = channelIds[ci]!
        const ch = resolveChannel(channelId)
        const channelJobs = jobList
          .filter((j) => j.channelId === channelId)
          .sort((a, b) => a.variantIndex - b.variantIndex)
        channelJobs.forEach((j) => {
          j.status = 'running'
        })
        setVariants([...jobList])
        setSelectedPreviewChannel(channelId)
        setSelectedPreviewVariantId(channelJobs[0]?.id ?? null)

        const masterGen = usePro
          ? platformCarouselMasterGptSize(channelId)
          : platformCarouselMasterGenSize(channelId)
        const engineLabel = usePro ? 'GPT Image 2' : '万相'
        // 本地模板即时拼 Prompt，跳过 LLM 打包等待，点击后立刻进入生图
        const prompt = buildVisualStudioPrompt(form, {
          channel: channelId,
          carouselMaster: true,
          productRefCount: productRefs.length,
          styleFromReference: productRefs.length > 0,
          referenceAnalysis,
          refineNote: refine,
        })

        setProgress(
          `${ch.short} · ${engineLabel} 整幅海报生成中（目标 ${masterGen.slideSpec.masterWidth}×${masterGen.slideSpec.masterHeight} · API ${masterGen.wanxSize}）`,
        )
        const out = await postAiAgentNativeImage(prompt, {
          exactPrompt: true,
          preferredVendor: 'qwen',
          referenceImageDataUrl: refImage,
          wanxSize: masterGen.wanxSize,
          preferWanxPosterModel: preferPoster,
          ...(usePro
            ? { imageRoute: 'tokenmix' as const, tokenmixImageModel: VISUAL_STUDIO_PRO_IMAGE_MODEL }
            : {}),
          signal: ac.signal,
        })

        if (!out.ok) {
          channelJobs.forEach((j) => {
            j.status = 'error'
            j.message = mapGenErrorMessage(out.message)
          })
          setVariants([...jobList])
          continue
        }

        const usedPro = usePro && out.channel === 'tokenmix'
        // 五连图：每平台 1 次主图计费（ERP JWT 已在 API 扣；星选 mp 在此扣一次）
        if (readMpSessionToken()) {
          void spendVisualStudioImagePoints({
            idempotencyKey: `vs-img-${runId}-carousel-${channelId}`,
            note: `${ch.short} 五连图整幅${usedPro ? '·高级' : ''}`,
            tier: usedPro ? 'pro' : 'standard',
          })
        }

        setProgress(
          `${ch.short} · 整幅等分裁切为 5 张 ${masterGen.slideSpec.slideWidth}×${masterGen.slideSpec.slideHeight}`,
        )
        try {
          const masterBlob = await fetchImageBlob(out.imageUrl)
          const strips = await sliceCarouselFiveStrips(masterBlob, masterGen.slideSpec)
          for (let si = 0; si < channelJobs.length; si++) {
            const job = channelJobs[si]!
            const strip = strips[si]
            if (!strip) {
              job.status = 'error'
              job.message = '裁切失败'
              continue
            }
            job.imageUrl = out.imageUrl
            await finishVariantFromBlob(job, strip, ch, usedPro, { skipSpend: true })
            setSelectedPreviewVariantId(job.id)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '裁切失败'
          channelJobs.forEach((j) => {
            j.status = 'error'
            j.message = msg
          })
        }
        setVariants([...jobList])
      }
    } else {
    for (let i = 0; i < jobList.length; i++) {
      if (ac.signal.aborted) break
      const job = jobList[i]!
      const ch = resolveChannel(job.channelId)
      const size = resolveAiImageSizePreset(
        resolvePlaybookSizePresetId(job.channelId, resolveFormOutputPlaybookId(form)),
      )
      job.status = 'running'
      setVariants([...jobList])
      const slotLabel = seriesMode
        ? resolveSeriesSlotLabel(seriesMode, job.variantIndex)
        : `方案 ${job.variantIndex + 1}`
      setSelectedPreviewChannel(job.channelId)
      setSelectedPreviewVariantId(job.id)
      // 本地模板即时拼 Prompt，跳过 LLM 打包等待，点击后立刻进入生图
      const prompt = buildVisualStudioPrompt(form, {
        channel: job.channelId,
        variantIndex: job.variantIndex,
        productRefCount: productRefs.length,
        styleFromReference: productRefs.length > 0,
        referenceAnalysis,
        refineNote: refine,
      })

      setProgress(
        `${ch.short} · ${slotLabel}/${perPlatformCount}（${i + 1}/${jobList.length}）· 生图中`,
      )

      const out = await postAiAgentNativeImage(prompt, {
        exactPrompt: true,
        preferredVendor: 'qwen',
        referenceImageDataUrl: refImage,
        wanxSize: size.wanxSize,
        aspectRatio: size.aspectRatio,
        doubaoSize: size.doubaoSize,
        preferWanxPosterModel: preferPoster,
        ...(usePro
          ? { imageRoute: 'tokenmix' as const, tokenmixImageModel: VISUAL_STUDIO_PRO_IMAGE_MODEL }
          : {}),
        signal: ac.signal,
      })

      if (!out.ok) {
        job.status = 'error'
        job.message = mapGenErrorMessage(out.message)
        setVariants([...jobList])
        continue
      }

      job.imageUrl = out.imageUrl
      job.status = 'done'
      const usedPro = usePro && out.channel === 'tokenmix'
      spendAfterImage(job, ch, usedPro)
      try {
        if (form.delivery === 'platform') {
          const blob = await fetchImageBlob(out.imageUrl)
          const jpeg = await compressImageBlobToJpeg(blob)
          job.previewUrl = URL.createObjectURL(jpeg)
          job.fileExt = 'jpg'
        } else {
          const png = await pngBlobFromImageUrl(out.imageUrl)
          job.previewUrl = URL.createObjectURL(png)
          job.fileExt = 'png'
        }
      } catch {
        job.previewUrl = out.imageUrl
        job.fileExt = form.delivery === 'platform' ? 'jpg' : 'png'
      }
      setVariants([...jobList])
    }
    }

    setBusy(false)
    setProgress('')
    abortRef.current = null
    const failed = jobList.filter((j) => j.status === 'error')
    if (failed.length > 0) {
      const firstMsg = failed.find((j) => j.message?.trim())?.message?.trim()
      setError(
        firstMsg
          ? `生图失败：${firstMsg}${failed.length > 1 ? `（${failed.length} 张）` : ''}`
          : `生图失败（${failed.length} 张），请稍后重试`,
      )
    }
  }

  const heroPreview = useMemo(() => {
    const done = variants.filter((v) => v.status === 'done' && v.previewUrl)
    if (selectedPreviewVariantId) {
      const picked = done.find((v) => v.id === selectedPreviewVariantId)
      if (picked?.previewUrl) return picked.previewUrl
    }
    const forChannel = done.filter((v) => v.channelId === selectedPreviewChannel)
    return (forChannel[0] ?? done[0])?.previewUrl
  }, [variants, selectedPreviewChannel, selectedPreviewVariantId])

  const downloadVariant = async (v: VariantResult) => {
    if (!v.previewUrl && !v.imageUrl) return
    const ch = resolveChannel(v.channelId)
    const ext = v.fileExt ?? 'jpg'
    const slotPart = platformSeries
      ? resolveSeriesSlotLabel(platformSeries, v.variantIndex)
      : `方案${v.variantIndex + 1}`
    const name = `${form.storeName || '门店'}-${ch.short}-${slotPart}.${ext}`.replace(/\s+/g, '-')
    if (v.previewUrl?.startsWith('blob:')) {
      triggerBlobDownload(await (await fetch(v.previewUrl)).blob(), name)
      return
    }
    if (v.imageUrl) {
      const blob =
        form.delivery === 'platform'
          ? await compressImageBlobToJpeg(await fetchImageBlob(v.imageUrl))
          : await pngBlobFromImageUrl(v.imageUrl)
      triggerBlobDownload(blob, name)
    }
  }

  const publishDouyinCarouselFive = async () => {
    setDecorMsg(null)
    if (platformSeries !== 'platform_carousel_five') {
      setDecorMsg('请先选择「五连图」并生成方案')
      return
    }
    const poiId = decorPoiId.trim()
    if (!poiId || poiId === '-') {
      setDecorMsg('请选择要装修的抖音门店')
      return
    }
    const strips = variants
      .filter((v) => v.channelId === 'douyin' && v.status === 'done' && (v.previewUrl || v.imageUrl))
      .sort((a, b) => a.variantIndex - b.variantIndex)
    if (strips.length < 5) {
      setDecorMsg(`抖音五连图需 5 张已生成图（当前 ${strips.length} 张），请先「一键出图」`)
      return
    }
    setDecorBusy(true)
    try {
      const headImages: string[] = []
      for (let i = 0; i < 5; i++) {
        const v = strips[i]!
        setDecorMsg(`上传第 ${i + 1}/5 张到图床…`)
        const src = v.imageUrl || v.previewUrl!
        const rawBlob = await fetchImageBlob(src)
        const jpeg = await compressImageBlobToJpeg(rawBlob)
        const file = new File([jpeg], `carousel-${poiId}-${i + 1}.jpg`, { type: 'image/jpeg' })
        const up = await uploadDouyinProductImage(file)
        if (!up.ok) {
          setDecorMsg(`第 ${i + 1} 张图床上传失败：${up.message}`)
          return
        }
        if (!/^https:\/\//i.test(up.url)) {
          setDecorMsg(`第 ${i + 1} 张未得到 https 公网地址（演示占位图不可用于装修）`)
          return
        }
        headImages.push(up.url)
      }
      setDecorMsg('提交抖音门店装修（五连图头图）…')
      const r = await postDouyinPoiDecorate({
        poiId,
        headImages,
        waitTask: true,
      })
      if (!r.ok) {
        setDecorMsg(r.message)
        return
      }
      const taskHint = r.taskIds.length ? `任务号 ${r.taskIds.join(',')}` : '已受理'
      setDecorMsg(`已提交：${r.message}（${taskHint}）。请在来客后台核对审核结果。`)
    } catch (e) {
      setDecorMsg(e instanceof Error ? e.message : '上传失败')
    } finally {
      setDecorBusy(false)
    }
  }

  const doneCount = variants.filter((v) => v.status === 'done').length
  const douyinCarouselReady =
    isCarouselFive &&
    variants.filter((v) => v.channelId === 'douyin' && v.status === 'done').length >= 5

  const selectedChannelSpecs = useMemo(
    () =>
      form.channels.map((id) => {
        const ch = resolveChannel(id)
        const display = resolvePlaybookSizeDisplay(id, outputPlaybookId)
        return { id, ch, display }
      }),
    [form.channels, outputPlaybookId],
  )

  return (
    <div className="relative mx-auto max-w-[1520px] pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-violet-200/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-40 h-64 w-64 rounded-full bg-cyan-200/25 blur-3xl"
      />

      {/* 顶栏 */}
      <header className="relative mb-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-md">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-violet-600">
            <Zap className="h-3.5 w-3.5" />
            本地生活 · AI 视觉
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">灵祺视觉工坊</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            从左到右：选渠道与玩法 → 编辑文案与参考图 → 右侧实时预览上屏效果
          </p>
          <p
            className="mt-2 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
            role="note"
          >
            生成后请及时保存到本地。刷新页面后，本页生成记录将消失。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-2 ring-1 ring-slate-200/60">
          <label className="pl-1 text-xs text-slate-500">业态</label>
          <select
            value={form.industry}
            disabled={busy}
            onChange={(e) => changeIndustry(e.target.value as LocalLifeIndustryId)}
            className="rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200"
          >
            {LOCAL_LIFE_INDUSTRIES.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.emoji} {ind.label}
              </option>
            ))}
          </select>
          <label className="pl-1 text-xs text-slate-500">细分类目</label>
          <select
            value={form.industrySubId}
            disabled={busy || subCategories.length === 0}
            onChange={(e) => changeIndustrySub(e.target.value)}
            className="rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200"
          >
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.label}
              </option>
            ))}
          </select>
          <input
            value={form.storeName}
            onChange={(e) => patchForm({ storeName: e.target.value })}
            disabled={busy}
            placeholder="门店名称"
            className="w-44 rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200"
          />
        </div>
      </header>

      {storeLoadHint && (
        <p className="relative mb-3 text-xs text-emerald-700">{storeLoadHint}</p>
      )}

      <div className="relative mb-5 rounded-xl border border-violet-100/80 bg-gradient-to-r from-violet-50/90 to-indigo-50/50 px-4 py-3 text-sm text-violet-900">
        <span className="font-medium">{industryScene.label}：</span>
        {industryScene.adjustHint ?? industryProfile.adjustHint}
        {industryProfile.hiddenPlaybooks?.length ? (
          <span className="ml-1 text-xs text-violet-600/80">
            （已隐藏：{industryProfile.hiddenPlaybooks.map((id) => resolvePlaybook(id).label).join('、')}）
          </span>
        ) : null}
      </div>

      {/* 主区：左+中工作区 | 右预览（独立高度，避免中间留白） */}
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 上排：配置 + 文案 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <aside className="flex flex-col gap-4">
          <StudioPanel step="1" title="发到哪个平台" subtitle="可多选，支持一键多端套装">
            <div className="flex flex-wrap gap-1.5">
              {PUBLISH_CHANNELS.map((ch) => (
                <ChannelChip
                  key={ch.id}
                  channelId={ch.id}
                  active={form.channels.includes(ch.id)}
                  disabled={busy}
                  onClick={() => toggleChannel(ch.id)}
                />
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.multiChannelPack}
                disabled={busy || isPlatformSeries}
                onChange={(e) => patchForm({ multiChannelPack: e.target.checked })}
                className="rounded border-slate-300"
              />
              一键多端套装
            </label>
            {isPlatformSeries && (
              <p className="mt-2 text-[10px] leading-relaxed text-orange-700/90">
                五连图：先按整幅尺寸生成完整海报再等分裁 5 张（美团 5000×750 / 抖音
                5625×633 / 快手 3750×422）。常规万相可直出超宽；高级 GPT Image 2
                受模型 3:1 限制会先取最大横图再中心裁切等分。详情图：三端各出 5 段竖图。
              </p>
            )}
          </StudioPanel>

          <StudioPanel
            title="本地平台长图素材"
            subtitle="可与下方场景玩法叠加 · 再点已选卡片可取消"
          >
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => selectPlatformSeries('platform_carousel_five')}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left transition-all',
                  isCarouselFive
                    ? 'border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50 shadow-sm ring-1 ring-orange-200'
                    : 'border-slate-100 bg-white hover:border-orange-200 hover:bg-orange-50/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎠</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">五连图</p>
                    <p className="text-[11px] text-slate-500">
                      美团 5000×750 / 抖音 5625×633 整幅生成 → 等分裁 5 张
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => selectPlatformSeries('platform_detail_page')}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left transition-all',
                  platformSeries === 'platform_detail_page'
                    ? 'border-violet-400 bg-gradient-to-r from-violet-50 to-indigo-50 shadow-sm ring-1 ring-violet-200'
                    : 'border-slate-100 bg-white hover:border-violet-200 hover:bg-violet-50/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📱</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">详情图</p>
                    <p className="text-[11px] text-slate-500">团购详情长图 · 5 段竖图拼接</p>
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {PLATFORM_SERIES_CHANNELS.map((cid) => (
                <ChannelChip
                  key={cid}
                  channelId={cid}
                  active={form.channels.includes(cid)}
                  disabled={busy || isPlatformSeries}
                  onClick={() => toggleChannel(cid)}
                />
              ))}
            </div>
          </StudioPanel>

          <StudioPanel
            step="2"
            title="这次想做什么"
            subtitle={
              isPlatformSeries
                ? `已叠加${isCarouselFive ? '五连图' : '详情图'} · 仍可选场景玩法`
                : '选玩法后下方可细分场景'
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {visiblePlaybooks.map((pb) => (
                <button
                  key={pb.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectPlaybook(pb.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-all',
                    form.playbook === pb.id
                      ? 'border-violet-400 bg-gradient-to-b from-violet-50 to-white shadow-sm ring-1 ring-violet-200'
                      : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white',
                  )}
                >
                  <span className="text-xl leading-none">{pb.emoji}</span>
                  <span className="text-xs font-medium text-slate-900">{pb.label}</span>
                </button>
              ))}
            </div>

            {playbookVariantConfig ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  {playbookVariantConfig.pickerLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {playbookVariantConfig.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busy}
                      onClick={() => selectPlaybookVariant(opt.id)}
                      title={opt.periodLabel}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-left transition-all',
                        form.playbookVariantId === opt.id
                          ? 'border-violet-400 bg-violet-50 text-violet-900 shadow-sm'
                          : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200',
                      )}
                    >
                      <span className="block text-[11px] font-medium">{opt.label}</span>
                      <span className="mt-0.5 block max-w-[7rem] truncate text-[10px] text-slate-400">
                        {opt.periodLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </StudioPanel>
            </aside>

            <div className="flex min-w-0 flex-col gap-4">
          <StudioPanel
            step="3"
            title="文案与风格"
            subtitle={
              activePlaybookVariant
                ? `${playbook.label} · ${activePlaybookVariant.label}`
                : playbook.label
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <input
                  value={form.headline}
                  onChange={(e) => patchForm({ headline: e.target.value })}
                  disabled={busy}
                  placeholder={fieldLabels.headline}
                  className="w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm transition focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
                <input
                  value={form.subheadline}
                  onChange={(e) => patchForm({ subheadline: e.target.value })}
                  disabled={busy}
                  placeholder={fieldLabels.subheadline}
                  className="w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm transition focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <input
                value={form.offer}
                onChange={(e) => patchForm({ offer: e.target.value })}
                disabled={busy}
                placeholder={fieldLabels.offer}
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              <input
                value={form.timeRange}
                onChange={(e) => patchForm({ timeRange: e.target.value })}
                disabled={busy}
                placeholder={fieldLabels.timeRange}
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              <input
                value={form.note}
                onChange={(e) => patchForm({ note: e.target.value })}
                disabled={busy}
                placeholder={fieldLabels.note}
                className="sm:col-span-2 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stylePresets.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  disabled={busy}
                  onClick={() => patchForm({ styleId: sp.id })}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    form.styleId === sp.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </StudioPanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <StudioPanel title="AI 文案包" subtitle="点选后同步填入上方文案">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-400">
                    手动「AI 换一版」{MP_POINTS_VISUAL_STUDIO_COPY_PER_USE} 积分/次
                  </p>
                  <button
                    type="button"
                    disabled={busy || copyAiBusy}
                    onClick={refreshCopy}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                  >
                    {copyAiBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {copyAiBusy ? '生成中…' : 'AI 换一版'}
                  </button>
                </div>
                {copyAiHint && <p className="mb-2 text-[11px] text-violet-600">{copyAiHint}</p>}
                <div className="space-y-2">
                  {copySuggestions.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={busy}
                      onClick={() => applyCopy(c)}
                      className="w-full rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50/80 to-white p-3 text-left text-sm transition hover:border-violet-200 hover:shadow-sm"
                    >
                      <p className="font-medium text-slate-900">{c.headline}</p>
                      {c.subheadline && <p className="mt-0.5 text-xs text-slate-500">{c.subheadline}</p>}
                      {c.offer && <p className="mt-1 text-xs font-semibold text-orange-600">{c.offer}</p>}
                    </button>
                  ))}
                </div>
              </StudioPanel>

              <StudioPanel
                title="参考关键词"
                subtitle="可 AI 生成或手填；与参考图一并约束出图"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-400">顿号分隔，如：烟火气、红油、特写、暖光</p>
                  <button
                    type="button"
                    disabled={busy || keywordsAiBusy}
                    onClick={() => void refreshReferenceKeywords()}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                  >
                    {keywordsAiBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {keywordsAiBusy ? '生成中…' : 'AI 生成'}
                  </button>
                </div>
                {keywordsAiHint && (
                  <p className="mb-2 text-[11px] text-violet-600">{keywordsAiHint}</p>
                )}
                <textarea
                  value={form.referenceKeywords}
                  onChange={(e) => patchForm({ referenceKeywords: e.target.value })}
                  disabled={busy}
                  rows={3}
                  placeholder="输入或点「AI 生成」参考关键词，出图时与参考图一并理解"
                  className="w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </StudioPanel>
            </div>

            <StudioPanel
              title="智能参考图"
              subtitle={referenceUploadSubtitle(form.industry, form.industrySubId)}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onPickProductFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={busy || refAnalyzeBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-4 text-sm text-slate-600 transition hover:border-violet-200 hover:bg-violet-50/30 disabled:opacity-60"
              >
                {refAnalyzeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {refAnalyzeBusy ? 'AI 理解参考图中…' : '上传参考图'}
              </button>
              {refAnalyzeHint && (
                <p className="mt-2 text-[11px] leading-relaxed text-violet-600">{refAnalyzeHint}</p>
              )}
              {referenceAnalysis && !refAnalyzeBusy && (
                <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/40 p-2.5 text-[11px] leading-relaxed text-slate-600">
                  <p>
                    <span className="font-medium text-slate-800">主体：</span>
                    {referenceAnalysis.subject}
                  </p>
                  {referenceAnalysis.elements.length > 0 && (
                    <p className="mt-1">
                      <span className="font-medium text-slate-800">核心元素：</span>
                      {referenceAnalysis.elements.slice(0, 6).join('、')}
                    </p>
                  )}
                  {referenceAnalysis.colors && (
                    <p className="mt-1">
                      <span className="font-medium text-slate-800">色调：</span>
                      {referenceAnalysis.colors}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy || refAnalyzeBusy || !productRefs[0]}
                    onClick={() => {
                      const first = productRefs[0]?.dataUrl
                      if (first) void analyzeReferenceImage(first, form)
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重新理解
                  </button>
                </div>
              )}
              {productRefs.length > 0 && (
                <p className="mt-1 text-center text-[11px] text-slate-400">已上传 {productRefs.length} 张</p>
              )}
              {productRefs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {productRefs.map((p) => (
                    <div key={p.id} className="relative">
                      <img
                        src={p.dataUrl}
                        alt=""
                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                      />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 rounded-full bg-slate-800 p-0.5 text-white shadow"
                        onClick={() => removeProductRef(p.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </StudioPanel>
          </div>

          {variants.length > 0 ? (
            <StudioPanel title="方案墙" subtitle={`已生成 ${doneCount} 张，点击切换右侧预览`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {variants.map((v) => {
                  const ch = resolveChannel(v.channelId)
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'overflow-hidden rounded-xl border bg-white shadow-sm transition',
                        v.previewUrl && selectedPreviewVariantId === v.id && 'ring-2 ring-violet-400',
                      )}
                    >
                      <button
                        type="button"
                        className="block w-full"
                        onClick={() => {
                          if (!v.previewUrl) return
                          setSelectedPreviewChannel(v.channelId)
                          setSelectedPreviewVariantId(v.id)
                        }}
                      >
                        <div
                          className={cn(
                            'flex items-center justify-center bg-slate-100',
                            isCarouselFive
                              ? 'aspect-[16/9]'
                              : platformSeries === 'platform_detail_page'
                                ? 'aspect-[9/16]'
                                : 'aspect-[3/4]',
                          )}
                        >
                          {v.status === 'running' || v.status === 'pending' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                          ) : v.status === 'error' ? (
                            <span
                              className="px-1 text-center text-[10px] leading-tight text-red-600"
                              title={v.message || '生图失败'}
                            >
                              失败
                            </span>
                          ) : v.previewUrl ? (
                            <img src={v.previewUrl} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </button>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-[10px] text-slate-500">
                          {ch.short}{' '}
                          {platformSeries
                            ? resolveSeriesSlotLabel(platformSeries, v.variantIndex)
                            : `#${v.variantIndex + 1}`}
                        </span>
                        {v.status === 'done' && (
                          <button
                            type="button"
                            onClick={() => void downloadVariant(v)}
                            className="text-slate-500 hover:text-violet-600"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </StudioPanel>
          ) : null}

          <StudioPanel
            step="4"
            title="生成与方案"
            subtitle={generatePlan.detail}
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setImageTier('standard')}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition',
                  imageTier === 'standard'
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                常规生图 · {MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分/张
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setImageTier('pro')}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition',
                  imageTier === 'pro'
                    ? 'bg-violet-700 text-white ring-violet-700'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-violet-50',
                )}
              >
                高级生图 · GPT Image 2 · {MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE} 积分/张
              </button>
            </div>
            {imageTier === 'pro' && productRefs.length > 0 && (
              <p className="mb-3 text-[11px] leading-relaxed text-amber-800">
                高级生图走 GPT Image 2 纯文生图，本次将不使用已上传的参考图。
              </p>
            )}
            {imageTier === 'pro' && isCarouselFive && (
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                高级五连图：GPT 出一整幅再裁 5 张，目标 2～3 分钟内完成；若报 502
                请等数秒重试（部署重启瞬间）。要更快可选「常规生图」。
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runGenerate()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 hover:from-slate-800 hover:to-slate-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {generatePlan.buttonLabel}
              </button>
              <select
                value={form.variantCount}
                disabled={busy || isPlatformSeries}
                onChange={(e) => patchForm({ variantCount: Number(e.target.value) as 2 | 4 })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm disabled:opacity-50"
                title="每个平台的构图版式数量"
              >
                <option value={2}>2 种构图</option>
                <option value={4}>4 种构图</option>
              </select>
              {isPlatformSeries && (
                <span className="rounded-lg bg-orange-50 px-2.5 py-2 text-xs text-orange-800 ring-1 ring-orange-100">
                  固定 5 张系列图
                </span>
              )}
              <p className="w-full text-[11px] text-slate-500">{generatePlan.pointsDetail}</p>
              <select
                value={form.delivery}
                disabled={busy}
                onChange={(e) => patchForm({ delivery: e.target.value as 'platform' | 'hd' })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              >
                <option value="platform">平台发布版</option>
                <option value="hd">高清印刷版</option>
              </select>
              {busy && (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  停止
                </button>
              )}
              {progress && (
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800">
                  {progress}
                </span>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {error}
              </p>
            )}

            {doneCount > 0 && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <p className="mb-2 text-xs font-medium text-slate-600">对话式微调</p>
                <div className="flex gap-2">
                  <input
                    value={refineNote}
                    onChange={(e) => setRefineNote(e.target.value)}
                    disabled={busy}
                    placeholder="例如：价格再大一点、背景更暖"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !refineNote.trim()}
                    onClick={() => void runGenerate({ refine: refineNote })}
                    className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    重新生成
                  </button>
                </div>
              </div>
            )}

            {variants.length === 0 && (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                生成后方案将出现在上方方案墙，可对比选优、单独下载；五连图可在下方一键上传抖音门店头图
              </p>
            )}
          </StudioPanel>
            </div>
          </div>

          {/* 下排：规格速查 + 一键上传（生成区已上移到方案墙下方） */}
          <div
            className={cn(
              'grid gap-4 lg:items-stretch',
              isCarouselFive
                ? 'lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]'
                : 'lg:grid-cols-[minmax(0,280px)]',
            )}
          >
            <StudioPanel title="发布规格速查" subtitle="当前玩法与已选渠道出图尺寸">
              <div className="mb-3 rounded-xl bg-violet-50/80 px-3 py-2.5 ring-1 ring-violet-100">
                <p className="flex items-center gap-1.5 text-sm font-medium text-violet-950">
                  <span>{playbook.emoji}</span>
                  {playbook.label}
                  {activePlaybookVariant ? (
                    <span className="text-xs font-normal text-violet-600">
                      · {activePlaybookVariant.label}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-violet-800/80">{playbook.desc}</p>
                {activePlaybookVariant ? (
                  <p className="mt-1.5 text-[11px] font-medium text-violet-600">
                    {activePlaybookVariant.periodLabel}
                  </p>
                ) : null}
              </div>
              <ul className="space-y-2">
                {selectedChannelSpecs.map(({ id, ch, display }) => (
                  <li
                    key={id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ch.color }}
                      />
                      <span className="text-xs font-semibold text-slate-800">{ch.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {display.label} · {display.pixelHint} · {display.aspectRatio}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                      {ch.publishTips[0]}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">
                {isPlatformSeries
                  ? `五连图/详情图：${form.channels.filter((c) => PLATFORM_SERIES_CHANNELS.includes(c)).length || PLATFORM_SERIES_CHANNELS.length} 个平台 × ${perPlatformCount} 张`
                  : form.multiChannelPack && form.channels.length > 1
                    ? `已开启多端套装，${form.channels.length} 个平台各出 ${form.variantCount} 种构图`
                    : `当前仅 ${resolveChannel(form.channels[0] ?? 'douyin').short} 出图`}
              </p>
            </StudioPanel>

            {isCarouselFive ? (
              <StudioPanel
                title="一键上传抖音五连图"
                subtitle="写入来客门店头图轮播（poi/decorate），不改商品。需应用已开通 life.capacity.poi.decorate"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs text-slate-600">
                    目标门店
                    <select
                      value={decorPoiId}
                      disabled={decorBusy || busy}
                      onChange={(e) => setDecorPoiId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
                    >
                      {decorStores.length === 0 ? (
                        <option value="">暂无门店（请先绑定抖音来客）</option>
                      ) : (
                        decorStores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.city ? ` · ${s.city}` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={decorBusy || busy || !douyinCarouselReady || !decorPoiId}
                    onClick={() => void publishDouyinCarouselFive()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
                  >
                    {decorBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    一键上传五连图
                  </button>
                </div>
                {!douyinCarouselReady ? (
                  <p className="mt-2 text-xs text-slate-400">
                    请先在上方生成抖音渠道 5 张五连图后再上传
                  </p>
                ) : null}
                {decorMsg ? (
                  <p
                    className={cn(
                      'mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ring-1',
                      decorMsg.startsWith('已提交')
                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                        : 'bg-amber-50 text-amber-900 ring-amber-100',
                    )}
                  >
                    {decorMsg}
                  </p>
                ) : null}
              </StudioPanel>
            ) : null}
          </div>
        </div>

        {/* 右栏：预览 + 检查（独立列，不参与左中撑高） */}
        <aside className="flex w-full shrink-0 flex-col gap-4 xl:sticky xl:top-4 xl:w-[340px]">
          <StudioPanel
            step="5"
            title="上屏预览"
            subtitle={activeChannel.publishTips[0]}
            className="bg-gradient-to-b from-white to-slate-50/80"
          >
            <div className="mb-4 flex flex-wrap gap-1">
              {form.channels.map((cid) => (
                <button
                  key={cid}
                  type="button"
                  onClick={() => {
                    setSelectedPreviewChannel(cid)
                    setSelectedPreviewVariantId(null)
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    selectedPreviewChannel === cid
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {resolveChannel(cid).short}
                </button>
              ))}
            </div>

            <div className="flex min-h-[420px] items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100/80 via-white to-violet-50/40 p-4 ring-1 ring-slate-100">
              <DevicePreview
                channelId={selectedPreviewChannel}
                previewUrl={heroPreview}
                headline={form.headline}
                empty={!busy && !heroPreview}
                previewAspect={previewAspect}
              />
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span>{form.delivery === 'platform' ? 'JPEG ≤3MB' : 'PNG 高清'}</span>
              <ChevronRight className="h-3 w-3" />
              <span>{activeChannel.label}</span>
            </div>
          </StudioPanel>

          <section className="rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/40 p-4 shadow-sm backdrop-blur-sm sm:p-5">
            <h3 className="mb-1 text-sm font-semibold text-emerald-900">上屏检查</h3>
            <p className="mb-3 text-xs text-emerald-700/80">{activeChannel.label}</p>
            <ul className="space-y-1.5">
              {activeChannel.publishTips.map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-xs leading-relaxed text-emerald-800">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {tip}
                </li>
              ))}
              <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-800">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                主标题建议 ≤12 字，价格用对比色
              </li>
              <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-800">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {form.delivery === 'platform' ? '平台版 JPEG ≤3MB' : '印刷版 PNG 高清'}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

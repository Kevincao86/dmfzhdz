import {
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../cn'
import {
  compressImageBlobToJpeg,
  fetchImageBlob,
  pngBlobFromImageUrl,
  readFileAsDataUrl,
  triggerBlobDownload,
} from '../lib/aiImageDelivery'
import {
  applyIndustryChange,
  applyIndustrySubChange,
  applyPlaybookToFormWithVariants,
  applyPlaybookVariantToForm,
  buildVisualStudioPrompt,
  DEFAULT_VISUAL_STUDIO_FORM,
  generateCopySuggestions,
  getPlaybookVariantConfig,
  getPlaybooksForIndustry,
  getSubCategoriesForIndustry,
  LOCAL_LIFE_INDUSTRIES,
  preferWanxPosterForIntent,
  publishChannelLogoSrc,
  PUBLISH_CHANNELS,
  resolveAiImageSizePreset,
  resolveChannel,
  resolveIndustryProfile,
  resolveIndustrySceneContext,
  resolvePlaybook,
  type CopySuggestion,
  type LocalLifeIndustryId,
  type PublishChannelId,
  type VisualPlaybookId,
  type VisualStudioForm,
} from '../lib/aiImageStudioPresets'
import { postAiAgentNativeImage } from '../services/ai/aiClient'
import { fetchVisualStudioCopyFromAi } from '../services/ai/visualStudioAi'
import { fetchStoresForPlatform } from '../services/merchantStoresApi'

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
          className="h-4 w-4 shrink-0 rounded-sm object-contain"
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
}: {
  channelId: PublishChannelId
  previewUrl?: string
  headline: string
  empty?: boolean
}) {
  const ch = resolveChannel(channelId)
  const isVertical = ch.primarySizeId === 'moments_vertical'
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'relative overflow-hidden rounded-[2rem] border-[5px] border-slate-800 bg-slate-900 shadow-2xl shadow-slate-400/30 ring-1 ring-white/10',
          isVertical ? 'h-[min(520px,58vh)] w-[240px]' : 'h-[220px] w-[380px]',
        )}
      >
        <div className="absolute left-1/2 top-2.5 z-10 h-1 w-16 -translate-x-1/2 rounded-full bg-slate-700" />
        <div
          className="absolute left-3 top-9 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: ch.color }}
        >
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
  const [copyOptions, setCopyOptions] = useState<CopySuggestion[]>([])
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [copyAiHint, setCopyAiHint] = useState<string | null>(null)
  const [selectedPreviewChannel, setSelectedPreviewChannel] = useState<PublishChannelId>('douyin')
  const [variants, setVariants] = useState<VariantResult[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [refineNote, setRefineNote] = useState('')
  const [storeLoadHint, setStoreLoadHint] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const copyAbortRef = useRef<AbortController | null>(null)
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
  const subCategories = useMemo(() => getSubCategoriesForIndustry(form.industry), [form.industry])
  const visiblePlaybooks = useMemo(() => getPlaybooksForIndustry(form.industry), [form.industry])
  const activeChannel = resolveChannel(selectedPreviewChannel)
  const fieldLabels = industryProfile.fieldLabels
  const copySuggestions = useMemo(
    () => (copyOptions.length ? copyOptions : generateCopySuggestions(form)),
    [copyOptions, form.playbook, form.storeName, form.industry, form.offer],
  )

  const loadAiCopy = useCallback(async (snapshot: VisualStudioForm) => {
    copyAbortRef.current?.abort()
    const ac = new AbortController()
    copyAbortRef.current = ac
    setCopyAiBusy(true)
    setCopyAiHint(null)
    const r = await fetchVisualStudioCopyFromAi(snapshot, { signal: ac.signal })
    if (ac.signal.aborted) return
    setCopyAiBusy(false)
    copyAbortRef.current = null
    if (r.ok) {
      setCopyOptions(r.items)
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
    setForm((f) => {
      const next = applyPlaybookToFormWithVariants(f, id, { keepChannels: true, templateIndex: 0 })
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
    void loadAiCopy(form)
  }

  const applyCopy = (c: CopySuggestion) => {
    patchForm({
      headline: c.headline,
      subheadline: c.subheadline,
      offer: c.offer,
      ...(c.timeRange !== undefined ? { timeRange: c.timeRange } : {}),
      ...(c.note !== undefined ? { note: c.note } : {}),
    })
  }

  const onPickProductFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const next = [...productRefs]
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      next.push({ id: `${Date.now()}-${Math.random()}`, dataUrl: await readFileAsDataUrl(file), name: file.name })
    }
    setProductRefs(next)
  }

  const pickReferenceImage = () => productRefs[0]?.dataUrl

  const buildJobs = (): VariantResult[] => {
    const jobs: VariantResult[] = []
    const channels = form.multiChannelPack ? form.channels : [form.channels[0] ?? 'douyin']
    for (const ch of channels) {
      for (let vi = 0; vi < form.variantCount; vi++) {
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
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    setError(null)
    const jobList = buildJobs()
    setVariants(jobList)

    const refImage = pickReferenceImage()
    const preferPoster = preferWanxPosterForIntent(playbook.intent)

    for (let i = 0; i < jobList.length; i++) {
      if (ac.signal.aborted) break
      const job = jobList[i]!
      const ch = resolveChannel(job.channelId)
      const size = resolveAiImageSizePreset(ch.primarySizeId)
      job.status = 'running'
      setVariants([...jobList])
      setProgress(
        `${ch.short} · 方案 ${job.variantIndex + 1}/${form.variantCount}（${i + 1}/${jobList.length}）`,
      )
      setSelectedPreviewChannel(job.channelId)

      const prompt = buildVisualStudioPrompt(form, {
        channel: job.channelId,
        variantIndex: job.variantIndex,
        productRefCount: productRefs.length,
        styleFromReference: productRefs.length > 0,
        refineNote: opts?.refine ?? refineNote,
      })

      const out = await postAiAgentNativeImage(prompt, {
        exactPrompt: true,
        referenceImageDataUrl: refImage,
        wanxSize: size.wanxSize,
        aspectRatio: size.aspectRatio,
        doubaoSize: size.doubaoSize,
        preferWanxPosterModel: preferPoster,
        signal: ac.signal,
      })

      if (!out.ok) {
        job.status = 'error'
        job.message = out.message
        setVariants([...jobList])
        continue
      }

      job.status = 'done'
      job.imageUrl = out.imageUrl
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

    setBusy(false)
    setProgress('')
    abortRef.current = null
  }

  const heroPreview = useMemo(() => {
    const done = variants.filter((v) => v.status === 'done' && v.previewUrl)
    const forChannel = done.filter((v) => v.channelId === selectedPreviewChannel)
    return (forChannel[0] ?? done[0])?.previewUrl
  }, [variants, selectedPreviewChannel])

  const downloadVariant = async (v: VariantResult) => {
    if (!v.previewUrl && !v.imageUrl) return
    const ch = resolveChannel(v.channelId)
    const ext = v.fileExt ?? 'jpg'
    const name = `${form.storeName || '门店'}-${ch.short}-方案${v.variantIndex + 1}.${ext}`.replace(/\s+/g, '-')
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

  const doneCount = variants.filter((v) => v.status === 'done').length

  const selectedChannelSpecs = useMemo(
    () =>
      form.channels.map((id) => {
        const ch = resolveChannel(id)
        const size = resolveAiImageSizePreset(ch.primarySizeId)
        return { id, ch, size }
      }),
    [form.channels],
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
                disabled={busy}
                onChange={(e) => patchForm({ multiChannelPack: e.target.checked })}
                className="rounded border-slate-300"
              />
              一键多端套装
            </label>
          </StudioPanel>

          <StudioPanel step="2" title="这次想做什么" subtitle="选玩法后下方可细分场景">
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
              {(['lively', 'premium', 'guochao', 'fresh', 'ecommerce', 'minimal'] as const).map((sid) => (
                <button
                  key={sid}
                  type="button"
                  disabled={busy}
                  onClick={() => patchForm({ styleId: sid })}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    form.styleId === sid
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {sid === 'lively'
                    ? '烟火气'
                    : sid === 'premium'
                      ? '轻奢'
                      : sid === 'guochao'
                        ? '国潮'
                        : sid === 'fresh'
                          ? '清新'
                          : sid === 'ecommerce'
                            ? '爆款'
                            : '极简'}
                </button>
              ))}
            </div>
          </StudioPanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <StudioPanel title="AI 文案包" subtitle="点选后同步填入上方文案">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  disabled={busy || copyAiBusy}
                  onClick={refreshCopy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
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

            <StudioPanel title="智能参考图" subtitle="上传商品/菜品图，AI 对齐真实质感">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onPickProductFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-4 text-sm text-slate-600 transition hover:border-violet-200 hover:bg-violet-50/30"
              >
                <ImagePlus className="h-4 w-4" />
                上传参考图
              </button>
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
                        onClick={() => setProductRefs((a) => a.filter((x) => x.id !== p.id))}
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
                        v.previewUrl && selectedPreviewChannel === v.channelId && 'ring-2 ring-violet-400',
                      )}
                    >
                      <button
                        type="button"
                        className="block w-full"
                        onClick={() => {
                          if (v.previewUrl) setSelectedPreviewChannel(v.channelId)
                        }}
                      >
                        <div className="flex aspect-[3/4] items-center justify-center bg-slate-100">
                          {v.status === 'running' || v.status === 'pending' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                          ) : v.status === 'error' ? (
                            <span className="px-1 text-[10px] text-red-600">失败</span>
                          ) : v.previewUrl ? (
                            <img src={v.previewUrl} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </button>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-[10px] text-slate-500">
                          {ch.short} #{v.variantIndex + 1}
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
            </div>
          </div>

          {/* 下排：规格速查 + 生成（与上排同列宽，紧凑衔接） */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-stretch">
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
                {selectedChannelSpecs.map(({ id, ch, size }) => (
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
                      {size.label} · {size.pixelHint} · {size.aspectRatio}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                      {ch.publishTips[0]}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">
                {form.multiChannelPack ? '已开启多端套装，各平台各出一套' : '当前仅首渠道出图'}
              </p>
            </StudioPanel>

          <StudioPanel
            step="4"
            title="生成与方案"
            subtitle="配置出图数量与格式，一键生成"
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runGenerate()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 hover:from-slate-800 hover:to-slate-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                一键出 {form.variantCount} 张方案
              </button>
              <select
                value={form.variantCount}
                disabled={busy}
                onChange={(e) => patchForm({ variantCount: Number(e.target.value) as 2 | 4 })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              >
                <option value={2}>2 张</option>
                <option value={4}>4 张（推荐）</option>
              </select>
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
                生成后方案将出现在上方方案墙，可对比选优并单独下载
              </p>
            )}
          </StudioPanel>
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
                  onClick={() => setSelectedPreviewChannel(cid)}
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

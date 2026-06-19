import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  Film,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload,
  User,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  BACKGROUND_OPTIONS,
  defaultDraft,
  deleteDigitalHumanWork,
  findPresetAvatarForDraft,
  GESTURE_PRESETS,
  loadDigitalHumanWorks,
  PRESET_AVATARS,
  SUBTITLE_STYLES,
  avatarCatalogTags,
  type AvatarNationality,
  type AvatarStyle,
  type DigitalHumanDraft,
  type DigitalHumanWork,
  type FrameMode,
  hydrateDigitalHumanWork,
  ensureDigitalHumanStorageReady,
  migrateDigitalHumanWorksStorage,
  upsertDigitalHumanWorkAsync,
  VOICE_PRESETS,
  workTitleFromDraft,
  resolveDigitalHumanPreviewScript,
  resolveVoiceForDraft,
  resolutionLabel,
  s2vResolutionFromDraft,
  voiceSettingsForAvatar,
  voiceOptionsForAvatar,
  voiceOptionsForCustomAvatar,
  customAvatarVoiceDefaults,
  matchVoicePresetForAvatar,
} from '../lib/digitalHumanBroadcast'
import { fileToAudioBlob, estimateS2vSegmentCountFromDuration, getAudioDurationSec } from '../lib/digitalHumanAudioChunks'
import { processCustomAvatarFile } from '../lib/digitalHumanCustomMedia'
import { warmSpeechVoices } from '../lib/digitalHumanTts'
import { playDigitalHumanSpeech, stopDigitalHumanSpeech } from '../lib/digitalHumanTtsPlayer'
import {
  createWorkPreviewObjectUrl,
  downloadDigitalHumanMp4,
  estimateDhS2vSegmentCount,
  persistCompletedWorkMp4,
  renderDigitalHumanMp4,
} from '../lib/digitalHumanVideoRender'
import { loadWorkMp4Blob, loadWorkCustomAudio, loadWorkProductImage, loadWorkCustomBackground } from '../lib/digitalHumanWorkBlobStore'
import { parseDouyinLinkForDigitalHuman } from '../services/digitalHumanDouyinLinkApi'
import { postAiChat } from '../services/ai/aiClient'
import { fetchVideoAiConfig } from '../services/videoAiApi'

type MainTab = 'create' | 'works'
type WizardStep = 1 | 2 | 3 | 4 | 5

const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: '选择形象' },
  { n: 2, label: '创作内容' },
  { n: 3, label: '配置参数' },
  { n: 4, label: '预览确认' },
  { n: 5, label: '提交合成' },
]

function splitScriptSegments(text: string): string[] {
  return text
    .split(/\n+|(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function DigitalHumanBroadcastPage() {
  const [mainTab, setMainTab] = useState<MainTab>('create')
  const [step, setStep] = useState<WizardStep>(1)
  const [draft, setDraft] = useState<DigitalHumanDraft>(() => defaultDraft())
  const [works, setWorks] = useState<DigitalHumanWork[]>(() => loadDigitalHumanWorks())
  const [aiTopic, setAiTopic] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiRewriteBusy, setAiRewriteBusy] = useState(false)
  const [aiMotionRewriteBusy, setAiMotionRewriteBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkSourceTitle, setLinkSourceTitle] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [avatarFilter, setAvatarFilter] = useState<'all' | AvatarStyle>('all')
  const [bodyFrameFilter, setBodyFrameFilter] = useState<'all' | FrameMode>('all')
  const [nationalityFilter, setNationalityFilter] = useState<'all' | AvatarNationality>('all')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsBusy, setTtsBusy] = useState(false)
  const [sidebarPreviewPlaying, setSidebarPreviewPlaying] = useState(false)
  const [sidebarPreviewLine, setSidebarPreviewLine] = useState<string | null>(null)
  const [cloneAudioName, setCloneAudioName] = useState<string | null>(null)
  const customNarrationBlobRef = useRef<Blob | null>(null)
  const productImageDataUrlRef = useRef<string | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const customBackgroundDataUrlRef = useRef<string | null>(null)
  const [customBackgroundPreview, setCustomBackgroundPreview] = useState<string | null>(null)
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false)
  const [productUploadBusy, setProductUploadBusy] = useState(false)
  const [backgroundUploadBusy, setBackgroundUploadBusy] = useState(false)
  const [audioUploadBusy, setAudioUploadBusy] = useState(false)
  const [renderJobId, setRenderJobId] = useState<string | null>(null)
  /** 从作品管理「再编辑」载入时复用该作品 id 重新提交 */
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [previewVideoTitle, setPreviewVideoTitle] = useState('')
  const renderInflightRef = useRef<Set<string>>(new Set())
  const submitRenderLockRef = useRef(false)
  const previewObjectUrlRef = useRef<string | null>(null)
  const [submitRenderBusy, setSubmitRenderBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const cloneInputRef = useRef<HTMLInputElement>(null)

  const selectedAvatar = useMemo(
    () => PRESET_AVATARS.find((a) => a.id === draft.avatarId) ?? null,
    [draft.avatarId],
  )
  const selectedVoice = useMemo(() => {
    return resolveVoiceForDraft(draft, selectedAvatar) ?? VOICE_PRESETS[0]
  }, [draft, selectedAvatar])

  const voiceSelectOptions = useMemo(
    () => (selectedAvatar ? voiceOptionsForAvatar(selectedAvatar) : voiceOptionsForCustomAvatar()),
    [selectedAvatar],
  )

  const filteredAvatars = useMemo(() => {
    return PRESET_AVATARS.filter((a) => {
      if (avatarFilter !== 'all' && a.style !== avatarFilter) return false
      if (bodyFrameFilter !== 'all' && a.bodyFrame !== bodyFrameFilter) return false
      if (nationalityFilter !== 'all' && a.nationality !== nationalityFilter) return false
      return true
    })
  }, [avatarFilter, bodyFrameFilter, nationalityFilter])

  const activeJob = useMemo(
    () => works.find((w) => w.id === renderJobId) ?? null,
    [works, renderJobId],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await migrateDigitalHumanWorksStorage()
      await ensureDigitalHumanStorageReady()
      const rows = loadDigitalHumanWorks()
      const hydrated = await Promise.all(
        rows.map(async (w) => {
          if (w.status !== 'completed') return w
          const blob = await loadWorkMp4Blob(w.id)
          if (!blob) {
            return { ...w, outputBlobUrl: undefined, hasLocalMp4: false }
          }
          return {
            ...w,
            hasLocalMp4: true,
            outputBlobUrl: URL.createObjectURL(blob),
          }
        }),
      )
      if (!cancelled) setWorks(hydrated)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(previewObjectUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    return () => {
      stopDigitalHumanSpeech()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    warmSpeechVoices()
    window.speechSynthesis.addEventListener('voiceschanged', warmSpeechVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warmSpeechVoices)
  }, [])

  useEffect(() => {
    stopDigitalHumanSpeech()
    setTtsPlaying(false)
    setTtsBusy(false)
    setSidebarPreviewPlaying(false)
    setSidebarPreviewLine(null)
  }, [draft.avatarId, draft.customAvatarDataUrl])

  /** 旧版通用音色 id 或形象切换后，自动对齐 21 套专属音色 */
  useEffect(() => {
    if (!selectedAvatar) return
    if (draft.voiceId === 'v-clone') return
    const paired = matchVoicePresetForAvatar(selectedAvatar)
    if (draft.voiceId === paired.id) return
    setDraft((d) => ({ ...d, ...voiceSettingsForAvatar(selectedAvatar) }))
  }, [selectedAvatar, draft.voiceId])

  const runRenderJob = useCallback(async (job: DigitalHumanWork) => {
    if (renderInflightRef.current.has(job.id)) return
    renderInflightRef.current.add(job.id)

    const mark = async (patch: Partial<DigitalHumanWork>) => {
      const current = loadDigitalHumanWorks().find((w) => w.id === job.id) ?? job
      const row: DigitalHumanWork = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      }
      await upsertDigitalHumanWorkAsync(row)
      setWorks(loadDigitalHumanWorks())
      return row
    }

    const running = await mark({ status: 'rendering', progress: 5, errorMessage: undefined })
    const hydrated = await hydrateDigitalHumanWork(running)

    const result = await renderDigitalHumanMp4(hydrated, (p) => {
      void mark({ status: 'rendering', progress: Math.min(99, p.progress) })
    })

    if (result.ok) {
      let blobUrl = result.outputMp4Url
      let hasLocalMp4 = false
      try {
        const persisted = await persistCompletedWorkMp4(job.id, result.outputBlob)
        blobUrl = persisted.blobUrl
        hasLocalMp4 = persisted.hasLocalMp4
        if (result.outputMp4Url.startsWith('blob:') && result.outputMp4Url !== blobUrl) {
          URL.revokeObjectURL(result.outputMp4Url)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '成片保存失败'
        await mark({
          status: 'failed',
          progress: 0,
          errorMessage: msg,
          previewNote: msg,
        })
        renderInflightRef.current.delete(job.id)
        if (renderJobId === job.id) setToast(msg)
        return
      }

      await mark({
        status: 'completed',
        progress: 100,
        outputMp4Url: undefined,
        outputBlobUrl: blobUrl,
        hasLocalMp4,
        videoEngine: result.engine,
        plannerModel: result.plannerModel,
        segmentCount: result.segmentCount,
        previewNote: `高清 MP4 已生成（千问口型驱动 · ${result.segmentCount} 段${result.segmentCount > 1 ? '合并' : ''} · 含口播音频）`,
      })
      if (renderJobId === job.id) setToast('高清 MP4 渲染完成，可在作品管理预览/下载')
    } else {
      await mark({
        status: 'failed',
        progress: 0,
        errorMessage: result.message,
        previewNote: result.message,
      })
      if (renderJobId === job.id) setToast(result.message)
    }

    renderInflightRef.current.delete(job.id)
  }, [renderJobId])

  useEffect(() => {
    for (const job of works) {
      if (job.status !== 'queued' && job.status !== 'rendering') continue
      if (renderInflightRef.current.has(job.id)) continue
      void runRenderJob(job)
    }
  }, [works, runRenderJob])

  const patchDraft = useCallback((p: Partial<DigitalHumanDraft>) => {
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  const refreshWorks = useCallback(() => {
    setWorks(loadDigitalHumanWorks())
  }, [])

  const generateScriptWithAi = async () => {
    const topic = aiTopic.trim()
    if (!topic) {
      setToast('请先输入主题或关键词')
      return
    }
    setAiBusy(true)
    try {
      const res = await postAiChat({
        provider: 'qwen',
        model: 'qwen-plus',
        messages: [
          {
            role: 'user',
            content: `你是本地生活商家口播脚本助手。主题：${topic}。请写一段 150～280 字的口播文案，口语化、适合短视频，分 2～4 段，不要标题和 markdown。可在段间用空行分隔。`,
          },
        ],
      })
      const text = res.content?.trim() ?? ''
      if (!text) {
        setToast('AI 未返回文案，请检查模型配置或稍后重试')
        return
      }
      patchDraft({ script: text, driveMode: 'text' })
      setToast('AI 口播脚本已生成')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'AI 生成失败')
    } finally {
      setAiBusy(false)
    }
  }

  const rewriteScriptWithAi = async () => {
    const original = draft.script.trim()
    if (original.length < 8) {
      setToast('请先填写至少 8 个字的口播原文，再使用 AI 改写')
      return
    }
    setAiRewriteBusy(true)
    try {
      const res = await postAiChat({
        provider: 'qwen',
        model: 'qwen-plus',
        messages: [
          {
            role: 'user',
            content: `你是本地生活短视频口播改写助手。请根据以下原文案改写一版新的口播正文，供数字人朗读。

要求：
1. 保留原文核心卖点、产品/门店信息与事实，不编造
2. 口语化、节奏适合 30～60 秒短视频口播
3. 长度与原文接近（约 ${Math.max(80, Math.min(400, original.length + 40))} 字），可分 2～4 段，段间可用空行
4. 不要标题、markdown、话题标签、括号说明
5. 只输出改写后的口播正文

原文案：
${original}`,
          },
        ],
      })
      const text = res.content?.trim() ?? ''
      if (!text) {
        setToast('AI 未返回改写结果，请检查模型配置或稍后重试')
        return
      }
      patchDraft({ script: text })
      setToast('AI 已改写口播文案，请核对后再下一步')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'AI 改写失败')
    } finally {
      setAiRewriteBusy(false)
    }
  }

  const rewriteMotionWithAi = async () => {
    const script = draft.script.trim()
    const original = draft.motionInstructions.trim()
    if (script.length < 8) {
      setToast('请先填写口播文案，再使用 AI 改写动作指令')
      return
    }
    if (original.length < 4) {
      setToast('请先填写至少一条动作指令，或从抖音链接抓取后再改写')
      return
    }
    setAiMotionRewriteBusy(true)
    try {
      const res = await postAiChat({
        provider: 'qwen',
        model: 'qwen-plus',
        messages: [
          {
            role: 'user',
            content: `你是数字人口播导演。请根据口播文案与现有动作指令，改写一版更专业、可执行的动作/镜头/表情时间轴。

要求：
1. 与口播节奏、手势、表情一一对应，不编造与文案无关的动作
2. 按时间轴输出，每行一条，格式如 [0-3s] 半身镜头微笑点头
3. 覆盖开场、中段强调、结尾引导互动
4. 长度与原文接近，约 ${Math.max(3, Math.min(8, original.split('\n').filter(Boolean).length + 1))} 条
5. 不要 markdown、标题、JSON，只输出动作指令正文

口播文案：
${script}

现有动作指令：
${original}`,
          },
        ],
      })
      const text = res.content?.trim() ?? ''
      if (!text) {
        setToast('AI 未返回动作指令，请检查模型配置或稍后重试')
        return
      }
      patchDraft({ motionInstructions: text })
      setToast('AI 已改写动作指令，请核对后再继续')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'AI 改写动作失败')
    } finally {
      setAiMotionRewriteBusy(false)
    }
  }

  const fetchFromDouyinLink = async () => {
    const url = draft.douyinLinkUrl.trim()
    if (!url) {
      setToast('请先粘贴抖音分享口令或链接')
      return
    }
    setLinkBusy(true)
    setLinkSourceTitle(null)
    setLinkError(null)
    try {
      const res = await parseDouyinLinkForDigitalHuman(url)
      if (!res.ok) {
        setLinkError(res.message || '链接解析失败')
        setToast(res.message || '链接解析失败')
        return
      }
      patchDraft({
        driveMode: 'link',
        script: res.script,
        motionInstructions: res.motionInstructions,
        douyinLinkUrl: res.normalizedUrl,
      })
      setLinkSourceTitle(res.sourceTitle)
      const src =
        res.scriptSource === 'asr'
          ? '已从视频音频识别口播文案'
          : '已提取口播文案'
      setToast(
        res.sourceTitle
          ? `${src}（${res.sourceTitle.slice(0, 20)}…），请核对后再下一步`
          : `${src}，请核对口播与动作指令后再下一步`,
      )
    } catch (e) {
      setToast(e instanceof Error ? e.message : '链接解析失败')
    } finally {
      setLinkBusy(false)
    }
  }

  const stopAllSpeech = () => {
    stopDigitalHumanSpeech()
    setTtsPlaying(false)
    setTtsBusy(false)
    setSidebarPreviewPlaying(false)
    setSidebarPreviewLine(null)
  }

  const speakPreviewText = async (text: string, mode: 'sidebar' | 'tts'): Promise<boolean> => {
    const trimmed = text.trim()
    if (!trimmed) {
      setToast('暂无可播放的口播内容')
      return false
    }
    setTtsBusy(true)
    const out = await playDigitalHumanSpeech(
      trimmed,
      {
        preset: selectedVoice,
        speechRate: draft.speechRate,
        speechPitch: draft.speechPitch,
        mode,
      },
      {
        onStart: (m, previewLine) => {
          setTtsBusy(false)
          if (m === 'sidebar') {
            setSidebarPreviewPlaying(true)
            setSidebarPreviewLine(previewLine)
            setTtsPlaying(false)
          } else {
            setTtsPlaying(true)
            setSidebarPreviewPlaying(false)
            setSidebarPreviewLine(null)
          }
        },
        onEnd: (m) => {
          if (m === 'sidebar') setSidebarPreviewPlaying(false)
          else setTtsPlaying(false)
          setTtsBusy(false)
        },
        onError: (m) => {
          if (m === 'sidebar') setSidebarPreviewPlaying(false)
          else setTtsPlaying(false)
          setTtsBusy(false)
        },
      },
    )
    setTtsBusy(false)
    if (!out.ok) {
      setToast(out.message ?? '语音试听失败')
      return false
    }
    if (out.source === 'browser' && selectedVoice?.cloudVoiceId) {
      const why = out.cloudFallbackReason?.trim()
      setToast(
        why
          ? `云端 MiniMax 语音未生效：${why}（已改用浏览器试听，音质偏机械）`
          : '云端 MiniMax 语音未生效，已改用浏览器试听（音质偏机械）。请确认 ECS 已部署 meoo-digital-human-tts 且运营台已保存 MiniMax Key',
      )
    }
    return true
  }

  const playSidebarPreview = () => {
    if (sidebarPreviewPlaying || ttsBusy) {
      stopAllSpeech()
      return
    }
    if (!draft.avatarId && !draft.customAvatarDataUrl) {
      setToast('请先选择数字人形象')
      return
    }
    const text = resolveDigitalHumanPreviewScript(draft, selectedAvatar)
    speakPreviewText(text, 'sidebar')
  }

  const playTtsPreview = () => {
    if (ttsPlaying || ttsBusy) {
      stopAllSpeech()
      return
    }
    const text = draft.script.trim()
    if (!text) {
      setToast('请先输入口播文案')
      return
    }
    speakPreviewText(text, 'tts')
  }

  const stopTtsPreview = () => {
    stopAllSpeech()
  }

  const canNext = (): boolean => {
    if (step === 1) return Boolean(draft.avatarId || draft.customAvatarDataUrl)
    if (step === 2) {
      if (draft.driveMode === 'audio') {
        return Boolean(draft.audioFileName && customNarrationBlobRef.current)
      }
      if (draft.driveMode === 'link') {
        return draft.script.trim().length >= 8 && draft.motionInstructions.trim().length >= 4
      }
      return draft.script.trim().length >= 8
    }
    if (step === 3) {
      if (draft.background === 'custom' && !customBackgroundDataUrlRef.current) return false
      return true
    }
    return true
  }

  const submitRender = async () => {
    if (submitRenderLockRef.current) return
    submitRenderLockRef.current = true
    setSubmitRenderBusy(true)
    try {
    await ensureDigitalHumanStorageReady()
    const cfg = await fetchVideoAiConfig()
    if (cfg?.configLoadError) {
      setToast(`视频 AI 配置拉取失败：${cfg.configLoadError}`)
      return
    }
    if (!cfg?.qwenVideoConfigured && !cfg?.longformPlanner?.qwen && !cfg?.klingConfigured) {
      setToast('未配置视频生成：请在运营台配置通义千问 Key 后重试')
      return
    }

    const reuseId = editingWorkId?.trim() || null
    const prev = reuseId ? loadDigitalHumanWorks().find((w) => w.id === reuseId) : null
    const scriptKey = draft.script.trim()
    const titleNow = workTitleFromDraft(draft)
    const inflight = loadDigitalHumanWorks().find(
      (w) =>
        (w.status === 'queued' || w.status === 'rendering') &&
        w.title === titleNow &&
        w.draft.script.trim() === scriptKey,
    )
    if (inflight && !reuseId) {
      setRenderJobId(inflight.id)
      setToast('相同口播已在队列中渲染，请勿重复提交')
      return
    }
    const id =
      reuseId ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `dh-${crypto.randomUUID()}`
        : `dh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)
    if (prev?.outputBlobUrl?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev.outputBlobUrl)
      } catch {
        /* ignore */
      }
    }
    const row: DigitalHumanWork = {
      id,
      title: workTitleFromDraft(draft),
      status: 'queued',
      progress: 0,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: { ...draft },
      hasLocalCustomAvatar: Boolean(draft.customAvatarDataUrl?.trim()) || Boolean(prev?.hasLocalCustomAvatar),
      hasLocalCustomAudio:
        draft.driveMode === 'audio' &&
        (Boolean(customNarrationBlobRef.current) || Boolean(prev?.hasLocalCustomAudio)),
      hasLocalProductImage:
        Boolean(productImageDataUrlRef.current) || Boolean(prev?.hasLocalProductImage),
      hasLocalCustomBackground:
        draft.background === 'custom' &&
        (Boolean(customBackgroundDataUrlRef.current) || Boolean(prev?.hasLocalCustomBackground)),
      errorMessage: undefined,
      previewNote: undefined,
      outputMp4Url: undefined,
      outputBlobUrl: undefined,
      videoEngine: undefined,
      plannerModel: undefined,
      segmentCount: undefined,
    }
    await upsertDigitalHumanWorkAsync(row, {
      customAudioBlob: draft.driveMode === 'audio' ? customNarrationBlobRef.current : null,
      productImageDataUrl: draft.productOverlayEnabled ? productImageDataUrlRef.current : null,
      customBackgroundDataUrl:
        draft.background === 'custom' ? customBackgroundDataUrlRef.current : null,
    })
    setEditingWorkId(null)
    setWorks(loadDigitalHumanWorks())
    setRenderJobId(id)
    const segs =
      draft.driveMode === 'audio' && customNarrationBlobRef.current
        ? estimateS2vSegmentCountFromDuration(
            await getAudioDurationSec(customNarrationBlobRef.current).catch(() => 18),
          )
        : estimateDhS2vSegmentCount(draft.script)
    setToast(
      reuseId
        ? segs > 1
          ? `已重新提交渲染（分 ${segs} 段生成后合并）`
          : '已重新提交高清 MP4 渲染'
        : segs > 1
          ? `已提交渲染（口播较长，将分 ${segs} 段生成后合并为 MP4）`
          : '已提交高清 MP4 渲染（千问口型驱动）',
    )
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : '提交失败：浏览器存储已满，请在「作品管理」删除旧作品后重试'
      setToast(msg)
    } finally {
      submitRenderLockRef.current = false
      setSubmitRenderBusy(false)
    }
  }

  const loadWorkForEdit = async (w: DigitalHumanWork) => {
    const hydrated = await hydrateDigitalHumanWork(w)
    setDraft({ ...defaultDraft(), ...hydrated.draft })
    if (hydrated.draft.driveMode === 'audio' && hydrated.hasLocalCustomAudio) {
      customNarrationBlobRef.current = await loadWorkCustomAudio(hydrated.id)
    } else {
      customNarrationBlobRef.current = null
    }
    if (hydrated.hasLocalProductImage || hydrated.draft.productOverlayEnabled) {
      const img = await loadWorkProductImage(hydrated.id)
      productImageDataUrlRef.current = img
      setProductImagePreview(img)
    } else {
      productImageDataUrlRef.current = null
      setProductImagePreview(null)
    }
    if (hydrated.draft.background === 'custom' && hydrated.hasLocalCustomBackground) {
      const bg = await loadWorkCustomBackground(hydrated.id)
      customBackgroundDataUrlRef.current = bg
      setCustomBackgroundPreview(bg)
    } else {
      customBackgroundDataUrlRef.current = null
      setCustomBackgroundPreview(null)
    }
    setEditingWorkId(w.id)
    setRenderJobId(null)
    setMainTab('create')
    setStep(2)
    setToast(`已载入作品「${w.title}」继续编辑，完成后可重新提交渲染`)
  }

  const closePreviewVideo = useCallback(() => {
    setPreviewVideoUrl(null)
    if (previewObjectUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }, [])

  const previewWork = useCallback(
    async (w: DigitalHumanWork) => {
      if (w.status !== 'completed') {
        setToast('渲染完成后可预览')
        return
      }
      stopAllSpeech()
      if (previewObjectUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(previewObjectUrlRef.current)
        previewObjectUrlRef.current = null
      }

      const videoUrl = await createWorkPreviewObjectUrl(w)
      if (videoUrl) {
        if (videoUrl.startsWith('blob:')) previewObjectUrlRef.current = videoUrl
        setPreviewVideoTitle(w.title)
        setPreviewVideoUrl(videoUrl)
        return
      }

      const avatar = findPresetAvatarForDraft(w.draft)
      const voice = resolveVoiceForDraft(w.draft, avatar)
      const text = resolveDigitalHumanPreviewScript(w.draft, avatar)
      setTtsBusy(true)
      const out = await playDigitalHumanSpeech(
        text,
        {
          preset: voice,
          speechRate: w.draft.speechRate,
          speechPitch: w.draft.speechPitch,
          mode: 'tts',
        },
        {
          onStart: () => {
            setTtsBusy(false)
            setTtsPlaying(true)
          },
          onEnd: () => {
            setTtsPlaying(false)
            setTtsBusy(false)
          },
          onError: () => {
            setTtsPlaying(false)
            setTtsBusy(false)
          },
        },
      )
      setTtsBusy(false)
      if (!out.ok) {
        setToast(out.message ?? '预览播放失败')
        return
      }
      setToast('本地成片已过期，已播放口播试听。请点击「再编辑」重新提交渲染。')
    },
    [],
  )

  const downloadWork = useCallback(async (w: DigitalHumanWork) => {
    if (w.status !== 'completed') {
      setToast('渲染完成后可下载')
      return
    }
    const r = await downloadDigitalHumanMp4(w)
    if (!r.ok) setToast(r.message ?? '下载失败')
    else setToast('高清 MP4 下载已开始')
  }, [])

  const renderAvatarPreview = (large = false, animated = false) => {
    const box = cn(
      'relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/20 shadow-inner',
      large ? 'aspect-[9/16] max-h-[420px] w-full max-w-[240px]' : 'aspect-[9/16] w-[84px]',
      animated && 'dh-preview-live border-violet-400/60',
    )
    if (draft.customAvatarDataUrl) {
      return (
        <div className={box}>
          <img
            src={draft.customAvatarDataUrl}
            alt=""
            className={cn('h-full w-full object-contain', animated && 'dh-preview-live-img')}
          />
        </div>
      )
    }
    if (selectedAvatar) {
      const inner = selectedAvatar.previewUrl ? (
        <img
          src={selectedAvatar.previewUrl}
          alt={selectedAvatar.name}
          referrerPolicy="no-referrer"
          decoding="async"
          width={1080}
          height={1920}
          className={cn(
            'h-full w-full object-cover',
            selectedAvatar.bodyFrame === 'full' ? 'object-center' : 'object-top',
            animated && 'dh-preview-live-img',
          )}
        />
      ) : (
        <User className={large ? 'h-20 w-20 opacity-90' : 'h-10 w-10 opacity-90'} />
      )
      return (
        <div className={cn(box, selectedAvatar.previewUrl ? 'bg-slate-900' : cn('bg-gradient-to-br text-white', selectedAvatar.gradient))}>
          {inner}
          <span className="absolute bottom-2 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-6 text-center text-xs font-medium text-white">
            {selectedAvatar.name}
          </span>
        </div>
      )
    }
    return (
      <div className={cn(box, 'bg-slate-200 text-slate-400')}>
        <User className="h-10 w-10" />
      </div>
    )
  }

  return (
    <div className="digital-human-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span
            className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500"
            aria-hidden
          />
          <h1 className="erp-page-title">数字人口播</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            形象管理 · 口播文案 · 高清 MP4（千问 wan2.2-s2v 口型驱动；超长自动分段合并）· 作品库。
          </p>
        </div>
        <div className="flex rounded-xl border border-slate-200/90 bg-white/80 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMainTab('create')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'create' ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            创作流程
          </button>
          <button
            type="button"
            onClick={() => {
              refreshWorks()
              setMainTab('works')
            }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'works' ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            作品管理
          </button>
        </div>
      </div>

      {toast ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm text-cyan-900">
          {toast}
        </div>
      ) : null}

      {mainTab === 'works' ? (
        <WorksPanel
          works={works}
          onRefresh={refreshWorks}
          onEdit={loadWorkForEdit}
          onDelete={deleteDigitalHumanWork}
          onPreview={(w) => void previewWork(w)}
          onDownload={(w) => void downloadWork(w)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(s.n)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition',
                    step === s.n
                      ? 'bg-violet-600 text-white'
                      : step > s.n
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </button>
                <span className={cn('text-sm', step === s.n ? 'font-semibold text-slate-900' : 'text-slate-500')}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 ? <ArrowRight className="mx-1 h-4 w-4 text-slate-300" /> : null}
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-sm">
              {step === 1 ? (
                <section className="space-y-6">
                  <h2 className="text-lg font-semibold text-slate-900">数字人形象</h2>
                  <p className="text-sm text-slate-600">
                    预置形象为竖版 9:16 高清构图（1080×1920）。半身/全身按标签展示；追求更清晰成片可用「照片驱动」上传正面竖照。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['preset', 'photo', 'video_clone'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => patchDraft({ avatarKind: k })}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm',
                          draft.avatarKind === k
                            ? 'bg-violet-100 font-medium text-violet-800'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {k === 'preset' ? '形象库' : k === 'photo' ? '照片驱动' : '视频克隆'}
                      </button>
                    ))}
                  </div>

                  {draft.avatarKind === 'preset' ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {(
                          [
                            ['all', '全部'],
                            ['realistic', '真人'],
                            ['cartoon', '卡通'],
                          ] as const
                        ).map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setAvatarFilter(k)}
                            className={cn(
                              'rounded-lg px-3 py-1 text-xs font-medium',
                              avatarFilter === k
                                ? 'bg-slate-800 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                        <span className="mx-1 text-slate-300">|</span>
                        {(
                          [
                            ['all', '构图'],
                            ['half', '半身'],
                            ['full', '全身'],
                          ] as const
                        ).map(([k, label]) => (
                          <button
                            key={`frame-${k}`}
                            type="button"
                            onClick={() => setBodyFrameFilter(k)}
                            className={cn(
                              'rounded-lg px-3 py-1 text-xs font-medium',
                              bodyFrameFilter === k
                                ? 'bg-violet-700 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                        <span className="mx-1 text-slate-300">|</span>
                        {(
                          [
                            ['all', '人种'],
                            ['cn', '中国人'],
                            ['intl', '外国人'],
                          ] as const
                        ).map(([k, label]) => (
                          <button
                            key={`nat-${k}`}
                            type="button"
                            onClick={() => setNationalityFilter(k)}
                            className={cn(
                              'rounded-lg px-3 py-1 text-xs font-medium',
                              nationalityFilter === k
                                ? 'bg-teal-700 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                        <span className="text-xs text-slate-400">共 {filteredAvatars.length} 个形象</span>
                      </div>
                      <div className="grid max-h-[620px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                        {filteredAvatars.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            onClick={() =>
                              patchDraft({
                                avatarId: av.id,
                                customAvatarDataUrl: null,
                                frameMode: av.bodyFrame,
                                ...voiceSettingsForAvatar(av),
                              })
                            }
                            className={cn(
                              'rounded-xl border p-2 text-left transition hover:shadow-md',
                              draft.avatarId === av.id
                                ? 'border-violet-400 ring-2 ring-violet-200'
                                : 'border-slate-200',
                            )}
                          >
                            <div className="relative mb-2 aspect-[9/16] overflow-hidden rounded-lg bg-slate-900">
                              {av.previewUrl ? (
                                <img
                                  src={av.previewUrl}
                                  alt={av.name}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  decoding="async"
                                  width={1080}
                                  height={1920}
                                  className="h-full w-full object-cover object-top"
                                />
                              ) : (
                                <div
                                  className={cn(
                                    'flex h-full items-center justify-center bg-gradient-to-br text-white',
                                    av.gradient,
                                  )}
                                >
                                  <User className="h-8 w-8" />
                                </div>
                              )}
                            </div>
                            <p className="truncate font-medium text-slate-900">{av.name}</p>
                            <p className="truncate text-xs text-slate-500">{avatarCatalogTags(av)}</p>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/*,video/mp4,video/quicktime,video/webm"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          void (async () => {
                            setAvatarUploadBusy(true)
                            try {
                              const dataUrl = await processCustomAvatarFile(f)
                              patchDraft({
                                customAvatarDataUrl: dataUrl,
                                avatarId: null,
                                avatarKind: f.type.startsWith('video/') ? 'video_clone' : 'photo',
                                ...customAvatarVoiceDefaults(),
                              })
                              setToast('自定义形象已上传，可进行口播合成')
                            } catch (err) {
                              setToast(err instanceof Error ? err.message : '人像上传失败')
                            } finally {
                              setAvatarUploadBusy(false)
                              e.target.value = ''
                            }
                          })()
                        }}
                      />
                      <Upload className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-2 text-sm text-slate-600">
                        上传 {draft.avatarKind === 'photo' ? '正面照片' : '参考视频'} 生成专属分身
                      </p>
                      <p className="mt-1 text-xs text-slate-500">建议竖版 JPG/PNG ≥1080×1920；视频将自动截取首帧</p>
                      <button
                        type="button"
                        disabled={avatarUploadBusy}
                        onClick={() => photoInputRef.current?.click()}
                        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        {avatarUploadBusy ? '处理中…' : '选择文件'}
                      </button>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 text-slate-600">服装</span>
                      <select
                        value={draft.outfit}
                        onChange={(e) => patchDraft({ outfit: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {['商务正装', '休闲', '门店工装', '节日主题'].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 text-slate-600">发型</span>
                      <select
                        value={draft.hairstyle}
                        onChange={(e) => patchDraft({ hairstyle: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {['默认', '短发', '长发', '盘发'].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 text-slate-600">站位</span>
                      <select
                        value={draft.frameMode}
                        onChange={(e) => patchDraft({ frameMode: e.target.value as 'full' | 'half' })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="half">半身</option>
                        <option value="full">全身</option>
                      </select>
                      {draft.frameMode === 'full' && draft.avatarKind === 'preset' && selectedAvatar?.bodyFrame === 'half' ? (
                        <p className="mt-1 text-xs text-amber-700">
                          当前预置为半身构图；全身站位请筛选「全身」形象，或使用「照片驱动」上传完整身形竖版照片。
                        </p>
                      ) : null}
                      {draft.frameMode === 'half' && draft.avatarKind === 'preset' && selectedAvatar?.bodyFrame === 'full' ? (
                        <p className="mt-1 text-xs text-amber-700">
                          当前预置为全身构图；半身站位请筛选「半身」形象。
                        </p>
                      ) : null}
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 text-slate-600">输出分辨率</span>
                      <select
                        value={s2vResolutionFromDraft(draft)}
                        onChange={(e) =>
                          patchDraft({ resolution: e.target.value as DigitalHumanDraft['resolution'] })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="720P">720P（推荐高清）</option>
                        <option value="480P">480P（省算力，略糊）</option>
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        千问 wan2.2-s2v 最高支持 720P；自定义照片建议竖版 ≥1080×1920 更清晰。
                      </p>
                    </label>
                  </div>
                </section>
              ) : null}

              {step === 2 ? (
                <section className="space-y-5">
                  <h2 className="text-lg font-semibold text-slate-900">口播内容</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => patchDraft({ driveMode: 'link' })}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm',
                        draft.driveMode === 'link' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100',
                      )}
                    >
                      链接驱动
                    </button>
                    <button
                      type="button"
                      onClick={() => patchDraft({ driveMode: 'text' })}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm',
                        draft.driveMode === 'text' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100',
                      )}
                    >
                      文本驱动
                    </button>
                    <button
                      type="button"
                      onClick={() => patchDraft({ driveMode: 'audio' })}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm',
                        draft.driveMode === 'audio' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100',
                      )}
                    >
                      音频驱动
                    </button>
                  </div>

                  {draft.driveMode === 'link' ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                        <p className="text-sm font-medium text-violet-900">抖音短视频 · 链接驱动</p>
                        <p className="mt-1 text-xs text-violet-700">
                          直接粘贴抖音「分享」复制的<strong>整段口令</strong>即可，系统会自动识别其中的链接；再从视频音频识别口播（通义 ASR），不会使用发布标题，并推断动作指令。请核对后再点「下一步」。
                        </p>
                        <p className="mt-1 text-xs text-violet-600">
                          注意：须在<strong>视频播放页</strong>点分享（勿用搜索页「查看TA的更多作品」类口令，该类链接指向达人主页，无法提取口播）。
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            value={draft.douyinLinkUrl}
                            onChange={(e) => patchDraft({ douyinLinkUrl: e.target.value })}
                            placeholder="粘贴抖音分享口令（含「复制打开抖音」整段文案）"
                            className="min-w-[240px] flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            disabled={linkBusy}
                            onClick={() => void fetchFromDouyinLink()}
                            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                            抓取文案
                          </button>
                        </div>
                        {linkError ? (
                          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                            {linkError}
                          </p>
                        ) : null}
                        {linkSourceTitle ? (
                          <p className="mt-2 text-xs text-slate-600">来源：{linkSourceTitle}</p>
                        ) : null}
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">口播文案</span>
                          <button
                            type="button"
                            disabled={aiRewriteBusy || draft.script.trim().length < 8}
                            onClick={() => void rewriteScriptWithAi()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {aiRewriteBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            AI 改写文案
                          </button>
                        </span>
                        <textarea
                          value={draft.script}
                          onChange={(e) => patchDraft({ script: e.target.value })}
                          rows={6}
                          placeholder="抓取成功后在此编辑口播文案"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">动作指令</span>
                          <button
                            type="button"
                            disabled={
                              aiMotionRewriteBusy ||
                              draft.script.trim().length < 8 ||
                              draft.motionInstructions.trim().length < 4
                            }
                            onClick={() => void rewriteMotionWithAi()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {aiMotionRewriteBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            AI 改写动作
                          </button>
                        </span>
                        <textarea
                          value={draft.motionInstructions}
                          onChange={(e) => patchDraft({ motionInstructions: e.target.value })}
                          rows={5}
                          placeholder="按时间轴描述手势、表情、走位等，例如：0:00 微笑挥手 · 0:05 指向产品"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-xs leading-relaxed"
                        />
                      </label>
                      <p className="text-xs text-slate-500">
                        已分段 {splitScriptSegments(draft.script).length} 段 · 约 {draft.script.length} 字
                      </p>
                    </div>
                  ) : draft.driveMode === 'text' ? (
                    <>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">口播文案</span>
                        <button
                          type="button"
                          disabled={aiRewriteBusy || draft.script.trim().length < 8}
                          onClick={() => void rewriteScriptWithAi()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {aiRewriteBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="h-3.5 w-3.5" />
                          )}
                          AI 改写文案
                        </button>
                      </div>
                      <textarea
                        value={draft.script}
                        onChange={(e) => patchDraft({ script: e.target.value })}
                        rows={8}
                        placeholder="输入或粘贴口播文案。换行可分段；句号后可标记停顿。"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed"
                      />
                      <p className="text-xs text-slate-500">
                        已分段 {splitScriptSegments(draft.script).length} 段 · 约 {draft.script.length} 字
                      </p>
                      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-4">
                        <label className="flex-1 text-sm">
                          <span className="mb-1 block text-slate-600">AI 文案 · 主题/关键词</span>
                          <input
                            value={aiTopic}
                            onChange={(e) => setAiTopic(e.target.value)}
                            placeholder="例：春季新品团购、门店周年庆"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={aiBusy}
                          onClick={() => void generateScriptWithAi()}
                          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          AI 生成脚本
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          void (async () => {
                            setAudioUploadBusy(true)
                            try {
                              const blob = await fileToAudioBlob(f)
                              customNarrationBlobRef.current = blob
                              patchDraft({ audioFileName: f.name, driveMode: 'audio' })
                              setToast('口播音频已上传，提交后将直接驱动口型')
                            } catch (err) {
                              customNarrationBlobRef.current = null
                              setToast(err instanceof Error ? err.message : '音频上传失败')
                            } finally {
                              setAudioUploadBusy(false)
                              e.target.value = ''
                            }
                          })()
                        }}
                      />
                      <Mic className="mx-auto h-8 w-8 text-violet-500" />
                      <p className="mt-2 text-sm text-slate-600">上传已录制口播音频（MP3/WAV/M4A）</p>
                      {draft.audioFileName ? (
                        <p className="mt-1 text-sm font-medium text-emerald-700">{draft.audioFileName}</p>
                      ) : null}
                      <button
                        type="button"
                        disabled={audioUploadBusy}
                        onClick={() => audioInputRef.current?.click()}
                        className="mt-3 rounded-lg border border-violet-300 px-4 py-2 text-sm text-violet-700 disabled:opacity-60"
                      >
                        {audioUploadBusy ? '读取中…' : '选择音频'}
                      </button>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-800">
                      语音合成（TTS）与克隆
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        试听优先 MiniMax 神经语音，与形象性别绑定
                      </span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">音色</span>
                        <select
                          value={draft.voiceId}
                          onChange={(e) => patchDraft({ voiceId: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2"
                          disabled={draft.driveMode === 'audio'}
                        >
                          {voiceSelectOptions.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                              {v.dialect ? ` · ${v.dialect}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end gap-2">
                        <button
                          type="button"
                          onClick={ttsPlaying || ttsBusy ? stopTtsPreview : playTtsPreview}
                          disabled={draft.driveMode === 'audio' || (!draft.script.trim() && !ttsPlaying && !ttsBusy)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-50"
                        >
                          {ttsBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : ttsPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                          {ttsBusy ? '合成中…' : ttsPlaying ? '停止试听' : 'TTS 试听'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        ref={cloneInputRef}
                        type="file"
                        accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          void (async () => {
                            try {
                              await fileToAudioBlob(f)
                              setCloneAudioName(f.name)
                              patchDraft({ voiceId: 'v-clone' })
                              setToast(
                                '克隆样本已记录。合成时将使用相近系统音色（完整 MiniMax 克隆即将上线）',
                              )
                            } catch (err) {
                              setToast(err instanceof Error ? err.message : '语音样本无效')
                            } finally {
                              e.target.value = ''
                            }
                          })()
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => cloneInputRef.current?.click()}
                        className="text-sm text-violet-600 underline-offset-2 hover:underline"
                      >
                        上传样本 · 语音克隆
                      </button>
                      {cloneAudioName ? (
                        <span className="text-xs text-slate-500">{cloneAudioName}</span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        语速 {draft.speechRate.toFixed(2)}
                        <input
                          type="range"
                          min={0.6}
                          max={1.4}
                          step={0.05}
                          value={draft.speechRate}
                          onChange={(e) => patchDraft({ speechRate: Number(e.target.value) })}
                          className="mt-1 w-full"
                        />
                      </label>
                      <label className="text-sm">
                        音调 {draft.speechPitch.toFixed(2)}
                        <input
                          type="range"
                          min={0.7}
                          max={1.3}
                          step={0.05}
                          value={draft.speechPitch}
                          onChange={(e) => patchDraft({ speechPitch: Number(e.target.value) })}
                          className="mt-1 w-full"
                        />
                      </label>
                    </div>
                  </div>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">合成参数</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      背景
                      <select
                        value={draft.background}
                        onChange={(e) => {
                          const v = e.target.value
                          patchDraft({
                            background: v,
                            greenScreen: v === 'green',
                            customBackgroundFileName: v === 'custom' ? draft.customBackgroundFileName : null,
                          })
                          if (v !== 'custom') {
                            customBackgroundDataUrlRef.current = null
                            setCustomBackgroundPreview(null)
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {BACKGROUND_OPTIONS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                      {draft.background === 'custom' ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
                          <p className="text-xs text-slate-500">
                            上传门店实景、品牌场景等竖版图片（JPG/PNG），合成时将作为口型驱动前的场景背景。
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <input
                              ref={backgroundInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (!f) return
                                void (async () => {
                                  setBackgroundUploadBusy(true)
                                  try {
                                    if (!f.type.startsWith('image/')) {
                                      throw new Error('暂仅支持图片背景，请上传 JPG/PNG')
                                    }
                                    if (f.size > 12 * 1024 * 1024) {
                                      throw new Error('背景图过大，请压缩至 12MB 以内')
                                    }
                                    const dataUrl = await new Promise<string>((resolve, reject) => {
                                      const r = new FileReader()
                                      r.onload = () =>
                                        typeof r.result === 'string'
                                          ? resolve(r.result)
                                          : reject(new Error('读取失败'))
                                      r.onerror = () => reject(new Error('读取失败'))
                                      r.readAsDataURL(f)
                                    })
                                    customBackgroundDataUrlRef.current = dataUrl
                                    setCustomBackgroundPreview(dataUrl)
                                    patchDraft({ customBackgroundFileName: f.name })
                                    setToast('自定义背景已上传')
                                  } catch (err) {
                                    setToast(err instanceof Error ? err.message : '背景图上传失败')
                                  } finally {
                                    setBackgroundUploadBusy(false)
                                    e.target.value = ''
                                  }
                                })()
                              }}
                            />
                            {customBackgroundPreview ? (
                              <img
                                src={customBackgroundPreview}
                                alt="背景预览"
                                className="h-20 w-14 rounded-lg border border-slate-200 object-cover"
                              />
                            ) : null}
                            <button
                              type="button"
                              disabled={backgroundUploadBusy}
                              onClick={() => backgroundInputRef.current?.click()}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                            >
                              <Upload className="h-4 w-4" />
                              {backgroundUploadBusy
                                ? '上传中…'
                                : draft.customBackgroundFileName || customBackgroundPreview
                                  ? '更换背景图'
                                  : '上传背景图'}
                            </button>
                            {draft.customBackgroundFileName ? (
                              <span className="truncate text-xs text-slate-500">
                                {draft.customBackgroundFileName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </label>
                    <label className="text-sm">
                      手势动作
                      <select
                        value={draft.gesturePreset}
                        onChange={(e) => patchDraft({ gesturePreset: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {GESTURE_PRESETS.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      字幕样式
                      <select
                        value={draft.subtitleStyle}
                        onChange={(e) => patchDraft({ subtitleStyle: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                        disabled={!draft.subtitleEnabled}
                      >
                        {SUBTITLE_STYLES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 pt-6 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.subtitleEnabled}
                        onChange={(e) => patchDraft({ subtitleEnabled: e.target.checked })}
                      />
                      自动生成 SRT 字幕并烧录
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.multiScene}
                        onChange={(e) => patchDraft({ multiScene: e.target.checked })}
                      />
                      多场景拼接（同片切换背景/镜头）
                    </label>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={draft.productOverlayEnabled}
                        onChange={(e) => {
                          const on = e.target.checked
                          patchDraft({
                            productOverlayEnabled: on,
                            productImageFileName: on ? draft.productImageFileName : null,
                          })
                          if (!on) {
                            productImageDataUrlRef.current = null
                            setProductImagePreview(null)
                          }
                        }}
                      />
                      手持产品展示（成片叠加产品图）
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      上传透明底或白底 PNG/JPG，系统将叠加在数字人胸前区域（需服务端 ffmpeg）。
                    </p>
                    {draft.productOverlayEnabled ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <input
                          ref={productInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            void (async () => {
                              setProductUploadBusy(true)
                              try {
                                if (!f.type.startsWith('image/')) {
                                  throw new Error('请上传 PNG/JPG 产品图')
                                }
                                if (f.size > 8 * 1024 * 1024) {
                                  throw new Error('产品图过大，请压缩至 8MB 以内')
                                }
                                const dataUrl = await new Promise<string>((resolve, reject) => {
                                  const r = new FileReader()
                                  r.onload = () =>
                                    typeof r.result === 'string'
                                      ? resolve(r.result)
                                      : reject(new Error('读取失败'))
                                  r.onerror = () => reject(new Error('读取失败'))
                                  r.readAsDataURL(f)
                                })
                                productImageDataUrlRef.current = dataUrl
                                setProductImagePreview(dataUrl)
                                patchDraft({ productImageFileName: f.name })
                                setToast('产品图已上传，提交渲染后将叠加到成片')
                              } catch (err) {
                                setToast(err instanceof Error ? err.message : '产品图上传失败')
                              } finally {
                                setProductUploadBusy(false)
                                e.target.value = ''
                              }
                            })()
                          }}
                        />
                        {productImagePreview ? (
                          <img
                            src={productImagePreview}
                            alt="产品预览"
                            className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain"
                          />
                        ) : null}
                        <button
                          type="button"
                          disabled={productUploadBusy}
                          onClick={() => productInputRef.current?.click()}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                        >
                          {productUploadBusy
                            ? '上传中…'
                            : draft.productImageFileName || productImagePreview
                              ? '更换产品图'
                              : '上传产品图'}
                        </button>
                        {draft.productImageFileName ? (
                          <span className="truncate text-xs text-slate-500">{draft.productImageFileName}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {draft.driveMode === 'link' && draft.motionInstructions.trim() ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                      <label className="block text-sm">
                        <span className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-amber-900">链接驱动 · 动作指令</span>
                          <button
                            type="button"
                            disabled={
                              aiMotionRewriteBusy ||
                              draft.script.trim().length < 8 ||
                              draft.motionInstructions.trim().length < 4
                            }
                            onClick={() => void rewriteMotionWithAi()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {aiMotionRewriteBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            AI 改写动作
                          </button>
                        </span>
                        <textarea
                          value={draft.motionInstructions}
                          onChange={(e) => patchDraft({ motionInstructions: e.target.value })}
                          rows={5}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-amber-950"
                        />
                      </label>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {step === 4 ? (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">低清预览</h2>
                  <p className="text-sm text-slate-600">
                    合成前可试听 TTS 音色与字幕布局（静态形象 + 语音，非 AI 口型视频）。最终成片由千问
                    wan2.2-s2v 按音频驱动口型，请提交渲染后在作品库预览/下载。
                  </p>
                  <div className="mx-auto max-w-xs">
                    <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-2">
                      {customBackgroundPreview && draft.background === 'custom' ? (
                        <img
                          src={customBackgroundPreview}
                          alt=""
                          className="absolute inset-2 z-0 h-[calc(100%-1rem)] w-[calc(100%-1rem)] rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="relative z-10">{renderAvatarPreview(true)}</div>
                      {draft.productOverlayEnabled && productImagePreview ? (
                        <img
                          src={productImagePreview}
                          alt=""
                          className="pointer-events-none absolute bottom-[28%] left-1/2 z-10 max-h-[38%] max-w-[55%] -translate-x-1/2 object-contain drop-shadow-md"
                        />
                      ) : null}
                      {draft.subtitleEnabled && draft.script ? (
                        <p className="absolute bottom-6 left-2 right-2 rounded bg-black/55 px-2 py-1 text-center text-xs text-white">
                          {splitScriptSegments(draft.script)[0]?.slice(0, 40) ?? '字幕预览'}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={ttsPlaying ? stopTtsPreview : playTtsPreview}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm"
                    >
                      <Play className="h-4 w-4" />
                      播放预览
                    </button>
                  </div>
                </section>
              ) : null}

              {step === 5 ? (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">提交高清合成</h2>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>· 形象：{selectedAvatar?.name ?? '自定义分身'}</li>
                    <li>
                      · 驱动：
                      {draft.driveMode === 'text'
                        ? '文本 → TTS → 口型'
                        : draft.driveMode === 'link'
                          ? '抖音链接 → 文案 + 动作指令'
                          : '音频驱动口型'}
                    </li>
                    <li>· 输出：{resolutionLabel(s2vResolutionFromDraft(draft))} · {draft.frameMode === 'full' ? '全身' : '半身'}</li>
                    <li>· 音色：{selectedVoice?.label}</li>
                    <li>
                      · 字幕：{draft.subtitleEnabled ? SUBTITLE_STYLES.find((s) => s.id === draft.subtitleStyle)?.label ?? '已开启' : '未烧录'}
                    </li>
                    <li>
                      · 背景：
                      {BACKGROUND_OPTIONS.find((b) => b.id === draft.background)?.label ?? draft.background}
                      {draft.background === 'custom'
                        ? ` · ${draft.customBackgroundFileName ?? (customBackgroundPreview ? '已上传' : '未上传')}`
                        : ''}
                    </li>
                    <li>
                      · 产品展示：{draft.productOverlayEnabled ? draft.productImageFileName ?? '已上传' : '未开启'}
                    </li>
                  </ul>
                  {activeJob &&
                  (activeJob.status === 'queued' || activeJob.status === 'rendering') ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4">
                      <p className="text-sm font-medium text-violet-900">{activeJob.title}</p>
                      <p className="mt-1 text-xs text-violet-700">
                        状态：{activeJob.status === 'queued' ? '排队中' : '渲染中'}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-200">
                        <div
                          className="h-full bg-violet-600 transition-all"
                          style={{ width: `${activeJob.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {activeJob?.status === 'completed' ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                      <p className="text-sm font-medium text-emerald-900">{activeJob.title}</p>
                      <p className="mt-1 text-xs text-emerald-700">状态：已完成</p>
                      {activeJob.previewNote ? (
                        <p className="mt-2 text-xs text-emerald-700">{activeJob.previewNote}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {!(
                    activeJob &&
                    (activeJob.status === 'queued' || activeJob.status === 'rendering')
                  ) ? (
                    <button
                      type="button"
                      disabled={submitRenderBusy}
                      onClick={() => void submitRender()}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitRenderBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Clapperboard className="h-5 w-5" />
                      )}
                      {submitRenderBusy
                        ? '提交中…'
                        : editingWorkId || activeJob?.status === 'failed'
                          ? '重新提交渲染'
                          : '提交后台渲染'}
                    </button>
                  ) : null}
                </section>
              ) : null}

              <div className="mt-8 flex justify-between border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={step === 1}
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
                  className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm text-slate-600 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  上一步
                </button>
                {step < 5 ? (
                  <button
                    type="button"
                    disabled={!canNext()}
                    onClick={() => setStep((s) => (s < 5 ? ((s + 1) as WizardStep) : s))}
                    className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    下一步
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      refreshWorks()
                      setMainTab('works')
                    }}
                    className="text-sm font-medium text-violet-600"
                  >
                    前往作品管理
                  </button>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">流程</p>
                <ol className="mt-3 space-y-2 text-xs text-slate-600">
                  <li>1. 选形象 / 定制分身</li>
                  <li>2. 链接 · 文案 · AI · 录音</li>
                  <li>3. 音色 · 背景 · 字幕</li>
                  <li>4. 低清预览</li>
                  <li>5. 高清合成队列</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
                <p className="text-xs text-slate-400">当前形象</p>
                <button
                  type="button"
                  onClick={playSidebarPreview}
                  disabled={!selectedAvatar && !draft.customAvatarDataUrl}
                  className="group mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={sidebarPreviewPlaying ? '停止预览' : '播放动态口播预览'}
                >
                  <div className="relative mx-auto flex justify-center">
                    {renderAvatarPreview(false, sidebarPreviewPlaying)}
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-2xl transition',
                        sidebarPreviewPlaying ? 'bg-black/25' : 'bg-black/0 group-hover:bg-black/20',
                      )}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
                        {sidebarPreviewPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="ml-0.5 h-4 w-4" />
                        )}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-center text-sm">{selectedAvatar?.name ?? '自定义'}</p>
                  {selectedAvatar ? (
                    <p className="mt-0.5 text-center text-[11px] text-violet-300">
                      专属音色 · {matchVoicePresetForAvatar(selectedAvatar).label}
                    </p>
                  ) : null}
                  <p className="mt-1 text-center text-[11px] text-slate-400">
                    {sidebarPreviewPlaying ? '播放中 · 再次点击停止' : ttsBusy ? '语音合成中…' : '点击预览 · 动态画面含声音'}
                  </p>
                  {sidebarPreviewPlaying && sidebarPreviewLine ? (
                    <p className="mt-2 line-clamp-2 rounded-lg bg-black/35 px-2 py-1.5 text-center text-[11px] leading-relaxed text-white/90">
                      {sidebarPreviewLine}
                      {sidebarPreviewLine.length >= 36 ? '…' : ''}
                    </p>
                  ) : null}
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
      {previewVideoUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => closePreviewVideo()}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            role="dialog"
            aria-label="成片预览"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">{previewVideoTitle}</h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                onClick={() => closePreviewVideo()}
              >
                关闭
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">下载 MP4 可在本地全屏查看真实清晰度</p>
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              playsInline
              className="mt-3 aspect-[9/16] max-h-[70vh] w-full rounded-xl bg-black object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WorksPanel({
  works,
  onRefresh,
  onEdit,
  onDelete,
  onPreview,
  onDownload,
}: {
  works: DigitalHumanWork[]
  onRefresh: () => void
  onEdit: (w: DigitalHumanWork) => void
  onDelete: (id: string) => void
  onPreview: (w: DigitalHumanWork) => void
  onDownload: (w: DigitalHumanWork) => void
}) {
  const [filter, setFilter] = useState<'all' | DigitalHumanWork['status']>('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    return works.filter((w) => {
      if (filter !== 'all' && w.status !== filter) return false
      if (q.trim() && !w.title.includes(q.trim())) return false
      return true
    })
  }, [works, filter, q])

  const statusLabel: Record<DigitalHumanWork['status'], string> = {
    draft: '草稿',
    queued: '排队',
    rendering: '渲染中',
    completed: '已完成',
    failed: '失败',
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Film className="h-5 w-5 text-violet-600" />
        <h2 className="text-lg font-semibold">历史作品</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索名称…"
          className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
        >
          <option value="all">全部状态</option>
          {(['completed', 'rendering', 'queued', 'failed', 'draft'] as const).map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRefresh} className="text-sm text-violet-600">
          刷新
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">暂无作品，请从「创作流程」提交合成。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="py-2 pr-4">名称</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">创建时间</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className="border-b border-slate-50">
                  <td className="py-3 pr-4 font-medium text-slate-900">{w.title}</td>
                  <td className="py-3 pr-4">
                    <div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          w.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : w.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700',
                        )}
                      >
                        {statusLabel[w.status]}
                        {w.status === 'rendering' || w.status === 'queued' ? ` ${w.progress}%` : ''}
                      </span>
                      {w.status === 'failed' && (w.errorMessage || w.previewNote) ? (
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-red-700">
                          {w.errorMessage || w.previewNote}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {new Date(w.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={w.status !== 'completed'}
                        onClick={() => onPreview(w)}
                        className="relative z-10 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-violet-600 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        title={w.status === 'completed' ? '播放口播预览' : '渲染完成后可预览'}
                      >
                        <Video className="h-4 w-4" />
                        预览
                      </button>
                      <button
                        type="button"
                        disabled={w.status !== 'completed'}
                        onClick={() => onDownload(w)}
                        className="relative z-10 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        title={w.status === 'completed' ? '下载高清 MP4' : '渲染完成后可下载'}
                      >
                        <Download className="h-4 w-4" />
                        MP4
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(w)}
                        className="relative z-10 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-cyan-700 hover:bg-cyan-50"
                      >
                        <Wand2 className="h-4 w-4" />
                        再编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(w.id)
                          onRefresh()
                        }}
                        className="inline-flex items-center gap-1 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

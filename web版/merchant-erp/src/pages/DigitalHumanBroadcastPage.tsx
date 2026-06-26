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
  type VoicePreset,
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
  voiceOptionsForUploadDrive,
  customAvatarVoiceDefaults,
  matchVoicePresetForAvatar,
  newSceneShot,
} from '../lib/digitalHumanBroadcast'
import {
  DhBackgroundSubContent,
  DhMultiScenePanel,
} from '../components/digitalHuman/DhStep3Extras'
import {
  addUserSavedAvatar,
  deleteUserSavedAvatar,
  ensureUserSavedAvatarsReady,
  isUserSavedAvatarId,
  type UserSavedAvatar,
} from '../lib/digitalHumanUserAvatars'
import {
  resolveStoreSceneBackgroundDataUrl,
  STORE_SCENE_OPTIONS,
  storeScenePreviewUrl,
  type StoreSceneId,
} from '../lib/digitalHumanStoreScenes'
import { fileToAudioBlob, estimateS2vSegmentCountFromDuration, getAudioDurationSec } from '../lib/digitalHumanAudioChunks'
import { processCustomAvatarFile, compressPortraitDataUrlForLibrary } from '../lib/digitalHumanCustomMedia'
import { warmSpeechVoices } from '../lib/digitalHumanTts'
import { playDigitalHumanSpeech, primeDigitalHumanAudioPlayback, stopDigitalHumanSpeech } from '../lib/digitalHumanTtsPlayer'
import {
  createWorkPreviewObjectUrl,
  downloadDigitalHumanMp4,
  dhVideoEngineLabel,
  estimateDhS2vSegmentCount,
  persistCompletedWorkMp4,
  renderDigitalHumanMp4,
} from '../lib/digitalHumanVideoRender'
import {
  loadWorkMp4Blob,
  loadWorkCustomAudio,
  loadWorkProductImage,
  loadWorkCustomBackground,
  loadWorkReferenceVideo,
} from '../lib/digitalHumanWorkBlobStore'
import { parseDouyinLinkForDigitalHuman } from '../services/digitalHumanDouyinLinkApi'
import {
  buildDhMotionRewritePrompt,
  buildDhScriptGeneratePrompt,
  buildDhScriptRewritePrompt,
  postDigitalHumanAssistText,
} from '../lib/digitalHumanAssistAi'
import { fetchVideoAiConfig } from '../services/videoAiApi'
import { buildDigitalHumanFramePreviewDataUrl } from '../lib/digitalHumanFramePreview'
import { inferVoicePresetFromPortraitDataUrl } from '../lib/digitalHumanPortraitVoice'

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
  const cloneVoiceBlobRef = useRef<Blob | null>(null)
  const customNarrationBlobRef = useRef<Blob | null>(null)
  const customReferenceVideoBlobRef = useRef<Blob | null>(null)
  const [referenceVideoPreviewUrl, setReferenceVideoPreviewUrl] = useState<string | null>(null)
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
  const [userAvatars, setUserAvatars] = useState<UserSavedAvatar[]>([])
  const [pendingPhotoSaveBusy, setPendingPhotoSaveBusy] = useState(false)
  const [avatarLibrarySaveOpen, setAvatarLibrarySaveOpen] = useState(false)
  const [pendingPhotoName, setPendingPhotoName] = useState('')
  const [storeSceneSelecting, setStoreSceneSelecting] = useState<StoreSceneId | null>(null)
  const [shotStoreSceneSelecting, setShotStoreSceneSelecting] = useState<string | null>(null)
  const [voiceInferBusy, setVoiceInferBusy] = useState(false)
  const [compositedFramePreview, setCompositedFramePreview] = useState<string | null>(null)
  const [compositedFramePreviewBusy, setCompositedFramePreviewBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const cloneInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void ensureUserSavedAvatarsReady()
      .then(setUserAvatars)
      .catch(() => setUserAvatars([]))
  }, [])

  const selectedAvatar = useMemo(() => {
    if (draft.avatarId) {
      const fromLibrary = userAvatars.find((a) => a.id === draft.avatarId)
      if (fromLibrary) return fromLibrary
    }
    return findPresetAvatarForDraft(draft)
  }, [draft, userAvatars])
  const selectedVoice = useMemo(() => {
    return resolveVoiceForDraft(draft, selectedAvatar) ?? VOICE_PRESETS[0]
  }, [draft, selectedAvatar])

  const voiceSelectOptions = useMemo(() => {
    if (draft.avatarKind === 'photo' || draft.avatarKind === 'video_clone') {
      return voiceOptionsForUploadDrive()
    }
    return selectedAvatar ? voiceOptionsForAvatar(selectedAvatar) : voiceOptionsForCustomAvatar()
  }, [draft.avatarKind, selectedAvatar])

  const catalogAvatars = useMemo(() => [...userAvatars, ...PRESET_AVATARS], [userAvatars])

  const filteredAvatars = useMemo(() => {
    return catalogAvatars.filter((a) => {
      if (avatarFilter !== 'all' && a.style !== avatarFilter) return false
      if (bodyFrameFilter !== 'all' && a.bodyFrame !== bodyFrameFilter) return false
      if (nationalityFilter !== 'all' && a.nationality !== nationalityFilter) return false
      return true
    })
  }, [avatarFilter, bodyFrameFilter, nationalityFilter, catalogAvatars])

  const isVideoCloneFlow = draft.avatarKind === 'video_clone'
  const isUploadDrive = draft.avatarKind === 'photo' || isVideoCloneFlow

  const activeJob = useMemo(
    () => works.find((w) => w.id === renderJobId) ?? null,
    [works, renderJobId],
  )

  useEffect(() => {
    if (step !== 4) {
      setCompositedFramePreview(null)
      setCompositedFramePreviewBusy(false)
      return
    }
    let cancelled = false
    setCompositedFramePreviewBusy(true)
    void buildDigitalHumanFramePreviewDataUrl({
      draft,
      portraitDataUrl:
        draft.customAvatarDataUrl ??
        selectedAvatar?.previewUrl ??
        null,
      customBackgroundDataUrl:
        customBackgroundDataUrlRef.current ??
        (draft.background === 'custom' ? customBackgroundPreview : null),
      productImageDataUrl: productImagePreview,
    })
      .then((url) => {
        if (!cancelled) setCompositedFramePreview(url)
      })
      .catch(() => {
        if (!cancelled) setCompositedFramePreview(null)
      })
      .finally(() => {
        if (!cancelled) setCompositedFramePreviewBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    step,
    draft,
    draft.background,
    draft.storeScene,
    draft.frameMode,
    draft.productOverlayEnabled,
    draft.customAvatarDataUrl,
    draft.avatarId,
    draft.hairstyle,
    draft.outfit,
    customBackgroundPreview,
    productImagePreview,
    selectedAvatar?.id,
  ])

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

  /** 形象切换后对齐专属音色；旧版通用 id 迁移。上传驱动 / 照片模式允许自由选音。 */
  useEffect(() => {
    if (isUploadDrive) return
    if (!selectedAvatar) return
    if (draft.voiceId === 'v-clone') return
    if (isUserSavedAvatarId(selectedAvatar.id)) {
      const settings = voiceSettingsForAvatar(selectedAvatar)
      setDraft((d) => {
        if (d.avatarId !== selectedAvatar.id) return d
        if (d.voiceId === settings.voiceId && d.speechRate === settings.speechRate && d.speechPitch === settings.speechPitch) {
          return d
        }
        return { ...d, ...settings }
      })
      return
    }
    const allowedIds = new Set(voiceOptionsForAvatar(selectedAvatar).map((v) => v.id))
    if (allowedIds.has(draft.voiceId)) return
    setDraft((d) => ({ ...d, ...voiceSettingsForAvatar(selectedAvatar) }))
  }, [selectedAvatar?.id, isUploadDrive])

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
        previewNote: `高清 MP4 已生成（${dhVideoEngineLabel(result.engine)} · ${result.segmentCount} 段${result.segmentCount > 1 ? '合并' : ''} · 含口播音频）`,
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

  const confirmSavePhotoToLibrary = () => {
    const dataUrl = draft.customAvatarDataUrl?.trim()
    if (!dataUrl || !pendingPhotoName.trim() || pendingPhotoSaveBusy) return
    void (async () => {
      setPendingPhotoSaveBusy(true)
      try {
        const compressed = await compressPortraitDataUrlForLibrary(dataUrl)
        const saved = await addUserSavedAvatar({
          name: pendingPhotoName,
          portraitDataUrl: compressed,
          bodyFrame: draft.frameMode,
          voiceId: draft.voiceId,
          speechRate: draft.speechRate,
          speechPitch: draft.speechPitch,
        })
        setUserAvatars(await ensureUserSavedAvatarsReady())
        patchDraft({
          avatarId: saved.id,
          customAvatarDataUrl: saved.portraitDataUrl,
          avatarKind: 'preset',
          ...voiceSettingsForAvatar(saved),
        })
        setAvatarLibrarySaveOpen(false)
        setPendingPhotoName('')
        setToast(`「${saved.name}」已加入形象库`)
      } catch (e) {
        setToast(e instanceof Error ? e.message : '保存形象失败')
      } finally {
        setPendingPhotoSaveBusy(false)
      }
    })()
  }

  const handleDeleteUserAvatar = (id: string) => {
    if (!isUserSavedAvatarId(id)) return
    if (!window.confirm('确定删除该形象？删除后无法恢复。')) return
    void (async () => {
      try {
        await deleteUserSavedAvatar(id)
        setUserAvatars(await ensureUserSavedAvatarsReady())
        if (draft.avatarId === id) {
          patchDraft({
            avatarId: null,
            customAvatarDataUrl: null,
            avatarKind: 'preset',
            ...customAvatarVoiceDefaults(),
          })
        }
        setToast('形象已删除')
      } catch (e) {
        setToast(e instanceof Error ? e.message : '删除形象失败')
      }
    })()
  }

  const selectStoreScene = (sceneId: StoreSceneId) => {
    void (async () => {
      setStoreSceneSelecting(sceneId)
      try {
        const dataUrl = await resolveStoreSceneBackgroundDataUrl(sceneId)
        customBackgroundDataUrlRef.current = dataUrl
        setCustomBackgroundPreview(storeScenePreviewUrl(sceneId))
        patchDraft({
          background: 'store',
          storeScene: sceneId,
          customBackgroundFileName: `store-${sceneId}.jpg`,
        })
        setToast(`已选择门店实景：${STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)?.label ?? sceneId}`)
      } catch (e) {
        setToast(e instanceof Error ? e.message : '门店实景加载失败')
      } finally {
        setStoreSceneSelecting(null)
      }
    })()
  }

  const selectShotStoreScene = (shotId: string, sceneId: StoreSceneId) => {
    void (async () => {
      setShotStoreSceneSelecting(`${shotId}:${sceneId}`)
      try {
        await resolveStoreSceneBackgroundDataUrl(sceneId)
        const shots = draft.sceneShots ?? []
        patchDraft({
          sceneShots: shots.map((s) =>
            s.id === shotId ? { ...s, background: 'store', storeScene: sceneId } : s,
          ),
        })
      } catch (e) {
        setToast(e instanceof Error ? e.message : '门店实景加载失败')
      } finally {
        setShotStoreSceneSelecting(null)
      }
    })()
  }

  const handleBackgroundFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            typeof r.result === 'string' ? resolve(r.result) : reject(new Error('读取失败'))
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
  }

  const toggleMultiScene = (checked: boolean) => {
    if (checked) {
      const shots = draft.sceneShots ?? []
      patchDraft({
        multiScene: true,
        sceneShots:
          shots.length >= 2
            ? shots
            : [
                newSceneShot('镜头 1', {
                  background: draft.background,
                  storeScene: draft.storeScene ?? null,
                }),
                newSceneShot('镜头 2', {
                  background: draft.background === 'studio' ? 'store' : 'studio',
                  storeScene: draft.background === 'studio' ? 'restaurant' : null,
                }),
              ],
      })
      return
    }
    patchDraft({ multiScene: false })
  }

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
      const res = await postDigitalHumanAssistText(buildDhScriptGeneratePrompt(topic))
      if (!res.ok) {
        setToast(res.message)
        return
      }
      patchDraft({ script: res.text, driveMode: 'text' })
      setToast(
        res.vendorUsed ? `AI 口播脚本已生成（${res.vendorUsed}）` : 'AI 口播脚本已生成',
      )
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
      const res = await postDigitalHumanAssistText(buildDhScriptRewritePrompt(original))
      if (!res.ok) {
        setToast(res.message)
        return
      }
      patchDraft({ script: res.text })
      setToast(
        res.vendorUsed ? `AI 已改写口播文案（${res.vendorUsed}）` : 'AI 已改写口播文案，请核对后再下一步',
      )
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
      const res = await postDigitalHumanAssistText(
        buildDhMotionRewritePrompt(script, original),
      )
      if (!res.ok) {
        setToast(res.message)
        return
      }
      patchDraft({ motionInstructions: res.text })
      setToast(
        res.vendorUsed ? `AI 已改写动作指令（${res.vendorUsed}）` : 'AI 已改写动作指令，请核对后再继续',
      )
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

  const speakPreviewText = async (
    text: string,
    mode: 'sidebar' | 'tts',
    voiceOverride?: VoicePreset,
  ): Promise<boolean> => {
    const trimmed = text.trim()
    if (!trimmed) {
      setToast('暂无可播放的口播内容')
      return false
    }
    const preset = voiceOverride ?? selectedVoice
    setTtsBusy(true)
    const out = await playDigitalHumanSpeech(
      trimmed,
      {
        preset,
        speechRate: preset?.rate ?? draft.speechRate,
        speechPitch: preset?.pitch ?? draft.speechPitch,
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
    if (out.source === 'browser' && preset?.cloudVoiceId) {
      const why = out.cloudFallbackReason?.trim()
      setToast(
        why?.includes('余额不足')
          ? `MiniMax 语音账户余额不足，且通义千问神经语音暂不可用。请在 platform.minimaxi.com 充值后重试（已改用浏览器试听）`
          : why
            ? `云端神经语音未生效：${why}（已改用浏览器试听，音质偏机械）`
            : '云端神经语音未生效，已改用浏览器试听（音质偏机械）。请确认 ECS 已部署 meoo-digital-human-tts 且运营台已保存 MiniMax / 通义 Key',
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
    primeDigitalHumanAudioPlayback()
    const text = resolveDigitalHumanPreviewScript(draft, selectedAvatar)
    const preset = selectedAvatar ? matchVoicePresetForAvatar(selectedAvatar) : selectedVoice
    speakPreviewText(text, 'sidebar', preset)
  }

  const playTtsPreview = () => {
    if (ttsPlaying || ttsBusy) {
      stopAllSpeech()
      return
    }
    const text =
      draft.script.trim() ||
      (isUploadDrive ? '大家好，我是您的数字人主播，这是一段音色试听。' : '')
    if (!text) {
      setToast('请先输入口播文案')
      return
    }
    primeDigitalHumanAudioPlayback()
    speakPreviewText(text, 'tts')
  }

  const inferVoiceFromPortrait = async () => {
    const dataUrl = draft.customAvatarDataUrl?.trim()
    if (!dataUrl) {
      setToast('请先上传照片或实拍视频')
      return
    }
    setVoiceInferBusy(true)
    try {
      const preset = await inferVoicePresetFromPortraitDataUrl(dataUrl)
      patchDraft({ voiceId: preset.id, speechRate: preset.rate, speechPitch: preset.pitch })
      setToast(`AI 已匹配音色：${preset.label}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'AI 音色匹配失败')
    } finally {
      setVoiceInferBusy(false)
    }
  }

  const renderVoiceSynthesisPanel = (opts?: { showAiMatch?: boolean }) => (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">
        语音合成（TTS）与克隆
        <span className="ml-2 text-xs font-normal text-slate-500">
          {opts?.showAiMatch
            ? '上传照片后可 AI 匹配音色，或手动选择 / 语音克隆'
            : '试听优先 MiniMax 神经语音，与形象性别绑定'}
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
            disabled={
              draft.driveMode === 'audio' ||
              (!draft.script.trim() && !opts?.showAiMatch && !ttsPlaying && !ttsBusy)
            }
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
        {opts?.showAiMatch ? (
          <button
            type="button"
            disabled={voiceInferBusy || !draft.customAvatarDataUrl}
            onClick={() => void inferVoiceFromPortrait()}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-800 disabled:opacity-50"
          >
            {voiceInferBusy ? 'AI 匹配中…' : 'AI 根据照片匹配音色'}
          </button>
        ) : null}
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
                const blob = await fileToAudioBlob(f)
                cloneVoiceBlobRef.current = blob
                setCloneAudioName(f.name)
                patchDraft({ voiceId: 'v-clone', voiceCloneFileName: f.name })
                setToast('克隆样本已保存，合成时将使用千问 CosyVoice 参考您的音色（需配置通义 Key）')
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
        {cloneAudioName ? <span className="text-xs text-slate-500">{cloneAudioName}</span> : null}
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
  )

  const stopTtsPreview = () => {
    stopAllSpeech()
  }

  const canNext = (): boolean => {
    if (step === 1) {
      if (draft.avatarKind === 'video_clone') {
        return Boolean(
          draft.customAvatarDataUrl &&
            (customReferenceVideoBlobRef.current || draft.customReferenceVideoFileName),
        )
      }
      return Boolean(draft.avatarId || draft.customAvatarDataUrl)
    }
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
      if (draft.background === 'store' && !draft.storeScene) return false
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
    if (!cfg?.arkKeyConfigured || !(cfg?.arkVideoModels?.length ?? 0)) {
      setToast('须配置火山方舟豆包 Seedance 视频模型（与短视频同源），人物/背景/产品一体化生成')
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
      hasLocalCustomBackground: Boolean(
        (draft.background === 'custom' || (draft.background === 'store' && draft.storeScene)) &&
          (Boolean(customBackgroundDataUrlRef.current) || Boolean(prev?.hasLocalCustomBackground)),
      ),
      hasLocalVoiceCloneSample:
        draft.voiceId === 'v-clone' &&
        (Boolean(cloneVoiceBlobRef.current) || Boolean(prev?.hasLocalVoiceCloneSample)),
      hasLocalReferenceVideo:
        draft.avatarKind === 'video_clone' &&
        (Boolean(customReferenceVideoBlobRef.current) || Boolean(prev?.hasLocalReferenceVideo)),
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
        draft.background === 'custom' || (draft.background === 'store' && draft.storeScene)
          ? customBackgroundDataUrlRef.current
          : null,
      voiceCloneBlob: draft.voiceId === 'v-clone' ? cloneVoiceBlobRef.current : null,
      referenceVideoBlob:
        draft.avatarKind === 'video_clone' ? customReferenceVideoBlobRef.current : null,
    })
    setEditingWorkId(null)
    setWorks(loadDigitalHumanWorks())
    setRenderJobId(id)
    if (draft.avatarKind === 'video_clone') {
      setMainTab('works')
    }
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
          : draft.avatarKind === 'video_clone'
            ? '已提交渲染（实拍视频 · Seedance 一体化 + TTS 配音）'
            : '已提交高清 MP4 渲染（豆包 Seedance 一体化 + TTS 配音）',
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
    if (
      (hydrated.draft.background === 'custom' || hydrated.draft.background === 'store') &&
      (hydrated.hasLocalCustomBackground || hydrated.draft.storeScene)
    ) {
      const bg =
        (await loadWorkCustomBackground(hydrated.id)) ??
        (hydrated.draft.background === 'store' && hydrated.draft.storeScene
          ? await resolveStoreSceneBackgroundDataUrl(hydrated.draft.storeScene).catch(() => null)
          : null)
      customBackgroundDataUrlRef.current = bg
      setCustomBackgroundPreview(
        hydrated.draft.background === 'store' && hydrated.draft.storeScene
          ? storeScenePreviewUrl(hydrated.draft.storeScene)
          : bg,
      )
    } else {
      customBackgroundDataUrlRef.current = null
      setCustomBackgroundPreview(null)
    }
    if (hydrated.hasLocalReferenceVideo || hydrated.draft.avatarKind === 'video_clone') {
      const refVid = await loadWorkReferenceVideo(hydrated.id)
      customReferenceVideoBlobRef.current = refVid
      setReferenceVideoPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return refVid ? URL.createObjectURL(refVid) : null
      })
    } else {
      customReferenceVideoBlobRef.current = null
      setReferenceVideoPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return null
      })
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
            形象管理 · 口播文案 · 高清 MP4（豆包 Seedance 一体化：人物+背景+产品融合 + TTS 配音，与短视频同源）· 支持实拍视频上传 · 作品库。
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

      {avatarLibrarySaveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">保存到形象库</h3>
            <p className="mt-1 text-sm text-slate-500">
              为当前照片命名，将连同已选音色设置一并存入「形象库」，便于下次复用。
            </p>
            {draft.customAvatarDataUrl ? (
              <img
                src={draft.customAvatarDataUrl}
                alt="待保存形象"
                className="mx-auto mt-4 h-48 w-28 rounded-lg border border-slate-200 object-cover"
              />
            ) : null}
            <input
              value={pendingPhotoName}
              onChange={(e) => setPendingPhotoName(e.target.value)}
              placeholder="例如：门店店长小美"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAvatarLibrarySaveOpen(false)
                  setPendingPhotoName('')
                }}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!pendingPhotoName.trim() || pendingPhotoSaveBusy}
                onClick={confirmSavePhotoToLibrary}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pendingPhotoSaveBusy ? '保存中…' : '确认保存'}
              </button>
            </div>
          </div>
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
                        onClick={() => {
                          if (k === 'photo' || k === 'video_clone') {
                            patchDraft({
                              avatarKind: k,
                              avatarId: null,
                              ...customAvatarVoiceDefaults(),
                            })
                          } else {
                            patchDraft({ avatarKind: k })
                          }
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm',
                          draft.avatarKind === k
                            ? 'bg-violet-100 font-medium text-violet-800'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {k === 'preset' ? '形象库' : k === 'photo' ? '照片驱动' : '实拍视频'}
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
                          <div
                            key={av.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const userAv = isUserSavedAvatarId(av.id)
                                ? userAvatars.find((u) => u.id === av.id)
                                : null
                              patchDraft({
                                avatarId: av.id,
                                customAvatarDataUrl: userAv?.portraitDataUrl ?? null,
                                frameMode: av.bodyFrame,
                                ...voiceSettingsForAvatar(userAv ?? av),
                              })
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                const userAv = isUserSavedAvatarId(av.id)
                                  ? userAvatars.find((u) => u.id === av.id)
                                  : null
                                patchDraft({
                                  avatarId: av.id,
                                  customAvatarDataUrl: userAv?.portraitDataUrl ?? null,
                                  frameMode: av.bodyFrame,
                                  ...voiceSettingsForAvatar(userAv ?? av),
                                })
                              }
                            }}
                            className={cn(
                              'cursor-pointer rounded-xl border p-2 text-left transition hover:shadow-md',
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
                              {isUserSavedAvatarId(av.id) ? (
                                <button
                                  type="button"
                                  title="删除形象"
                                  aria-label={`删除形象 ${av.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteUserAvatar(av.id)
                                  }}
                                  className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow hover:bg-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                            <p className="truncate font-medium text-slate-900">{av.name}</p>
                            <p className="truncate text-xs text-slate-500">{avatarCatalogTags(av)}</p>
                          </div>
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
                              const isVideo =
                                f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name)
                              const dataUrl = await processCustomAvatarFile(f)
                              if (isVideo) {
                                customReferenceVideoBlobRef.current = f
                                const previewUrl = URL.createObjectURL(f)
                                setReferenceVideoPreviewUrl((prev) => {
                                  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
                                  return previewUrl
                                })
                              } else {
                                customReferenceVideoBlobRef.current = null
                                setReferenceVideoPreviewUrl((prev) => {
                                  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
                                  return null
                                })
                              }
                              if (isVideo) {
                                patchDraft({
                                  customAvatarDataUrl: dataUrl,
                                  avatarId: null,
                                  avatarKind: 'video_clone',
                                  customReferenceVideoFileName: f.name,
                                  ...customAvatarVoiceDefaults(),
                                })
                                setToast('实拍视频已上传；完成口播文案后可直接提交渲染（TTS + 口型）')
                              } else {
                                patchDraft({
                                  customAvatarDataUrl: dataUrl,
                                  avatarId: null,
                                  avatarKind: 'photo',
                                  ...customAvatarVoiceDefaults(),
                                })
                                setToast('照片已上传，请配置音色后继续')
                              }
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
                        上传 {draft.avatarKind === 'photo' ? '正面照片' : '自己拍的竖版 MP4 视频'}，与照片驱动共用豆包 Seedance 图生视频逻辑
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {draft.avatarKind === 'photo'
                          ? '建议竖版 JPG/PNG ≥1080×1920；全身照请在下方选「全身」后生成'
                          : '建议竖版 MP4 ≥720P；完成步骤 2 口播文案后可直接提交渲染（TTS + 口型）'}
                      </p>
                      <button
                        type="button"
                        disabled={avatarUploadBusy}
                        onClick={() => photoInputRef.current?.click()}
                        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        {avatarUploadBusy ? '处理中…' : '选择文件'}
                      </button>
                      {referenceVideoPreviewUrl && draft.avatarKind === 'video_clone' ? (
                        <div className="mx-auto mt-4 max-w-xs overflow-hidden rounded-xl border border-slate-200 bg-black">
                          <video
                            src={referenceVideoPreviewUrl}
                            controls
                            playsInline
                            className="max-h-72 w-full object-contain"
                          />
                          {draft.customReferenceVideoFileName ? (
                            <p className="truncate px-2 py-1 text-[11px] text-slate-500">
                              {draft.customReferenceVideoFileName}
                            </p>
                          ) : null}
                        </div>
                      ) : draft.customAvatarDataUrl && draft.avatarKind === 'photo' ? (
                        <div className="mx-auto mt-4 max-w-xs overflow-hidden rounded-xl border border-slate-200">
                          <img
                            src={draft.customAvatarDataUrl}
                            alt="已上传照片"
                            className="max-h-72 w-full object-contain"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
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
                        {isVideoCloneFlow
                          ? '实拍视频成片输出 720P；Seedance 一体化图生视频 + TTS 配音'
                          : '成片输出 720P；豆包 Seedance 一体化图生视频 + TTS 配音。自定义照片/视频建议竖版 ≥1080×1920。'}
                      </p>
                    </label>
                  </div>
                  {isUploadDrive ? renderVoiceSynthesisPanel({ showAiMatch: true }) : null}
                </section>
              ) : null}

              {step === 2 ? (
                <section className="space-y-5">
                  <h2 className="text-lg font-semibold text-slate-900">口播内容</h2>
                  {isVideoCloneFlow ? (
                    <p className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
                      实拍视频模式：音色已在步骤 1 配置；填写口播文案或上传音频后可直接「提交渲染」（Seedance 一体化 + TTS，无需配置背景/预览步骤）。
                    </p>
                  ) : isUploadDrive ? (
                    <p className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
                      照片驱动模式：音色已在步骤 1 配置，本步只需填写口播文案或上传音频。
                    </p>
                  ) : null}
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

                  {!isUploadDrive ? renderVoiceSynthesisPanel() : null}
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
                            storeScene: v === 'store' ? draft.storeScene ?? null : null,
                            customBackgroundFileName:
                              v === 'custom' ? draft.customBackgroundFileName : v === 'store' ? draft.customBackgroundFileName : null,
                          })
                          if (v !== 'custom' && v !== 'store') {
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
                      <DhBackgroundSubContent
                        draft={draft}
                        patchDraft={patchDraft}
                        storeSceneSelecting={storeSceneSelecting}
                        onSelectStoreScene={selectStoreScene}
                        customBackgroundPreview={customBackgroundPreview}
                        backgroundInputRef={backgroundInputRef}
                        backgroundUploadBusy={backgroundUploadBusy}
                        onBackgroundFileChange={handleBackgroundFileChange}
                        onPickBackgroundFile={() => backgroundInputRef.current?.click()}
                      />
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
                      {draft.gesturePreset !== 'none' ? (
                        <p className="mt-1 text-xs text-slate-500">
                          将写入 Seedance 动作提示，并在成片后处理中叠加对应运镜效果。
                        </p>
                      ) : null}
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
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={draft.multiScene}
                        onChange={(e) => toggleMultiScene(e.target.checked)}
                      />
                      多场景拼接（同片切换背景/镜头）
                    </label>
                    <DhMultiScenePanel
                      draft={draft}
                      patchDraft={patchDraft}
                      onSelectShotStoreScene={selectShotStoreScene}
                      shotStoreSceneSelecting={shotStoreSceneSelecting}
                    />
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
                      手持产品展示（AI 视频融合）
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      上传产品图后，成片中段将由豆包 Seedance 双参考图自然手持展示（预览不含产品，非浏览器贴片）。
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
                                setToast('产品图已上传，提交后由 Seedance 在中段融合展示')
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
                    静态参考示意：人物照片叠在背景上（与提交 Seedance 的参考图一致，不做浏览器抠图）。
                    {draft.productOverlayEnabled ? ' 产品不在此预览出现，成片中段由 Seedance 一体化融合。' : ''}
                    可试听 TTS；动态口播与光影以 Seedance 成片为准。
                  </p>
                  <div className="mx-auto max-w-xs">
                    <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-2">
                      {compositedFramePreviewBusy ? (
                        <div className="flex aspect-[9/16] max-h-[420px] w-full max-w-[240px] items-center justify-center text-xs text-slate-400">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          合成预览中…
                        </div>
                      ) : compositedFramePreview ? (
                        <img
                          src={compositedFramePreview}
                          alt="合成预览"
                          className="mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] rounded-xl object-cover"
                        />
                      ) : (
                        <div className="relative z-10">{renderAvatarPreview(true)}</div>
                      )}
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
                        ? '文本 → TTS → Seedance 一体化'
                        : draft.driveMode === 'link'
                          ? draft.avatarKind === 'video_clone'
                            ? '实拍视频 + 抖音链接文案'
                            : '抖音链接 → 文案 + Seedance 一体化'
                          : '音频 + Seedance 一体化'}
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
                <div className="flex items-center gap-2">
                  {step === 1 &&
                  draft.avatarKind === 'photo' &&
                  draft.customAvatarDataUrl &&
                  !isUserSavedAvatarId(draft.avatarId) ? (
                    <button
                      type="button"
                      disabled={pendingPhotoSaveBusy}
                      onClick={() => {
                        setPendingPhotoName('')
                        setAvatarLibrarySaveOpen(true)
                      }}
                      className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                    >
                      保存到形象库
                    </button>
                  ) : null}
                  {step === 1 &&
                  draft.avatarKind === 'photo' &&
                  isUserSavedAvatarId(draft.avatarId) ? (
                    <span className="text-xs text-emerald-700">已保存到形象库</span>
                  ) : null}
                  {step < 5 && !(isVideoCloneFlow && step === 2) ? (
                    <button
                      type="button"
                      disabled={!canNext()}
                      onClick={() => setStep((s) => (s < 5 ? ((s + 1) as WizardStep) : s))}
                      className="flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      下一步
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  {isVideoCloneFlow && step === 2 ? (
                    <button
                      type="button"
                      disabled={!canNext() || submitRenderBusy}
                      onClick={() => void submitRender()}
                      className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {submitRenderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                      {submitRenderBusy ? '提交中…' : '提交渲染'}
                    </button>
                  ) : null}
                  {step >= 5 ? (
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
                  ) : null}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">流程</p>
                <ol className="mt-3 space-y-2 text-xs text-slate-600">
                  {isUploadDrive ? (
                    <>
                      <li>1. 选形象 · 音色 · TTS</li>
                      <li>2. 链接 · 文案 · 录音</li>
                      <li>3. 背景 · 字幕（实拍视频可跳过）</li>
                      <li>4. 低清预览</li>
                      <li>5. 高清合成队列</li>
                    </>
                  ) : (
                    <>
                      <li>1. 选形象 / 定制分身</li>
                      <li>2. 链接 · 文案 · AI · 录音</li>
                      <li>3. 音色 · 背景 · 字幕</li>
                      <li>4. 低清预览</li>
                      <li>5. 高清合成队列</li>
                    </>
                  )}
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
                      {isUserSavedAvatarId(selectedAvatar.id) ? '已保存音色' : '专属音色'} ·{' '}
                      {matchVoicePresetForAvatar(selectedAvatar).label}
                    </p>
                  ) : isUploadDrive ? (
                    <p className="mt-0.5 text-center text-[11px] text-violet-300">
                      已选音色 · {selectedVoice?.label}
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
            <p className="mt-1 text-xs text-slate-500">
              预览请打开音量；下载 MP4 可在本地全屏查看真实清晰度
            </p>
            <video
              src={previewVideoUrl}
              controls
              playsInline
              className="mt-3 aspect-[9/16] max-h-[70vh] w-full rounded-xl bg-black object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                v.muted = false
                v.volume = 1
              }}
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

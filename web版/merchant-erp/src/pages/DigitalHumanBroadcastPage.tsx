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
  GESTURE_PRESETS,
  loadDigitalHumanWorks,
  PRESET_AVATARS,
  SUBTITLE_STYLES,
  type AvatarStyle,
  type DigitalHumanDraft,
  type DigitalHumanWork,
  upsertDigitalHumanWork,
  VOICE_PRESETS,
  workTitleFromDraft,
  resolveDigitalHumanPreviewScript,
  voiceSettingsForAvatar,
  voiceOptionsForAvatar,
  voicePresetById,
  matchVoicePresetForAvatar,
} from '../lib/digitalHumanBroadcast'
import { warmSpeechVoices } from '../lib/digitalHumanTts'
import { playDigitalHumanSpeech, stopDigitalHumanSpeech } from '../lib/digitalHumanTtsPlayer'
import { parseDouyinLinkForDigitalHuman } from '../services/digitalHumanDouyinLinkApi'
import { postAiChat } from '../services/ai/aiClient'

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
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkSourceTitle, setLinkSourceTitle] = useState<string | null>(null)
  const [avatarFilter, setAvatarFilter] = useState<'all' | AvatarStyle>('all')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsBusy, setTtsBusy] = useState(false)
  const [sidebarPreviewPlaying, setSidebarPreviewPlaying] = useState(false)
  const [sidebarPreviewLine, setSidebarPreviewLine] = useState<string | null>(null)
  const [cloneAudioName, setCloneAudioName] = useState<string | null>(null)
  const [renderJobId, setRenderJobId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const cloneInputRef = useRef<HTMLInputElement>(null)

  const selectedAvatar = useMemo(
    () => PRESET_AVATARS.find((a) => a.id === draft.avatarId) ?? null,
    [draft.avatarId],
  )
  const selectedVoice = useMemo(() => {
    const hit = voicePresetById(draft.voiceId)
    if (hit) return hit
    if (selectedAvatar) return matchVoicePresetForAvatar(selectedAvatar)
    return VOICE_PRESETS[0]
  }, [draft.voiceId, selectedAvatar])

  const voiceSelectOptions = useMemo(
    () => voiceOptionsForAvatar(selectedAvatar),
    [selectedAvatar],
  )

  const filteredAvatars = useMemo(() => {
    if (avatarFilter === 'all') return PRESET_AVATARS
    return PRESET_AVATARS.filter((a) => a.style === avatarFilter)
  }, [avatarFilter])

  const activeJob = useMemo(
    () => works.find((w) => w.id === renderJobId) ?? null,
    [works, renderJobId],
  )

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

  useEffect(() => {
    const job = works.find((w) => w.status === 'rendering' || w.status === 'queued')
    if (!job) return
    const tick = window.setInterval(() => {
      setWorks((prev) => {
        const ix = prev.findIndex((w) => w.id === job.id)
        if (ix < 0) return prev
        const row = prev[ix]
        if (row.status === 'completed' || row.status === 'failed') return prev
        const nextProgress = Math.min(100, row.progress + (row.status === 'queued' ? 8 : 5))
        let nextStatus: DigitalHumanWork['status'] = row.status
        if (row.status === 'queued' && nextProgress >= 12) nextStatus = 'rendering'
        if (nextProgress >= 100) nextStatus = 'completed'
        const updated: DigitalHumanWork = {
          ...row,
          progress: nextProgress,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
          previewNote:
            nextStatus === 'completed'
              ? '低清预览可用；高清 MP4 合成需接入数字人渲染服务后下载。'
              : row.previewNote,
        }
        const next = [...prev]
        next[ix] = updated
        upsertDigitalHumanWork(updated)
        return next
      })
    }, 800)
    return () => window.clearInterval(tick)
  }, [works])

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

  const fetchFromDouyinLink = async () => {
    const url = draft.douyinLinkUrl.trim()
    if (!url) {
      setToast('请先粘贴抖音短视频分享链接')
      return
    }
    setLinkBusy(true)
    setLinkSourceTitle(null)
    try {
      const res = await parseDouyinLinkForDigitalHuman(url)
      if (!res.ok) {
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
      setToast(res.sourceTitle ? `已抓取「${res.sourceTitle.slice(0, 24)}…」并生成文案` : '已生成口播文案与动作指令')
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
      if (draft.driveMode === 'audio') return Boolean(draft.audioFileName)
      if (draft.driveMode === 'link') {
        return draft.script.trim().length >= 8 && draft.motionInstructions.trim().length >= 4
      }
      return draft.script.trim().length >= 8
    }
    return true
  }

  const submitRender = () => {
    const id = `dh-${Date.now()}`
    const row: DigitalHumanWork = {
      id,
      title: workTitleFromDraft(draft),
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: { ...draft },
    }
    upsertDigitalHumanWork(row)
    setWorks(loadDigitalHumanWorks())
    setRenderJobId(id)
    setToast('已提交合成队列')
  }

  const loadWorkForEdit = (w: DigitalHumanWork) => {
    setDraft({ ...w.draft })
    setMainTab('create')
    setStep(2)
    setToast(`已载入作品「${w.title}」继续编辑`)
  }

  const renderAvatarPreview = (large = false, animated = false) => {
    const box = cn(
      'relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/20 shadow-inner',
      large ? 'aspect-[9/16] max-h-[420px] w-full max-w-[240px]' : 'h-32 w-24',
      animated && 'dh-preview-live border-violet-400/60',
    )
    if (draft.customAvatarDataUrl) {
      return (
        <div className={box}>
          <img
            src={draft.customAvatarDataUrl}
            alt=""
            className={cn('h-full w-full object-cover', animated && 'dh-preview-live-img')}
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
          width={400}
          height={500}
          className={cn('h-full w-full object-cover', animated && 'dh-preview-live-img')}
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span
            className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500"
            aria-hidden
          />
          <h1 className="erp-page-title">数字人口播</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            形象管理 · 口播文案/TTS · 视频合成 · 作品库。完整高清口型渲染需运营台配置数字人服务。
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
        <WorksPanel works={works} onRefresh={refreshWorks} onEdit={loadWorkForEdit} onDelete={deleteDigitalHumanWork} />
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
                        <span className="text-xs text-slate-400">共 {filteredAvatars.length} 个形象</span>
                      </div>
                      <div className="grid max-h-[520px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                        {filteredAvatars.map((av) => (
                          <button
                            key={av.id}
                            type="button"
                            onClick={() =>
                              patchDraft({
                                avatarId: av.id,
                                customAvatarDataUrl: null,
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
                            <div className="relative mb-2 h-24 overflow-hidden rounded-lg bg-slate-100">
                              {av.previewUrl ? (
                                <img
                                  src={av.previewUrl}
                                  alt={av.name}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  decoding="async"
                                  width={400}
                                  height={500}
                                  className="h-full w-full object-cover"
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
                            <p className="truncate text-xs text-slate-500">
                              {av.style === 'realistic' ? '真人' : '卡通'} · {av.tag}
                            </p>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            patchDraft({
                              customAvatarDataUrl: String(reader.result),
                              avatarId: null,
                              avatarKind: f.type.startsWith('video/') ? 'video_clone' : 'photo',
                            })
                          }
                          reader.readAsDataURL(f)
                        }}
                      />
                      <Upload className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-2 text-sm text-slate-600">
                        上传 {draft.avatarKind === 'photo' ? '正面照片' : '参考视频'} 生成专属分身
                      </p>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                      >
                        选择文件
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
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 text-slate-600">输出分辨率</span>
                      <select
                        value={draft.resolution}
                        onChange={(e) => patchDraft({ resolution: e.target.value as '1080p' | '4k' })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="1080p">1080P</option>
                        <option value="4k">4K</option>
                      </select>
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
                          粘贴分享链接，系统自动抓取视频信息并生成口播文案与动作指令（AI Key 与智能体共用，在商家管理后台配置）。
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            value={draft.douyinLinkUrl}
                            onChange={(e) => patchDraft({ douyinLinkUrl: e.target.value })}
                            placeholder="https://v.douyin.com/… 或完整视频页链接"
                            className="min-w-[240px] flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            disabled={linkBusy}
                            onClick={() => void fetchFromDouyinLink()}
                            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                            抓取并生成
                          </button>
                        </div>
                        {linkSourceTitle ? (
                          <p className="mt-2 text-xs text-slate-600">来源：{linkSourceTitle}</p>
                        ) : null}
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1 font-medium text-slate-800">口播文案</span>
                        <textarea
                          value={draft.script}
                          onChange={(e) => patchDraft({ script: e.target.value })}
                          rows={6}
                          placeholder="抓取成功后在此编辑口播文案"
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 font-medium text-slate-800">动作指令</span>
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
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) patchDraft({ audioFileName: f.name, driveMode: 'audio' })
                        }}
                      />
                      <Mic className="mx-auto h-8 w-8 text-violet-500" />
                      <p className="mt-2 text-sm text-slate-600">上传已录制口播音频（MP3/WAV/M4A）</p>
                      {draft.audioFileName ? (
                        <p className="mt-1 text-sm font-medium text-emerald-700">{draft.audioFileName}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                        className="mt-3 rounded-lg border border-violet-300 px-4 py-2 text-sm text-violet-700"
                      >
                        选择音频
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
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) {
                            setCloneAudioName(f.name)
                            patchDraft({ voiceId: 'v-clone' })
                            setToast('音色样本已上传，合成时将使用克隆音色')
                          }
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
                    <label className="text-sm">
                      背景
                      <select
                        value={draft.background}
                        onChange={(e) => {
                          const v = e.target.value
                          patchDraft({ background: v, greenScreen: v === 'green' })
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {BACKGROUND_OPTIONS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
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
                  {draft.motionInstructions.trim() ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                      <p className="text-sm font-medium text-amber-900">链接驱动 · 动作指令</p>
                      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-amber-950">
                        {draft.motionInstructions}
                      </pre>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {step === 4 ? (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">低清预览</h2>
                  <p className="text-sm text-slate-600">
                    合成前快速预览口型与字幕布局（云端神经 TTS 试听，非最终高清成片）。
                  </p>
                  <div className="mx-auto max-w-xs">
                    <div className="relative rounded-2xl bg-slate-900 p-2">
                      {renderAvatarPreview(true)}
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
                    <li>· 输出：{draft.resolution.toUpperCase()} · {draft.frameMode === 'full' ? '全身' : '半身'}</li>
                    <li>· 音色：{selectedVoice?.label}</li>
                  </ul>
                  {activeJob ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4">
                      <p className="text-sm font-medium text-violet-900">{activeJob.title}</p>
                      <p className="mt-1 text-xs text-violet-700">
                        状态：
                        {activeJob.status === 'queued'
                          ? '排队中'
                          : activeJob.status === 'rendering'
                            ? '渲染中'
                            : activeJob.status === 'completed'
                              ? '已完成'
                              : activeJob.status}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-200">
                        <div
                          className="h-full bg-violet-600 transition-all"
                          style={{ width: `${activeJob.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={submitRender}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700"
                    >
                      <Clapperboard className="h-5 w-5" />
                      提交后台渲染
                    </button>
                  )}
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
    </div>
  )
}

function WorksPanel({
  works,
  onRefresh,
  onEdit,
  onDelete,
}: {
  works: DigitalHumanWork[]
  onRefresh: () => void
  onEdit: (w: DigitalHumanWork) => void
  onDelete: (id: string) => void
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
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {new Date(w.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={w.status !== 'completed'}
                        className="inline-flex items-center gap-1 text-violet-600 disabled:text-slate-300"
                        title={w.status === 'completed' ? '预览' : '渲染完成后可预览'}
                      >
                        <Video className="h-4 w-4" />
                        预览
                      </button>
                      <button
                        type="button"
                        disabled={w.status !== 'completed'}
                        className="inline-flex items-center gap-1 text-slate-600 disabled:text-slate-300"
                      >
                        <Download className="h-4 w-4" />
                        MP4
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(w)}
                        className="inline-flex items-center gap-1 text-cyan-700"
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

/**
 * AI 短视频 · 模仿视频：拆解参考片，换系统人物或全身照，可选声音与背景乐取段拼接。
 */
import { useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { CUSTOM_UPLOAD_VOICE_PRESETS, PRESET_AVATARS } from '../lib/digitalHumanBroadcast'
import { probeVideoDurationSec } from '../lib/digitalHumanSubtitle'
import { extractVideoFramesAtTimesPureBase64 } from '../lib/videoFrameUtils'
import { postAiChat } from '../services/ai/aiClient'
import { parseDouyinLinkForDigitalHuman } from '../services/digitalHumanDouyinLinkApi'
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'
import { checkMpAddonPointsAffordable } from '../services/mpAddonPointsSpendClient'
import { runDhMotionImitateJob } from '../lib/dhOmniHumanVideoApi'
import { formatVideoAiUserError, muxVideoAudioOnServer } from '../services/videoAiApi'

const VIDEO_MAX_BYTES = 12 * 1024 * 1024

type Shot = {
  id: string
  startSec: number
  endSec: number
  visual: string
  person: string
  action: string
  speech: string
  hasBgm: boolean
}

type BgmClip = {
  id: string
  name: string
  file: File
  durationSec: number
  startSec: number
  endSec: number
}

type VoiceMode = 'keep' | 'preset' | 'clone'
type BgmMode = 'keep' | 'custom'

function uid() {
  return `im-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function captionFromShare(text: string): string {
  const m = text.match(/】\s*([\s\S]*?)(?:https?:\/\/|$)/)
  return (m?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function explainImitateError(raw: string): string {
  const t = raw.replace(/^upstream_error\s*[—\-:]\s*/i, '').trim()
  if (/overdue balance|account has an overdue|欠费|余额不足/i.test(raw)) {
    return '豆包账户欠费，分享链接里的视频没有拉下来。请点「上传视频」选择本地文件；充值火山方舟后可以再拆链接。'
  }
  return t || '拆解失败'
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

function fallbackShots(durationSec: number, speech: string): Shot[] {
  const dur = Math.max(3, durationSec || 8)
  const parts = Math.min(4, Math.max(1, Math.ceil(dur / 4)))
  const step = dur / parts
  const lines = speech
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from({ length: parts }, (_, i) => ({
    id: uid(),
    startSec: Math.round(i * step * 10) / 10,
    endSec: Math.round(Math.min(dur, (i + 1) * step) * 10) / 10,
    visual: `第 ${i + 1} 段画面`,
    person: '主要出镜人物',
    action: '沿用参考视频中的动作与口型',
    speech: lines[i] || (i === 0 ? speech : ''),
    hasBgm: true,
  }))
}

function parseShots(text: string, durationSec: number, speechFallback: string): Shot[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return fallbackShots(durationSec, speechFallback)
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown[]
    if (!Array.isArray(arr) || !arr.length) return fallbackShots(durationSec, speechFallback)
    return arr.slice(0, 8).map((raw, i) => {
      const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      return {
        id: uid(),
        startSec: Number(o.startSec) || i,
        endSec: Number(o.endSec) || i + 1,
        visual: String(o.visual || `第 ${i + 1} 段画面`),
        person: String(o.person || '主要出镜人物'),
        action: String(o.action || '沿用参考动作'),
        speech: String(o.speech || ''),
        hasBgm: o.hasBgm !== false,
      }
    })
  } catch {
    return fallbackShots(durationSec, speechFallback)
  }
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const frames = buffer.length
  const block = channels * 2
  const dataSize = frames * block
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * block, true)
  view.setUint16(32, block, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  const chans = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i] || 0))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

async function decodeFile(ctx: AudioContext, file: Blob): Promise<AudioBuffer> {
  const copy = await file.arrayBuffer()
  return ctx.decodeAudioData(copy.slice(0))
}

async function buildMixedWav(opts: {
  narration: Blob | null
  originalAudio: Blob | null
  clips: BgmClip[]
  volume: number
  targetSec: number
}): Promise<Blob> {
  const ctx = new AudioContext()
  try {
    const pieces: AudioBuffer[] = []
    let original: AudioBuffer | null = null
    if (opts.narration) pieces.push(await decodeFile(ctx, opts.narration))
    if (opts.originalAudio) {
      try {
        original = await decodeFile(ctx, opts.originalAudio)
      } catch {
        throw new Error('浏览器拆不出成片原声。请改用系统声音，或继续沿用原片背景乐。')
      }
    }
    for (const clip of opts.clips) {
      const buf = await decodeFile(ctx, clip.file)
      const start = Math.max(0, Math.min(buf.duration - 0.05, clip.startSec))
      const end = Math.max(start + 0.2, Math.min(buf.duration, clip.endSec || buf.duration))
      const from = Math.floor(start * buf.sampleRate)
      const to = Math.floor(end * buf.sampleRate)
      const slice = ctx.createBuffer(buf.numberOfChannels, Math.max(1, to - from), buf.sampleRate)
      for (let c = 0; c < buf.numberOfChannels; c++) {
        slice.copyToChannel(buf.getChannelData(c).subarray(from, to), c)
      }
      pieces.push(slice)
    }
    const rate = 44100
    const narrationDur = opts.narration ? pieces[0]!.duration : 0
    const bgmPieces = opts.narration ? pieces.slice(1) : pieces
    const bgmDur = bgmPieces.reduce((n, b) => n + b.duration, 0)
    const total = Math.max(0.4, opts.targetSec, narrationDur, bgmDur, original?.duration || 0)
    const offline = new OfflineAudioContext(2, Math.ceil(total * rate), rate)
    if (original) {
      const src = offline.createBufferSource()
      src.buffer = original
      src.connect(offline.destination)
      src.start(0)
    }
    if (opts.narration) {
      const src = offline.createBufferSource()
      src.buffer = pieces[0]!
      src.connect(offline.destination)
      src.start(0)
    }
    let cursor = 0
    const gain = offline.createGain()
    gain.gain.value = Math.max(0, Math.min(1, opts.volume))
    gain.connect(offline.destination)
    for (const buf of bgmPieces) {
      const src = offline.createBufferSource()
      src.buffer = buf
      src.connect(gain)
      src.start(cursor)
      cursor += buf.duration
    }
    const mixed = await offline.startRendering()
    return encodeWav(mixed)
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

const REAL_AVATARS = [
  ...PRESET_AVATARS.filter((a) => a.style === 'realistic' && a.bodyFrame === 'full'),
  ...PRESET_AVATARS.filter((a) => a.style === 'realistic' && a.bodyFrame !== 'full'),
]

export default function ShortVideoImitateStudio() {
  const videoInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const voiceInputRef = useRef<HTMLInputElement>(null)
  const bgmInputRef = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState('')
  const [durationSec, setDurationSec] = useState(0)
  const [linkNote, setLinkNote] = useState('')
  const [shots, setShots] = useState<Shot[]>([])
  const [presetId, setPresetId] = useState(REAL_AVATARS[0]?.id || '')
  const [useUpload, setUseUpload] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('keep')
  const [voiceId, setVoiceId] = useState(CUSTOM_UPLOAD_VOICE_PRESETS[0]?.id || 'v-custom-female')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [bgmMode, setBgmMode] = useState<BgmMode>('keep')
  const [bgmClips, setBgmClips] = useState<BgmClip[]>([])
  const [bgmVolume, setBgmVolume] = useState(0.35)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const [resultUrl, setResultUrl] = useState('')

  const speechText = useMemo(
    () => shots.map((s) => s.speech.trim()).filter(Boolean).join('\n'),
    [shots],
  )

  function setVideo(file: File) {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
    setShots([])
    setErr('')
    void probeVideoDurationSec(file).then((n) => setDurationSec(n > 0 ? n : 0))
  }

  async function onAnalyze() {
    setErr('')
    setBusy(true)
    setProgress('正在拆解参考视频…')
    try {
      let speechHint = ''
      let motionHint = ''
      let activeFile = videoFile
      if (link.trim()) {
        setProgress('正在读取分享链接里的口播…')
        const parsed = await parseDouyinLinkForDigitalHuman(link.trim())
        if (!parsed.ok) {
          const caption = captionFromShare(link)
          if (caption) {
            setShots(fallbackShots(durationSec || 8, caption))
            setLinkNote('已按分享文案写了一版镜头，可直接改。')
          }
          setErr(explainImitateError(parsed.message || '链接解析失败'))
          return
        }
        speechHint = parsed.script || ''
        motionHint = parsed.motionInstructions || ''
        setLinkNote(parsed.sourceTitle ? `已读取：${parsed.sourceTitle}` : '已读取链接中的口播')
        if (/^https?:\/\/.+\.(mp4|mov|webm)(\?|$)/i.test(parsed.normalizedUrl) && !videoFile) {
          try {
            const res = await fetch(parsed.normalizedUrl)
            if (res.ok) {
              const blob = await res.blob()
              if (blob.size > 1024 && blob.size <= VIDEO_MAX_BYTES) {
                activeFile = new File([blob], 'link.mp4', { type: blob.type || 'video/mp4' })
                setVideo(activeFile)
              }
            }
          } catch {
            setLinkNote('链接口播已读取。请再上传视频文件，才能按画面换人。')
          }
        }
      }
      const file = activeFile
      if (!file && !speechHint) {
        setErr('请先上传视频，或粘贴分享链接')
        return
      }
      if (!file) {
        setShots(fallbackShots(durationSec || 12, speechHint))
        if (motionHint && speechHint) {
          setShots((prev) => prev.map((s, i) => (i === 0 ? { ...s, action: motionHint.slice(0, 180) } : s)))
        }
        return
      }
      if (file.size > VIDEO_MAX_BYTES) {
        setErr('参考视频请压缩到 12MB 以内')
        return
      }
      const dur = durationSec || (await probeVideoDurationSec(file)) || 8
      setDurationSec(dur)
      const times = [0.4, dur * 0.35, dur * 0.68].filter((t) => t < dur - 0.1)
      setProgress('正在按镜头抽帧…')
      const frames = await extractVideoFramesAtTimesPureBase64(file, times.length ? times : [0.4])
      setProgress('正在分析画面、人物、动作和口播…')
      let text = ''
      try {
        const chat = await postAiChat({
          provider: 'tokenmix',
          modelFamily: 'gemini',
          stream: false,
          temperature: 0.2,
          imageDataUrls: frames.slice(0, 3).map((f) => `data:image/jpeg;base64,${f.pureBase64}`),
          messages: [
            {
              role: 'user',
              content: [
                `参考视频约 ${dur.toFixed(1)} 秒。按时间顺序拆成 2 到 4 个镜头。`,
                speechHint ? `已识别口播：\n${speechHint.slice(0, 800)}` : '请根据画面推断口播，听不清就留空。',
                motionHint ? `动作提示：${motionHint.slice(0, 300)}` : '',
                '只返回 JSON 数组，每项字段：startSec,endSec,visual,person,action,speech,hasBgm。',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        })
        text = chat.content || ''
      } catch {
        setLinkNote('画面模型暂不可用，已按视频时长生成可编辑拆解稿。')
      }
      setShots(parseShots(text, dur, speechHint))
    } catch (e) {
      setErr(explainImitateError(e instanceof Error ? e.message : '拆解失败'))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  function patchShot(id: string, patch: Partial<Shot>) {
    setShots((rows) => rows.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function moveShot(id: string, dir: -1 | 1) {
    setShots((rows) => {
      const i = rows.findIndex((s) => s.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= rows.length) return rows
      const next = rows.slice()
      const [row] = next.splice(i, 1)
      next.splice(j, 0, row!)
      return next
    })
  }

  async function chosenPhotoFile(): Promise<File> {
    if (useUpload) {
      if (!photoFile) throw new Error('请上传一张全身或半身照片')
      return photoFile
    }
    const avatar = REAL_AVATARS.find((a) => a.id === presetId) || REAL_AVATARS[0]
    if (!avatar) throw new Error('请选择人物')
    const res = await fetch(avatar.previewUrl)
    if (!res.ok) throw new Error('系统人物图加载失败，请改上传照片')
    const blob = await res.blob()
    return new File([blob], `${avatar.id}.jpg`, { type: blob.type || 'image/jpeg' })
  }

  async function onGenerate() {
    setErr('')
    setResultUrl('')
    if (!videoFile) {
      setErr('请上传参考视频。分享链接只负责拆口播，换人需要视频文件。')
      return
    }
    if (videoFile.size > VIDEO_MAX_BYTES) {
      setErr('参考视频请压缩到 12MB 以内')
      return
    }
    if (!shots.length) {
      setErr('请先拆解参考视频')
      return
    }
    const est = Math.min(15, Math.max(1, Math.ceil(durationSec || 8)))
    const afford = await checkMpAddonPointsAffordable('shortvideo', est, { motionImitate: true })
    if (!afford.ok) {
      setErr(afford.message || '积分不足')
      return
    }
    setBusy(true)
    try {
      setProgress('准备人物…')
      const photo = await chosenPhotoFile()
      const who = useUpload ? '上传照片中的人物' : REAL_AVATARS.find((a) => a.id === presetId)?.name || '所选人物'
      const prompt = [
        `将参考视频中的主要出镜人物替换为${who}，尽量使用全身或半身构图。`,
        '保持参考视频的动作、口型、运镜和场景。',
        ...shots.map(
          (s, i) =>
            `镜头${i + 1} ${s.startSec}-${s.endSec}s：${s.visual}；人物${s.person}；动作${s.action}；口播「${s.speech}」`,
        ),
        voiceMode === 'keep' ? '保留原片人声。' : '口播将在成片后替换为所选声音。',
        bgmMode === 'keep' ? '保留原片背景乐。' : '背景乐将替换为用户上传并裁好的音乐。',
      ].join('')
      setProgress('动作模仿生成中…')
      const [imageRaw, videoRaw] = await Promise.all([readDataUrl(photo), readDataUrl(videoFile)])
      const job = await runDhMotionImitateJob({
        image_base64: imageRaw,
        video_base64: videoRaw,
        prompt,
        onProgress: (label) => setProgress(label),
      })
      if (!job.ok) {
        setErr(explainImitateError(formatVideoAiUserError(job.message)))
        return
      }
      let videoBlob = await fetch(job.videoUrl).then((r) => r.blob())
      let narration: Blob | null = null
      const keepOriginalAudio = voiceMode === 'keep' && bgmMode === 'custom' && bgmClips.length > 0
      if (voiceMode !== 'keep') {
        setProgress('正在按拆解稿合成声音…')
        const text = speechText || shots.map((s) => s.visual).join('。')
        let referenceAudioBase64: string | undefined
        if (voiceMode === 'clone') {
          if (!voiceFile) throw new Error('请上传一段清晰的人声音频，用于模仿声音')
          const dataUrl = await readDataUrl(voiceFile)
          referenceAudioBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        }
        const voicePreset = CUSTOM_UPLOAD_VOICE_PRESETS.find((v) => v.id === voiceId)
        const spoken = await synthesizeDigitalHumanSpeech({
          text: text.slice(0, 480),
          voicePresetId: voiceMode === 'clone' ? 'v-clone' : voiceId,
          speechRate: voicePreset?.rate ?? 1,
          speechPitch: voicePreset?.pitch ?? 1,
          referenceAudioBase64,
        })
        if (!spoken.ok) throw new Error(spoken.message)
        const binary = atob(spoken.audioBase64.replace(/\s/g, ''))
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        narration = new Blob([bytes], { type: spoken.mimeType || 'audio/mpeg' })
      }
      if (narration || (bgmMode === 'custom' && bgmClips.length)) {
        setProgress('正在混合声音和背景乐…')
        const wav = await buildMixedWav({
          narration,
          originalAudio: keepOriginalAudio ? videoBlob : null,
          clips: bgmMode === 'custom' ? bgmClips : [],
          volume: bgmVolume,
          targetSec: est,
        })
        videoBlob = await muxVideoAudioOnServer(videoBlob, wav, { timeoutMs: 180_000 })
      }
      const url = URL.createObjectURL(videoBlob)
      setResultUrl(url)
      setProgress('')
    } catch (e) {
      setErr(explainImitateError(e instanceof Error ? e.message : '模仿生成失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-cyan-200/80 bg-cyan-50/40 p-3">
      <p className="text-sm font-medium text-slate-800">模仿视频</p>
      <p className="text-xs leading-relaxed text-slate-600">
        上传参考视频，或先粘贴分享链接拆口播。系统按镜头写出画面、人物、动作、口播和有没有背景乐。再选系统人物或上传全身照，声音和背景乐可以沿用原片，也可以换成自己的。
      </p>
      <label className="block text-xs font-medium text-slate-700">
        分享链接（可选）
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
          placeholder="抖音分享口令或链接，用来拆口播和动作"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      {linkNote ? <p className="text-xs text-cyan-800">{linkNote}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">参考视频</p>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setVideo(f)
            }}
          />
          {videoPreview ? (
            <video src={videoPreview} controls playsInline className="max-h-56 w-full rounded-lg bg-black object-contain" />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => videoInputRef.current?.click()}
              className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500"
            >
              {link.trim() ? '链接没变成视频，请上传' : '上传视频'}
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            {link.trim() && !videoFile
              ? '分享链接只带口播。参考视频请从相册上传 MP4 / MOV，约 3～15 秒，12MB 以内。'
              : 'MP4 / MOV，约 3～15 秒，12MB 以内。'}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">人物</p>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${!useUpload ? 'bg-cyan-600 text-white' : 'bg-white ring-1 ring-slate-200'}`}
              onClick={() => setUseUpload(false)}
            >
              系统人物
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${useUpload ? 'bg-cyan-600 text-white' : 'bg-white ring-1 ring-slate-200'}`}
              onClick={() => setUseUpload(true)}
            >
              上传全身照
            </button>
          </div>
          {useUpload ? (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  if (photoPreview) URL.revokeObjectURL(photoPreview)
                  setPhotoFile(f)
                  setPhotoPreview(URL.createObjectURL(f))
                }}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="上传人物" className="h-28 w-20 rounded-lg object-cover" />
              ) : null}
              <button type="button" className="text-xs text-cyan-700" onClick={() => photoInputRef.current?.click()}>
                {photoFile ? '更换照片' : '上传照片（建议全身）'}
              </button>
            </>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {REAL_AVATARS.slice(0, 8).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPresetId(a.id)}
                  className={`shrink-0 rounded-lg border p-1 ${presetId === a.id ? 'border-cyan-500' : 'border-transparent'}`}
                >
                  <img src={a.previewUrl} alt={a.name} className="h-16 w-12 rounded object-cover" />
                  <span className="mt-0.5 block text-[10px] text-slate-600">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onAnalyze()}
        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-cyan-800 ring-1 ring-cyan-200 disabled:opacity-50"
      >
        {busy && progress.includes('拆') ? '拆解中…' : '拆解画面 / 口播 / 背景乐'}
      </button>
      {shots.length ? (
        <div className="space-y-2">
          {shots.map((s, i) => (
            <div key={s.id} className="rounded-lg bg-white p-2 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  镜头 {i + 1} · {s.startSec}s–{s.endSec}s
                </p>
                <span className="flex gap-2 text-cyan-700">
                  <button type="button" onClick={() => moveShot(s.id, -1)}>
                    上移
                  </button>
                  <button type="button" onClick={() => moveShot(s.id, 1)}>
                    下移
                  </button>
                  <button type="button" className="text-red-600" onClick={() => setShots((rows) => rows.filter((x) => x.id !== s.id))}>
                    删除
                  </button>
                </span>
              </div>
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={s.visual}
                onChange={(e) => patchShot(s.id, { visual: e.target.value })}
              />
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={s.action}
                onChange={(e) => patchShot(s.id, { action: e.target.value })}
                placeholder="动作"
              />
              <textarea
                className="mt-1 w-full rounded border px-2 py-1"
                rows={2}
                value={s.speech}
                onChange={(e) => patchShot(s.id, { speech: e.target.value })}
                placeholder="口播，可改"
              />
              <label className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.hasBgm}
                  onChange={(e) => patchShot(s.id, { hasBgm: e.target.checked })}
                />
                这段有背景乐
              </label>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 text-xs">
          <p className="font-medium text-slate-700">声音</p>
          {(
            [
              ['keep', '沿用原片人声'],
              ['preset', '系统音色'],
              ['clone', '上传声音让 AI 模仿'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2">
              <input type="radio" checked={voiceMode === id} onChange={() => setVoiceMode(id)} />
              {label}
            </label>
          ))}
          {voiceMode === 'preset' ? (
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full rounded border bg-white px-2 py-1"
            >
              {CUSTOM_UPLOAD_VOICE_PRESETS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : null}
          {voiceMode === 'clone' ? (
            <>
              <input
                ref={voiceInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a"
                className="hidden"
                onChange={(e) => {
                  setVoiceFile(e.target.files?.[0] || null)
                  e.target.value = ''
                }}
              />
              <button type="button" className="text-cyan-700" onClick={() => voiceInputRef.current?.click()}>
                {voiceFile ? voiceFile.name : '上传清晰人声'}
              </button>
            </>
          ) : null}
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-medium text-slate-700">背景乐</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={bgmMode === 'keep'} onChange={() => setBgmMode('keep')} />
            沿用原片
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={bgmMode === 'custom'} onChange={() => setBgmMode('custom')} />
            自己的音乐（可取段、可接多段）
          </label>
          {bgmMode === 'custom' ? (
            <>
              <input
                ref={bgmInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  void probeVideoDurationSec(f).then((n) => {
                    const dur = n > 0 ? n : 15
                    setBgmClips((rows) => [
                      ...rows,
                      { id: uid(), name: f.name, file: f, durationSec: dur, startSec: 0, endSec: Math.min(15, dur) },
                    ])
                  })
                }}
              />
              <button type="button" className="text-cyan-700" onClick={() => bgmInputRef.current?.click()}>
                添加一段音乐
              </button>
              {bgmClips.map((c) => (
                <div key={c.id} className="rounded border bg-white p-2">
                  <p className="truncate">{c.name}</p>
                  <label className="mt-1 block">
                    从 {c.startSec.toFixed(1)}s
                    <input
                      type="range"
                      min={0}
                      max={c.durationSec}
                      step={0.1}
                      value={c.startSec}
                      onChange={(e) => {
                        const startSec = Number(e.target.value)
                        setBgmClips((rows) =>
                          rows.map((x) => (x.id === c.id ? { ...x, startSec, endSec: Math.max(x.endSec, startSec + 0.2) } : x)),
                        )
                      }}
                    />
                  </label>
                  <label className="block">
                    到 {c.endSec.toFixed(1)}s
                    <input
                      type="range"
                      min={0}
                      max={c.durationSec}
                      step={0.1}
                      value={c.endSec}
                      onChange={(e) => {
                        const endSec = Number(e.target.value)
                        setBgmClips((rows) => rows.map((x) => (x.id === c.id ? { ...x, endSec } : x)))
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => setBgmClips((rows) => rows.filter((x) => x.id !== c.id))}
                  >
                    移除
                  </button>
                </div>
              ))}
              <label className="block">
                音量 {Math.round(bgmVolume * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                />
              </label>
            </>
          ) : null}
        </div>
      </div>
      {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      {progress ? <p className="text-xs text-cyan-800">{progress}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onGenerate()}
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? '生成中…' : '开始模仿'}
      </button>
      {resultUrl ? <video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-lg bg-black" /> : null}
    </div>
  )
}

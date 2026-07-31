/**
 * 短视频 AI 成片后处理：口播 TTS、混入音轨、烧录中文字幕（避免模型画面内乱码字）。
 */
import {
  downloadVideoUrlAsBlob,
  muxVideoAudioOnServer,
  postProcessVideoOnServer,
} from '../services/videoAiApi'
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'
import { muxAudioWithVideoBlob } from './concatVideoSegments'
import { CUSTOM_UPLOAD_VOICE_PRESETS, SUBTITLE_STYLES } from './digitalHumanBroadcast'
import { resolveDhSubtitleStyleForBurn } from './digitalHumanPostProcessStyles'
import {
  buildSrtContent,
  buildSrtFromScriptRows,
  probeVideoDurationSec,
  SHORT_VIDEO_SUBTITLE_MAX_CHARS,
  splitSubtitleLines,
  type ScriptRowForSubtitle,
} from './digitalHumanSubtitle'
import {
  finalizeNarrationScript,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
  isValidShortVideoSubtitleScript,
} from './shortVideoNarrationExtract'

export {
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
  finalizeNarrationScript,
  isValidShortVideoSubtitleScript,
}

/** 短片字幕板式：auto = 按执导/口播提示词推断 */
export const SHORT_VIDEO_SUBTITLE_STYLE_AUTO = 'auto' as const

const STYLE_LABEL_HINTS: Array<{ id: string; re: RegExp }> = [
  { id: 'bottom-safe', re: /底部安全|安全区/ },
  { id: 'bottom-white-large', re: /底部大白字|大白字/ },
  { id: 'bottom-white', re: /底部白字|白字黑边/ },
  { id: 'bottom-yellow', re: /底部黄字|黄字/ },
  { id: 'bottom-pink', re: /底部粉字|粉字|种草字/ },
  { id: 'bottom-green', re: /底部绿字|绿字/ },
  { id: 'center-white', re: /居中白字|居中大字|画面中央/ },
  { id: 'top-news', re: /顶部新闻|新闻条/ },
  { id: 'top-minimal', re: /顶部简约|顶栏字幕|顶部字幕/ },
  { id: 'cinematic', re: /电影感|胶片感|质感小字/ },
]

/**
 * 根据执导文案 / 口播 / 分镜文本自动选字幕板式。
 * 优先识别「字幕样式：xxx」显式指定，再按题材关键词，默认 bottom-safe。
 */
export function pickShortVideoSubtitleStyleFromPrompt(text: string): string {
  const t = String(text || '').trim()
  if (!t) return 'bottom-safe'

  const explicit = t.match(/字幕(?:样式|板式|风格)\s*[：:]\s*([^\n，,。；;]{2,24})/)
  if (explicit?.[1]) {
    const tip = explicit[1].trim()
    for (const row of STYLE_LABEL_HINTS) {
      if (row.re.test(tip) || tip.includes(row.id)) return row.id
    }
    const byLabel = SUBTITLE_STYLES.find(
      (s) => s.label.includes(tip) || tip.includes(s.label.replace(/（.*?）/g, '')),
    )
    if (byLabel) return byLabel.id
  }

  for (const row of STYLE_LABEL_HINTS) {
    if (row.re.test(t)) return row.id
  }

  if (/新闻|资讯|播报|头条|快讯/.test(t)) return 'top-news'
  if (/电影感|胶片|氛围感|质感大片|纪录片|叙事感/.test(t)) return 'cinematic'
  if (/促销|限时|秒杀|福利|打折|满减|特价/.test(t)) return 'bottom-green'
  if (/种草|好物|测评|安利|必买/.test(t)) return 'bottom-pink'
  if (/大字报|爆款字|冲击字幕|醒目大字/.test(t)) return 'bottom-white-large'
  if (/探店|夜市|烟火|街头|门店|市井/.test(t)) return 'bottom-yellow'
  // 界面/手机/SaaS 演示：必须安全区，避免压主体
  if (/界面|屏幕|手机|看板|ERP|SaaS|App|软件|对话框|特写手|握着手机|切\s*App/.test(t)) {
    return 'bottom-safe'
  }
  return 'bottom-safe'
}

export function resolveShortVideoSubtitleStyle(opts: {
  preference?: string | null
  styleHintText?: string | null
}): { styleId: string; label: string; auto: boolean } {
  const pref = String(opts.preference || SHORT_VIDEO_SUBTITLE_STYLE_AUTO).trim()
  const auto = !pref || pref === SHORT_VIDEO_SUBTITLE_STYLE_AUTO
  const raw = auto
    ? pickShortVideoSubtitleStyleFromPrompt(String(opts.styleHintText || ''))
    : pref
  const styleId = resolveDhSubtitleStyleForBurn(raw)
  const label = SUBTITLE_STYLES.find((s) => s.id === styleId)?.label ?? styleId
  return { styleId, label, auto }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function synthesizeShortVideoNarration(
  script: string,
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const text = script.trim()
  if (text.length < 4) {
    return { ok: false, message: '口播文案过短，跳过配音' }
  }
  const voice = CUSTOM_UPLOAD_VOICE_PRESETS[0]!
  const r = await synthesizeDigitalHumanSpeech({
    text,
    voicePresetId: voice.id,
    speechRate: 1,
    speechPitch: 1,
  })
  if (!r.ok) return r
  return { ok: true, blob: base64ToBlob(r.audioBase64, r.mimeType) }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(ms / 1000)}秒），已跳过以免卡住`))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function muxNarrationPreferFullVideo(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  try {
    return await withTimeout(muxAudioWithVideoBlob(videoBlob, audioBlob), 45_000, '浏览器混音')
  } catch {
    return withTimeout(
      muxVideoAudioOnServer(videoBlob, audioBlob, { timeoutMs: 75_000 }),
      80_000,
      '服务端混音',
    )
  }
}

/** 无声 AI 视频 → 配音 + 中文字幕烧录；口播长于画面时延长末帧而非裁音频 */
export async function finalizeShortVideoOutput(
  source: string | Blob,
  narrationSource: string,
  onProgress?: (msg: string) => void,
  opts?: {
    targetDurationSec?: number
    preferFullNarration?: boolean
    productImageBase64?: string
    productStartSec?: number
    productEndSec?: number
    /** 有分镜时按 timeRange+dialogue 对齐字幕时间轴 */
    scriptRows?: ScriptRowForSubtitle[] | null
    /** 字幕板式：auto 或具体 styleId；默认 auto */
    subtitleStyle?: string | null
    /** 用于自动推断板式的执导/分镜全文（可含提示词） */
    styleHintText?: string | null
  },
): Promise<{ ok: true; objectUrl: string; blob: Blob } | { ok: false; message: string }> {
  onProgress?.('下载 AI 视频…')
  let videoBlob: Blob
  try {
    videoBlob =
      typeof source === 'string'
        ? await withTimeout(downloadVideoUrlAsBlob(source), 90_000, '下载成片')
        : source
  } catch (e) {
    const msg = e instanceof Error ? e.message : '下载成片失败'
    return { ok: false, message: msg }
  }

  const probedDur = await probeVideoDurationSec(videoBlob)
  const plannedDur =
    opts?.targetDurationSec && opts.targetDurationSec > 0 ? opts.targetDurationSec : 0
  const capDur =
    opts?.preferFullNarration && plannedDur > 0
      ? plannedDur
      : opts?.targetDurationSec && opts?.targetDurationSec > 0
        ? opts.targetDurationSec
        : probedDur > 0
          ? probedDur
          : 30

  const script = finalizeNarrationScript(narrationSource, capDur)
  if (script.length < 4) {
    const objectUrl = URL.createObjectURL(videoBlob)
    return { ok: true, objectUrl, blob: videoBlob }
  }

  // 口播 TTS：有可读稿即可；上屏字幕另做有效性校验（分镜有口播也可烧）
  const allowTts = isValidShortVideoSubtitleScript(script) || looksLikeSpokenNarrationLoose(script)
  const rowsHaveDialogue = Boolean(
    opts?.scriptRows?.some((r) => {
      const d = String(r.dialogue || '').trim()
      return d.length >= 2 && !/^[(（]?\s*无口播\s*[)）]?$/.test(d)
    }),
  )
  const burnSubtitles = isValidShortVideoSubtitleScript(script) || rowsHaveDialogue

  onProgress?.('合成口播配音…')
  let tts: { ok: true; blob: Blob } | { ok: false; message: string }
  if (allowTts) {
    try {
      tts = await withTimeout(synthesizeShortVideoNarration(script), 60_000, '口播配音')
    } catch (e) {
      tts = { ok: false, message: e instanceof Error ? e.message : '口播配音失败' }
    }
  } else {
    tts = { ok: false, message: '口播稿无效，跳过配音与字幕' }
  }
  let merged = videoBlob
  if (tts.ok) {
    onProgress?.('混入口播音轨（口播优先，画面不足时延长末帧）…')
    try {
      merged = await muxNarrationPreferFullVideo(videoBlob, tts.blob)
    } catch (e) {
      // 混音失败仍交付无声成片，避免卡在「合成口播」二十分钟
      onProgress?.(
        `混音跳过：${e instanceof Error ? e.message : '音视频合成失败'}，先交付画面`,
      )
      merged = videoBlob
    }
  } else {
    onProgress?.(`配音跳过：${tts.message}`)
  }

  const mergedDur = await probeVideoDurationSec(merged)
  const subtitleDur =
    mergedDur > 0
      ? mergedDur
      : opts?.preferFullNarration && plannedDur > 0
        ? plannedDur
        : capDur
  // 产品特写叠加时不烧字幕，避免遮挡重点画面；无效口播亦不烧录
  const productB64 = opts?.productImageBase64?.replace(/\s/g, '')
  const hasProductOverlay = Boolean(productB64 && productB64.length > 256)
  const fromRows =
    burnSubtitles && !hasProductOverlay && subtitleDur > 0
      ? buildSrtFromScriptRows(opts?.scriptRows, subtitleDur, {
          maxCharsPerLine: SHORT_VIDEO_SUBTITLE_MAX_CHARS,
        })
      : ''
  const srt =
    fromRows.trim() ||
    (burnSubtitles && !hasProductOverlay && subtitleDur > 0 && isValidShortVideoSubtitleScript(script)
      ? buildSrtContent(splitSubtitleLines(script, SHORT_VIDEO_SUBTITLE_MAX_CHARS), subtitleDur)
      : '')
  const rowHint = (opts?.scriptRows || [])
    .map((r) => `${r.dialogue || ''}`)
    .join('\n')
  const stylePick = resolveShortVideoSubtitleStyle({
    preference: opts?.subtitleStyle,
    styleHintText: [opts?.styleHintText, narrationSource, script, rowHint].filter(Boolean).join('\n'),
  })

  // 超大成片 base64 上传极易卡死；跳过烧录仍可预览带口播版本
  const tooHeavyForBurn = merged.size > 48 * 1024 * 1024
  if ((srt.trim() || hasProductOverlay) && tooHeavyForBurn) {
    onProgress?.('成片体积较大，已跳过字幕烧录以免长时间卡住（可预览带口播版本）')
  } else if (srt.trim() || hasProductOverlay) {
    onProgress?.(
      hasProductOverlay && srt.trim()
        ? '烧录字幕并叠加产品特写…'
        : hasProductOverlay
          ? '叠加产品特写（跳过字幕以免遮挡）…'
          : fromRows.trim()
            ? `烧录中文字幕（按分镜时间轴·${stylePick.label}${stylePick.auto ? '·自动' : ''}）…`
            : `烧录中文字幕（${stylePick.label}${stylePick.auto ? '·自动' : ''}）…`,
    )
    try {
      merged = await withTimeout(
        postProcessVideoOnServer(merged, {
          srtContent: srt.trim() || undefined,
          subtitleStyle: stylePick.styleId,
          productImageBase64: hasProductOverlay ? productB64 : undefined,
          productStartSec: hasProductOverlay ? opts?.productStartSec : undefined,
          productEndSec: hasProductOverlay ? opts?.productEndSec : undefined,
          minDurationSec: plannedDur > 0 ? plannedDur : opts?.targetDurationSec,
          timeoutMs: 75_000,
        }),
        80_000,
        '字幕烧录',
      )
    } catch (e) {
      onProgress?.(
        `字幕烧录跳过：${e instanceof Error ? e.message : '后处理失败'}，已保留当前成片`,
      )
    }
  } else if (!burnSubtitles) {
    onProgress?.('已取消无效字幕烧录，保留画面清晰度')
  }

  onProgress?.('成片已就绪')
  const objectUrl = URL.createObjectURL(merged)
  return { ok: true, objectUrl, blob: merged }
}

/** 宽松：能念但未必适合上屏（仍可 TTS） */
function looksLikeSpokenNarrationLoose(script: string): boolean {
  const t = script.trim()
  if (t.length < 4) return false
  if (/待填|placeholder|TODO/i.test(t)) return false
  return (t.match(/[\u4e00-\u9fff]/g) || []).length >= 4
}

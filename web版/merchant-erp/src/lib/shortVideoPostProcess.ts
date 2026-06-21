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
import { CUSTOM_UPLOAD_VOICE_PRESETS } from './digitalHumanBroadcast'
import { buildSrtContent, probeVideoDurationSec, splitSubtitleLines } from './digitalHumanSubtitle'

export const SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX =
  '【画面约束】禁止在视频画面内渲染任何文字、字幕、标题、Logo 字样或乱码字符；口播与字幕由后期合成。'

const METADATA_LINE =
  /^(总时长|时长|适配比例|画幅|比例|帧率|fps|BGM|背景音乐|配乐|字幕样式|字体|分辨率|水印)/i

/** 提交给视频模型前：去掉技术参数行，避免模型把元数据画进画面 */
export function sanitizePromptForVideoModel(prompt: string): string {
  const lines = prompt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !METADATA_LINE.test(l) && !/^--dur\s/i.test(l))
  let body = lines.join('\n').trim()
  if (!body) body = prompt.trim()
  if (!body.includes('【画面约束】')) {
    body = `${body}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}`
  }
  return body
}

const GUIDANCE_INSTRUCTION_LINE =
  /^(AI生成|生成技巧|使用技巧|分镜参考|参考图|上传|模型选择|时长|画幅|帧率|提示词说明|执导说明|建议|注意[:：]|说明[:：])/i

/** 从执导/指导文案提取可朗读口播（过滤制作说明，不直接朗读操作提示） */
export function extractShortVideoNarrationScript(prompt: string): string {
  const raw = prompt.trim()
  if (!raw) return ''

  const spokenBlocks: string[] = []
  for (const block of raw.split(/\n{2,}/)) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !METADATA_LINE.test(l))
      .filter((l) => !GUIDANCE_INSTRUCTION_LINE.test(l))
      .filter((l) => !l.startsWith('【画面约束】') && !l.startsWith('【产品呈现】'))
      .filter((l) => !/^[-*•]\s/.test(l))
      .map((l) => l.replace(/【[^】]+】/g, '').trim())
      .filter((l) => l.length >= 2)
    if (!lines.length) continue
    const joined = lines.join('，').replace(/，+/g, '，')
    if (/口播[:：]/.test(block)) {
      const m = block.match(/口播[:：]\s*([\s\S]+)/)
      if (m?.[1]?.trim()) spokenBlocks.push(m[1].trim())
      continue
    }
    if (!/技巧|上传.*图|参考图|生成模式|AI生成/i.test(block)) {
      spokenBlocks.push(joined)
    }
  }

  if (spokenBlocks.length) {
    return spokenBlocks.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !METADATA_LINE.test(l))
    .filter((l) => !GUIDANCE_INSTRUCTION_LINE.test(l))
    .filter((l) => !l.startsWith('【画面约束】') && !l.startsWith('【产品呈现】'))
    .filter((l) => !/^[-*•]\s/.test(l))
    .map((l) => l.replace(/【[^】]+】/g, '').trim())
    .filter((l) => l.length >= 2)

  if (lines.length) {
    return lines.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  return raw
    .replace(SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, '')
    .replace(/【[^】]+】/g, '')
    .trim()
    .slice(0, 520)
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
    text: text.slice(0, 480),
    voicePresetId: voice.id,
    speechRate: 1,
    speechPitch: 1,
  })
  if (!r.ok) return r
  return { ok: true, blob: base64ToBlob(r.audioBase64, r.mimeType) }
}

async function muxNarrationPreferFullVideo(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  try {
    return await muxAudioWithVideoBlob(videoBlob, audioBlob)
  } catch {
    return muxVideoAudioOnServer(videoBlob, audioBlob)
  }
}

/** 无声 AI 视频 → 配音 + 中文字幕烧录，保持视频轨完整时长 */
export async function finalizeShortVideoOutput(
  source: string | Blob,
  narrationSource: string,
  onProgress?: (msg: string) => void,
): Promise<{ ok: true; objectUrl: string; blob: Blob } | { ok: false; message: string }> {
  onProgress?.('下载 AI 视频…')
  const videoBlob =
    typeof source === 'string' ? await downloadVideoUrlAsBlob(source) : source

  const script = extractShortVideoNarrationScript(narrationSource)
  if (script.length < 4) {
    const objectUrl = URL.createObjectURL(videoBlob)
    return { ok: true, objectUrl, blob: videoBlob }
  }

  onProgress?.('合成口播配音…')
  const tts = await synthesizeShortVideoNarration(script)
  let merged = videoBlob
  if (tts.ok) {
    onProgress?.('混入口播音轨（保持原视频时长）…')
    try {
      merged = await muxNarrationPreferFullVideo(videoBlob, tts.blob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '音视频合成失败'
      return { ok: false, message: msg }
    }
  } else {
    onProgress?.(`配音跳过：${tts.message}，仅烧录字幕…`)
  }

  const dur = await probeVideoDurationSec(merged)
  const srt = dur > 0 ? buildSrtContent(splitSubtitleLines(script), dur) : ''
  if (srt.trim()) {
    onProgress?.('烧录中文字幕…')
    try {
      merged = await postProcessVideoOnServer(merged, {
        srtContent: srt,
        subtitleStyle: 'bottom-white',
      })
    } catch {
      /* 字幕失败仍返回带配音版本 */
    }
  }

  const objectUrl = URL.createObjectURL(merged)
  return { ok: true, objectUrl, blob: merged }
}

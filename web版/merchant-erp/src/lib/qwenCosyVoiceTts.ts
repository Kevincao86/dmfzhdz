/**
 * 通义千问语音合成（CosyVoice / Sambert HTTP），额度不足时由调用方轮询模型池。
 */
import {
  cosyVoiceForGender,
  isCosyVoiceModel,
  isSambertModel,
  qwenDhTtsModelCandidates,
  sambertVoiceForGender,
} from './qwenSpeechCatalog.js'
import { isArkQuotaHopableError } from './arkModelCatalog.js'

const DASHSCOPE_TTS = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'

export type QwenTtsSynthInput = {
  text: string
  gender: '男' | '女'
  speechRate?: number
  speechPitch?: number
  /** 语音克隆参考音频（纯 base64） */
  referenceAudioBase64?: string
  referenceText?: string
}

function qwenKey(env: Record<string, string>): string | null {
  return (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim() || null
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function toCosyRate(speechRate: number): number {
  return clamp(Number(speechRate) || 1, 0.5, 2)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(text.slice(0, 240) || `HTTP ${res.status}`)
  }
}

function extractAudioBase64(j: Record<string, unknown>): string | null {
  const output = j.output as Record<string, unknown> | undefined
  if (output && typeof output.audio === 'string' && output.audio.trim()) {
    return output.audio.replace(/\s/g, '')
  }
  if (typeof j.audio === 'string' && j.audio.trim()) return j.audio.replace(/\s/g, '')
  const data = j.data as { audio?: string } | undefined
  if (data && typeof data.audio === 'string' && data.audio.trim()) {
    return data.audio.replace(/\s/g, '')
  }
  return null
}

async function callQwenTtsOnce(
  apiKey: string,
  modelId: string,
  input: QwenTtsSynthInput,
): Promise<{ audioBase64: string; modelUsed: string; voice: string }> {
  const text = input.text.trim().slice(0, 500)
  if (text.length < 2) throw new Error('口播文案过短')

  const isSambert = isSambertModel(modelId)
  const isCosy = isCosyVoiceModel(modelId)
  if (!isSambert && !isCosy) throw new Error(`不支持的千问 TTS 模型：${modelId}`)

  const voice = isSambert ? modelId : cosyVoiceForGender(input.gender)
  const rate = toCosyRate(input.speechRate ?? 1)
  const refAudio = input.referenceAudioBase64?.replace(/\s/g, '')
  const refText = (input.referenceText ?? '这是一段语音参考样本。').trim().slice(0, 200)

  const res = await fetch(DASHSCOPE_TTS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      input: {
        text,
        voice: isSambert ? modelId : voice,
        format: 'mp3',
        sample_rate: 24000,
        ...(isCosy ? { rate } : {}),
        ...(refAudio && refAudio.length > 64 ? { ref_audio: refAudio, ref_text: refText } : {}),
      },
    }),
  })

  const j = await readJson(res)
  if (!res.ok) {
    const msg =
      (typeof j.message === 'string' && j.message.trim()) ||
      (typeof j.code === 'string' && j.code.trim()) ||
      `千问 TTS HTTP ${res.status}`
    throw new Error(msg)
  }

  const audioBase64 = extractAudioBase64(j)
  if (!audioBase64) throw new Error('千问 TTS 未返回音频')

  return { audioBase64, modelUsed: modelId, voice }
}

export function isQwenTtsHopableError(msg: string): boolean {
  return isArkQuotaHopableError(msg)
}

/** MiniMax 失败后：千问 CosyVoice / Sambert 全池轮询 */
export async function synthesizeWithQwenSpeechPool(
  env: Record<string, string>,
  input: QwenTtsSynthInput,
): Promise<
  | { ok: true; audioBase64: string; mimeType: 'audio/mpeg'; modelUsed: string; voice: string; provider: 'qwen' }
  | { ok: false; message: string; tried: string[] }
> {
  const apiKey = qwenKey(env)
  if (!apiKey) {
    return { ok: false, message: '未配置通义千问 Key（MERCHANT_AI_QWEN_KEY / DASHSCOPE_API_KEY）', tried: [] }
  }

  const envRaw = (
    env.MERCHANT_AI_QWEN_SPEECH_MODELS ??
    env.MERCHANT_AI_QWEN_TTS_MODELS ??
    ''
  ).trim()

  const preferred = (env.MERCHANT_AI_QWEN_TTS_MODEL ?? 'cosyvoice-v3-flash').trim()
  const candidates: string[] = [...qwenDhTtsModelCandidates(envRaw, preferred)]
  if ((input.referenceAudioBase64?.replace(/\s/g, '') ?? '').length > 64) {
    candidates.unshift('cosyvoice-v3-plus', 'cosyvoice-v3-flash', 'cosyvoice-v3.5-plus')
  }
  if (!candidates.length) {
    candidates.push(preferred, 'cosyvoice-v3-flash', sambertVoiceForGender(input.gender))
  }

  const tried: string[] = []
  let lastMsg = '千问语音合成失败'

  for (const modelId of candidates) {
    tried.push(modelId)
    try {
      const r = await callQwenTtsOnce(apiKey, modelId, input)
      return {
        ok: true,
        audioBase64: r.audioBase64,
        mimeType: 'audio/mpeg',
        modelUsed: r.modelUsed,
        voice: r.voice,
        provider: 'qwen',
      }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenTtsHopableError(lastMsg)) {
        return {
          ok: false,
          message: lastMsg,
          tried,
        }
      }
    }
  }

  const summary =
    tried.length > 1
      ? `${lastMsg}（已依次尝试 ${tried.length} 个千问语音模型）`
      : lastMsg
  return { ok: false, message: summary, tried }
}

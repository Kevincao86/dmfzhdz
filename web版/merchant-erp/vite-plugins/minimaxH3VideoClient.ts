/**
 * MiniMax 视频生成 V2（Hailuo H3）。
 * 创建：POST https://api.minimax.cn/v2/video_generation
 * 查询：GET  https://api.minimax.cn/v2/query/video_generation/{task_id}
 * 文档：https://platform.minimax.cn/docs/api-reference/video-generation-v2-create
 */
import { parseSeedanceCliFlags } from '../src/lib/arkVideoEndpointsConfig.js'
import { parseSeedanceImageLayoutMode } from '../src/lib/arkVideoContentPayload.js'
import type { MerchantAiEnv } from './merchantAiUpstream.js'

export const MINIMAX_H3_MODEL = 'MiniMax-H3'
export const MINIMAX_H3_TASK_PREFIX = 'mmh3:'

const DEFAULT_BASE = 'https://api.minimax.cn'
const RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'])

type H3ContentItem = {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
  role?: 'first_frame' | 'last_frame' | 'reference_image'
}

export function isMinimaxH3TaskId(taskId: string): boolean {
  return String(taskId ?? '').trim().startsWith(MINIMAX_H3_TASK_PREFIX)
}

export function videoGenEngineIsMinimaxH3(env: MerchantAiEnv): boolean {
  return String(env.MERCHANT_AI_VIDEO_GEN_ENGINE ?? '').trim() === 'minimax_h3'
}

function apiBase(env: MerchantAiEnv): string {
  const raw = String(env.MINIMAX_VIDEO_API_BASE ?? '').trim().replace(/\/$/, '')
  return raw || DEFAULT_BASE
}

function apiKey(env: MerchantAiEnv): string {
  return String(
    env.MINIMAX_VIDEO_API_KEY ?? env.MINIMAX_API_KEY ?? env.MERCHANT_AI_MINIMAX_KEY ?? '',
  ).trim()
}

function asImageUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (
    t.startsWith('data:image') ||
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('mm_file://')
  ) {
    return t
  }
  const compact = t.replace(/\s/g, '')
  if (compact.length > 80 && /^[a-z0-9+/=]+$/i.test(compact)) {
    return `data:image/jpeg;base64,${compact}`
  }
  return t
}

function collectImages(body: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const url = asImageUrl(raw)
    if (url) out.push(url)
  }
  if (Array.isArray(body.images_base64)) {
    for (const row of body.images_base64) push(row)
  }
  if (out.length === 0 && Array.isArray(body.content)) {
    for (const row of body.content) {
      if (!row || typeof row !== 'object') continue
      const item = row as Record<string, unknown>
      const image = item.image_url
      if (image && typeof image === 'object' && typeof (image as { url?: unknown }).url === 'string') {
        push((image as { url: string }).url)
      }
    }
  }
  return out.slice(0, 9)
}

function clampDuration(body: Record<string, unknown>, flags: string): number {
  const parsed = parseSeedanceCliFlags(flags).duration
  const raw = parsed ?? Number(body.durationSec ?? body.duration)
  if (!Number.isFinite(raw) || raw <= 0) return 5
  const n = Math.round(raw)
  if (n < 4) return 4
  if (n > 15) return 15
  return n
}

function pickResolution(body: Record<string, unknown>, flags: string): '768P' | '2K' {
  const fromFlags = parseSeedanceCliFlags(flags).resolution ?? ''
  const raw = String(body.resolution ?? fromFlags).trim().toLowerCase()
  if (/2k|4k|1080|1440|2160/.test(raw)) return '2K'
  return '768P'
}

function pickRatio(raw: string, hasFrame: boolean, hasRef: boolean): string {
  const t = raw.trim()
  if (hasFrame && !hasRef) return 'adaptive'
  if (RATIOS.has(t) && t !== 'adaptive') return t
  if (t === 'adaptive' && hasRef) return 'adaptive'
  return '9:16'
}

export function buildMinimaxH3CreateBody(body: Record<string, unknown>):
  | { ok: false; msg: string }
  | { ok: true; payload: Record<string, unknown>; durationSec: number } {
  const flags = typeof body.flags === 'string' ? body.flags : ''
  const promptRaw = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const images = collectImages(body)
  const prompt = (promptRaw || (images.length > 0 ? '按上传的画面生成连贯短视频。' : '')).slice(0, 7000)
  if (!prompt) return { ok: false, msg: '请填写提示词，或上传至少一张参考图。' }

  const pipeline = String(body.pipeline ?? '').trim()
  const layout = parseSeedanceImageLayoutMode(body.seedance_image_mode)
  const content: H3ContentItem[] = [{ type: 'text', text: prompt }]
  let hasFrame = false
  let hasRef = false

  const useReference =
    images.length > 1 &&
    (pipeline === 'xiaoyunque' || layout === 'reference' || (layout === 'auto' && images.length > 2))
  const useFirstLast =
    !useReference && images.length >= 2 && (layout === 'first_last' || layout === 'auto')

  if (useReference) {
    hasRef = true
    for (const url of images.slice(0, 9)) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
  } else if (useFirstLast) {
    hasFrame = true
    content.push({ type: 'image_url', image_url: { url: images[0]! }, role: 'first_frame' })
    content.push({ type: 'image_url', image_url: { url: images[images.length - 1]! }, role: 'last_frame' })
  } else if (images.length >= 1) {
    hasFrame = true
    content.push({ type: 'image_url', image_url: { url: images[0]! }, role: 'first_frame' })
  }

  const flagRatio = parseSeedanceCliFlags(flags).ratio ?? ''
  const ratioRaw = String(body.ratio ?? body.aspect_ratio ?? flagRatio)
  const durationSec = clampDuration(body, flags)
  return {
    ok: true,
    durationSec,
    payload: {
      model: MINIMAX_H3_MODEL,
      content,
      resolution: pickResolution(body, flags),
      duration: durationSec,
      ratio: pickRatio(ratioRaw, hasFrame, hasRef),
      aigc_watermark: parseSeedanceCliFlags(flags).watermark === true,
    },
  }
}

function errorMessage(j: Record<string, unknown>, status: number): string {
  const err = j.error
  const nested =
    err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : ''
  const top = typeof j.message === 'string' ? j.message : ''
  const raw = (nested || top || `MiniMax 视频生成失败（HTTP ${status}）`).trim()
  if (/sensitive|1026/i.test(raw)) return '这段画面描述未通过生成检查，请改写后再试。'
  if (/insufficient balance|1008/i.test(raw)) return 'MiniMax 视频余额不足，请到 MiniMax 控制台充值后再生成。'
  if (/rate limit|1002|429/i.test(raw)) return 'MiniMax 当前排队较多，请过一会儿再生成。'
  if (/1004|authorized|api secret key/i.test(raw)) return 'MiniMax 视频 Key 无效，请到运营台「短剧 AI 制作」核对。'
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw
}

export async function minimaxH3CreateVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
): Promise<
  | { ok: false; msg: string; status?: number }
  | { ok: true; taskId: string; modelUsed: string; durationSec: number }
> {
  const key = apiKey(env)
  if (!key) {
    return {
      ok: false,
      status: 400,
      msg: '未配置 MiniMax 视频 Key。请到运营台「短剧 AI 制作」填写 MiniMax 海螺视频 Key，并保存为 MiniMax H3。',
    }
  }
  const built = buildMinimaxH3CreateBody(body)
  if (built.ok === false) return { ok: false, status: 400, msg: built.msg }

  const res = await fetch(`${apiBase(env)}/v2/video_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(built.payload),
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const taskId = typeof j.task_id === 'string' ? j.task_id.trim() : ''
  if (!res.ok || !taskId) {
    return { ok: false, status: res.status >= 400 ? res.status : 502, msg: errorMessage(j, res.status) }
  }
  return {
    ok: true,
    taskId: `${MINIMAX_H3_TASK_PREFIX}${taskId}`,
    modelUsed: MINIMAX_H3_MODEL,
    durationSec: built.durationSec,
  }
}

export async function minimaxH3GetVideoTask(
  env: MerchantAiEnv,
  taskId: string,
): Promise<
  | { ok: false; msg: string; status?: number }
  | {
      ok: true
      state: {
        phase: 'queued' | 'running' | 'succeeded' | 'failed'
        statusLabel: string
        videoUrl?: string
        failReason?: string
      }
    }
> {
  const key = apiKey(env)
  if (!key) return { ok: false, status: 400, msg: '未配置 MiniMax 视频 Key，无法查询任务。' }
  const rawId = taskId.trim().slice(MINIMAX_H3_TASK_PREFIX.length)
  if (!rawId) return { ok: false, status: 400, msg: '缺少 MiniMax 任务号。' }

  const res = await fetch(`${apiBase(env)}/v2/query/video_generation/${encodeURIComponent(rawId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      return {
        ok: true,
        state: { phase: 'running', statusLabel: '云端生成中' },
      }
    }
    return { ok: false, status: res.status, msg: errorMessage(j, res.status) }
  }
  const task = j.task && typeof j.task === 'object' ? (j.task as Record<string, unknown>) : j
  const status = String(task.status ?? '').trim().toLowerCase()
  const content = task.content && typeof task.content === 'object' ? (task.content as Record<string, unknown>) : {}
  const videoUrl = typeof content.url === 'string' && content.url.trim() ? content.url.trim() : undefined
  const err = task.error && typeof task.error === 'object' ? (task.error as Record<string, unknown>) : {}
  const failReason = typeof err.message === 'string' ? errorMessage({ error: err }, 400) : undefined

  if (status === 'succeeded' && videoUrl) {
    return { ok: true, state: { phase: 'succeeded', statusLabel: '已完成', videoUrl } }
  }
  if (status === 'succeeded') {
    return { ok: true, state: { phase: 'running', statusLabel: '收尾中（等待视频地址）' } }
  }
  if (status === 'failed' || status === 'cancelled') {
    return {
      ok: true,
      state: {
        phase: 'failed',
        statusLabel: '生成失败',
        failReason: failReason || 'MiniMax 视频生成失败，请重试。',
      },
    }
  }
  if (status === 'queued') {
    return { ok: true, state: { phase: 'queued', statusLabel: '排队中' } }
  }
  return { ok: true, state: { phase: 'running', statusLabel: '生成中' } }
}

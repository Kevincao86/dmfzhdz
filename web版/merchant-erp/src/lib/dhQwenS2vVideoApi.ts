/**
 * 数字人口播：千问 video_portrait 口型模型池（额度不足自动切换）。
 */
import { merchantApiFetchUrls } from './merchantErpApiBase'

export type DhQwenS2vPollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

const START_PATHS = [
  '/api/meoo-merchant-ai-dh-s2v-start',
  '/api/merchant/ai/video/dh-s2v/start',
] as const

const STATUS_PATHS = [
  '/api/meoo-merchant-ai-dh-s2v-status',
  '/api/merchant/ai/video/dh-s2v/status',
] as const

const FETCH_TIMEOUT_MS = 120_000

function fetchSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(FETCH_TIMEOUT_MS)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function erpApiUrls(pathWithQuery: string): string[] {
  const all = merchantApiFetchUrls(pathWithQuery)
  const erpOnly = all.filter((u) => /\/erp-api\//i.test(u))
  return erpOnly.length ? erpOnly : all
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function postDhQwenS2vStart(body: {
  image_base64: string
  audio_base64: string
  resolution?: '480P' | '720P'
  frame_mode?: 'half' | 'full'
  /** 为 true 时服务端禁止将全身降格为半身裁切 */
  strict_frame_mode?: boolean
  /** 动作/构图指令（服务端记录；口型模型以参考图构图为准） */
  motion_instructions?: string
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null }
  | { ok: false; message: string }
> {
  for (const path of START_PATHS) {
    for (const url of erpApiUrls(path)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: fetchSignal(),
        })
        const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
        if (!res.ok || !j.ok) {
          const msg =
            typeof j.message === 'string'
              ? j.message
              : `千问口型驱动发起失败 HTTP ${res.status}`
          return { ok: false, message: msg }
        }
        const tid = typeof j.taskId === 'string' ? j.taskId.trim() : ''
        if (!tid) return { ok: false, message: '千问口型驱动未返回 taskId' }
        const modelUsed = typeof j.modelUsed === 'string' ? j.modelUsed : null
        return { ok: true, taskId: tid, modelUsed }
      } catch {
        /* try next url */
      }
    }
  }
  return {
    ok: false,
    message:
      '千问口型驱动接口不可达（HTTP 404）。请部署 auth-api 并确认 /erp-api/meoo-merchant-ai-dh-s2v-start 已注册。',
  }
}

export async function fetchDhQwenS2vStatus(
  taskId: string,
): Promise<
  | {
      ok: true
      phase: DhQwenS2vPollPhase
      statusLabel: string
      videoUrl?: string
      failReason?: string
    }
  | { ok: false; message: string }
> {
  const sp = new URLSearchParams({ taskId: taskId.trim() })
  const qs = `?${sp}`
  for (const base of STATUS_PATHS) {
    for (const url of erpApiUrls(`${base}${qs}`)) {
      try {
        const res = await fetch(url, { signal: fetchSignal() })
        const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
        if (!res.ok || !j.ok) {
          const msg =
            typeof j.message === 'string'
              ? j.message
              : `千问口型驱动查询失败 HTTP ${res.status}`
          return { ok: false, message: msg }
        }
        const phase = typeof j.phase === 'string' ? j.phase : 'running'
        const safePhase: DhQwenS2vPollPhase =
          phase === 'queued' || phase === 'running' || phase === 'succeeded' || phase === 'failed'
            ? phase
            : 'running'
        const statusLabel = typeof j.statusLabel === 'string' ? j.statusLabel : safePhase
        const videoUrl = typeof j.videoUrl === 'string' ? j.videoUrl : undefined
        const failReason = typeof j.failReason === 'string' ? j.failReason : undefined
        return { ok: true, phase: safePhase, statusLabel, videoUrl, failReason }
      } catch {
        /* try next url */
      }
    }
  }
  return {
    ok: false,
    message:
      '千问口型驱动查询不可达（HTTP 404）。请部署 auth-api 并确认 /erp-api/meoo-merchant-ai-dh-s2v-status 已注册。',
  }
}

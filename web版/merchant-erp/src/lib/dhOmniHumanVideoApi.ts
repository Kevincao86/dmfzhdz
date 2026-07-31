/**
 * 数字人口播：火山 OmniHuman（经 seedance start/status，pipeline=omnihuman）
 */
import { merchantApiFetchUrls } from './merchantErpApiBase'

export type DhOmniHumanPollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

const START_PATHS = [
  '/api/meoo-merchant-ai-video-seedance-start',
  '/api/merchant/ai/video/seedance/start',
] as const

const STATUS_PATHS = [
  '/api/meoo-merchant-ai-video-seedance-status',
  '/api/merchant/ai/video/seedance/status',
] as const

const FETCH_TIMEOUT_MS = 180_000
const POLL_INTERVAL_MS = 4000
const POLL_MAX_MS = 12 * 60_000

function fetchSignal(ms = FETCH_TIMEOUT_MS): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function postDhOmniHumanStart(body: {
  image_base64: string
  audio_base64: string
  prompt?: string
  pe_fast_mode?: boolean
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null } | { ok: false; message: string }
> {
  const payload = { ...body, pipeline: 'omnihuman' as const }
  for (const path of START_PATHS) {
    for (const url of erpApiUrls(path)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: fetchSignal(),
        })
        const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
        if (!res.ok || !j.ok) {
          const msg =
            typeof j.message === 'string' ? j.message : `OmniHuman 发起失败 HTTP ${res.status}`
          return { ok: false, message: msg }
        }
        const tid = typeof j.taskId === 'string' ? j.taskId.trim() : ''
        if (!tid) return { ok: false, message: 'OmniHuman 未返回 taskId' }
        return {
          ok: true,
          taskId: tid,
          modelUsed: typeof j.modelUsed === 'string' ? j.modelUsed : null,
        }
      } catch {
        /* next */
      }
    }
  }
  return {
    ok: false,
    message: 'OmniHuman 接口不可达。请确认已部署轻量 auth-api，并配置火山视觉 AK/SK。',
  }
}

export async function fetchDhOmniHumanStatus(taskId: string): Promise<
  | {
      ok: true
      phase: DhOmniHumanPollPhase
      statusLabel: string
      videoUrl?: string
      failReason?: string
    }
  | { ok: false; message: string }
> {
  const qs = `?${new URLSearchParams({ taskId: taskId.trim() })}`
  for (const base of STATUS_PATHS) {
    for (const url of erpApiUrls(`${base}${qs}`)) {
      try {
        const res = await fetch(url, { signal: fetchSignal(60_000) })
        const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
        if (!res.ok || !j.ok) {
          const msg =
            typeof j.message === 'string' ? j.message : `OmniHuman 查询失败 HTTP ${res.status}`
          return { ok: false, message: msg }
        }
        const phase = typeof j.phase === 'string' ? j.phase : 'running'
        const safePhase: DhOmniHumanPollPhase =
          phase === 'queued' || phase === 'running' || phase === 'succeeded' || phase === 'failed'
            ? phase
            : 'running'
        return {
          ok: true,
          phase: safePhase,
          statusLabel: typeof j.statusLabel === 'string' ? j.statusLabel : safePhase,
          videoUrl: typeof j.videoUrl === 'string' ? j.videoUrl : undefined,
          failReason: typeof j.failReason === 'string' ? j.failReason : undefined,
        }
      } catch {
        /* next */
      }
    }
  }
  return { ok: false, message: 'OmniHuman 状态查询不可达' }
}

/** 提交并轮询至成功，返回视频 URL */
export async function runDhOmniHumanJob(opts: {
  image_base64: string
  audio_base64: string
  prompt?: string
  pe_fast_mode?: boolean
  onProgress?: (label: string) => void
}): Promise<{ ok: true; videoUrl: string; modelUsed?: string | null } | { ok: false; message: string }> {
  const started = await postDhOmniHumanStart({
    image_base64: opts.image_base64,
    audio_base64: opts.audio_base64,
    prompt: opts.prompt,
    pe_fast_mode: opts.pe_fast_mode,
  })
  if (!started.ok) return started
  opts.onProgress?.('OmniHuman 生成中…')
  const t0 = Date.now()
  while (Date.now() - t0 < POLL_MAX_MS) {
    await sleep(POLL_INTERVAL_MS)
    const st = await fetchDhOmniHumanStatus(started.taskId)
    if (!st.ok) return st
    opts.onProgress?.(st.statusLabel)
    if (st.phase === 'succeeded' && st.videoUrl) {
      return { ok: true, videoUrl: st.videoUrl, modelUsed: started.modelUsed }
    }
    if (st.phase === 'failed') {
      return { ok: false, message: st.failReason || 'OmniHuman 生成失败' }
    }
  }
  return { ok: false, message: 'OmniHuman 生成超时，请稍后重试' }
}

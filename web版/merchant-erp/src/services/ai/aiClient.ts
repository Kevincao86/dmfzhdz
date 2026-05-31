/**
 * 浏览器侧：优先当前站点同源（Vercel /api/meoo-ai-chat），再尝试 VITE_MERCHANT_API_BASE_URL，避免误指商家管理后台旧网关。
 */
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import type { AIChatOkBody, AIChatRequest, AIChatResponse } from './types'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function aiChatFetchUrlCandidates(path: string): string[] {
  const out: string[] = []
  const add = (u: string) => {
    const t = u.trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }
  const p = path.startsWith('/') ? path : `/${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      add(new URL(p, window.location.origin).href)
    } catch {
      /* ignore */
    }
  }
  const b = apiBase().replace(/\/$/, '')
  if (b) add(`${b}${p}`)
  if (out.length === 0) add(p)
  return out
}

export function isAiRequestAborted(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error) {
    return e.name === 'AbortError' || /aborted|abort/i.test(e.message)
  }
  return false
}

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function tenantIdForApi(): Promise<string | undefined> {
  if (!supabaseConfigured || !supabase) return undefined
  const tid = await fetchPrimaryTenantId(supabase)
  return tid ?? undefined
}

/** 优先扁平路由 + 同源，避免生产环境深层路径或旧 API 基址落到 SPA */
export async function postAiChat(
  req: AIChatRequest,
  opts?: { signal?: AbortSignal },
): Promise<AIChatResponse> {
  const token = await bearer()
  const tenantId = await tenantIdForApi()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const tryPaths = ['/api/meoo-ai-chat', '/api/ai/chat']
  let lastErr = 'no_response'
  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const res = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...req,
          ...(tenantId ? { tenantId } : {}),
        }),
        signal: opts?.signal,
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok && json && typeof json === 'object' && (json as { ok?: boolean }).ok === true) {
        const b = json as AIChatOkBody
        return {
          provider: b.provider,
          model: b.model,
          content: b.content,
          raw: b.raw,
          usage: b.usage,
        }
      }
      if (res.status !== 404) {
        if (json && typeof json === 'object') {
          const o = json as {
            ok?: boolean
            error?: unknown
            detail?: string
            hint?: string
            message?: string
          }
          const code = typeof o.error === 'string' ? o.error.trim() : ''
          const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
          const hint = typeof o.hint === 'string' ? o.hint.trim() : ''
          const topMsg = typeof o.message === 'string' ? o.message.trim() : ''
          const parts = [code, detail, hint, topMsg].filter(Boolean)
          if (parts.length) throw new Error(parts.join(' — '))
          if (o.error && typeof o.error === 'object' && o.error !== null) {
            const nest = o.error as { message?: string; code?: string | number }
            const nm = typeof nest.message === 'string' ? nest.message.trim() : ''
            if (nm) {
              throw new Error(
                `网关返回异常（HTTP ${res.status}）。多为服务端未正确部署或函数崩溃；请查看 Vercel 该次部署日志。平台信息：${nm}`,
              )
            }
          }
        }
        const trimmed = text?.trim() ?? ''
        if (/MODULE_NOT_FOUND|Cannot find module/i.test(trimmed)) {
          throw new Error(
            `智能体服务端模块加载失败（HTTP ${res.status}）。请重新部署并确认 Vercel 环境变量（SUPABASE_URL、TOKENMIX_API_KEY 等）已配置。${trimmed.slice(0, 200)}`,
          )
        }
        throw new Error(trimmed || `HTTP ${res.status}`)
      }
      lastErr = text.slice(0, 200)
    }
  }
  throw new Error(lastErr || 'ai_chat_unavailable')
}

export type AiAgentNativeImageOk =
  | {
      ok: true
      imageUrl: string
      channel: 'tokenmix'
      displayModel?: string
      fallbackNote?: string
    }
  | {
      ok: true
      imageUrl: string
      channel: 'builtin'
      vendorUsed: 'qwen' | 'doubao' | 'minimax'
      fallbackNote?: string
    }

export type AiAgentNativeImageErr = { ok: false; message: string }

/**
 * 智能体文生图：POST /api/meoo-ai-agent-image（builtin：万相/豆包/MiniMax；TokenMix：OpenAI 兼容 images/generations）。
 */
export async function postAiAgentNativeImage(
  prompt: string,
  opts?: {
    preferredVendor?: 'qwen' | 'doubao' | 'minimax'
    /** data URL 或厂商可接受的图片 URL，走图生图时传入 */
    referenceImageDataUrl?: string
    imageRoute?: 'builtin' | 'tokenmix'
    tokenmixImageModel?: string
    signal?: AbortSignal
  },
): Promise<AiAgentNativeImageOk | AiAgentNativeImageErr> {
  const token = await bearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const tryPaths = ['/api/meoo-ai-agent-image']
  let lastErr = 'no_response'
  const body: Record<string, unknown> = { prompt }
  if (opts?.preferredVendor) body.preferred_vendor = opts.preferredVendor
  const ref = opts?.referenceImageDataUrl?.trim()
  if (ref) body.reference_image = ref
  if (opts?.imageRoute === 'tokenmix') body.image_route = 'tokenmix'
  const tim = opts?.tokenmixImageModel?.trim()
  if (tim) body.tokenmix_image_model = tim
  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const res = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts?.signal,
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok && json && typeof json === 'object' && (json as { ok?: boolean }).ok === true) {
        const b = json as {
          imageUrl?: unknown
          vendorUsed?: unknown
          channel?: unknown
          displayModel?: unknown
          fallbackNote?: unknown
        }
        const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : ''
        const ch = b.channel === 'tokenmix' ? 'tokenmix' : 'builtin'
        const displayModel = typeof b.displayModel === 'string' ? b.displayModel.trim() : undefined
        const fallbackNote = typeof b.fallbackNote === 'string' ? b.fallbackNote.trim() : undefined
        if (!imageUrl) return { ok: false, message: '生图接口返回格式异常' }
        if (ch === 'tokenmix') {
          return {
            ok: true,
            imageUrl,
            channel: 'tokenmix',
            ...(displayModel ? { displayModel } : {}),
            ...(fallbackNote ? { fallbackNote } : {}),
          }
        }
        const vuRaw = typeof b.vendorUsed === 'string' ? b.vendorUsed.trim() : ''
        const vuOk = vuRaw === 'qwen' || vuRaw === 'doubao' || vuRaw === 'minimax'
        if (!vuOk) return { ok: false, message: '生图接口返回格式异常' }
        return {
          ok: true,
          imageUrl,
          channel: 'builtin',
          vendorUsed: vuRaw as 'qwen' | 'doubao' | 'minimax',
          ...(fallbackNote ? { fallbackNote } : {}),
        }
      }
      if (res.status !== 404) {
        if (json && typeof json === 'object') {
          const o = json as { ok?: boolean; error?: unknown; detail?: string }
          const code = typeof o.error === 'string' ? o.error.trim() : ''
          const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
          const parts = [code, detail].filter(Boolean)
          if (parts.length) return { ok: false, message: parts.join(' — ') }
        }
        return { ok: false, message: text?.trim() || `HTTP ${res.status}` }
      }
      lastErr = text.slice(0, 200)
    }
  }
  return { ok: false, message: lastErr || 'ai_agent_image_unavailable' }
}

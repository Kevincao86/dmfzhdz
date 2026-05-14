/**
 * 浏览器侧：优先当前站点同源（Vercel /api/meoo-ai-chat），再尝试 VITE_MERCHANT_API_BASE_URL，避免误指商家管理后台旧网关。
 */
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
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

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** 优先扁平路由 + 同源，避免生产环境深层路径或旧 API 基址落到 SPA */
export async function postAiChat(req: AIChatRequest): Promise<AIChatResponse> {
  const token = await bearer()
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
      const res = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
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
          const o = json as { ok?: boolean; error?: unknown; detail?: string }
          const code = typeof o.error === 'string' ? o.error.trim() : ''
          const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
          const parts = [code, detail].filter(Boolean)
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
        throw new Error(text?.trim() || `HTTP ${res.status}`)
      }
      lastErr = text.slice(0, 200)
    }
  }
  throw new Error(lastErr || 'ai_chat_unavailable')
}

export type AiAgentNativeImageOk = {
  ok: true
  imageUrl: string
  vendorUsed: 'qwen' | 'doubao' | 'minimax'
}

export type AiAgentNativeImageErr = { ok: false; message: string }

/**
 * 智能体文生图：POST /api/meoo-ai-agent-image（服务端通义万相 / 豆包 Seedream / MiniMax，与商品 AI 共用环境变量）。
 */
export async function postAiAgentNativeImage(
  prompt: string,
  opts?: { preferredVendor?: 'qwen' | 'doubao' | 'minimax' },
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
  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      const res = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok && json && typeof json === 'object' && (json as { ok?: boolean }).ok === true) {
        const b = json as { imageUrl?: unknown; vendorUsed?: unknown }
        const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : ''
        const vu = typeof b.vendorUsed === 'string' ? b.vendorUsed.trim() : ''
        if (
          imageUrl &&
          (vu === 'qwen' || vu === 'doubao' || vu === 'minimax')
        ) {
          return { ok: true, imageUrl, vendorUsed: vu }
        }
        return { ok: false, message: '生图接口返回格式异常' }
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

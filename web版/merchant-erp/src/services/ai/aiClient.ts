/**
 * 浏览器侧唯一入口：调用同源 /api/meoo-ai-chat，不在此文件内引用任何厂商 SDK 或直连厂商域名。
 */
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import type { AIChatOkBody, AIChatRequest, AIChatResponse } from './types'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** 优先扁平路由，避免生产环境深层路径落到 SPA */
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
    const res = await fetch(url(p), {
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
        const o = json as { error?: string; detail?: string }
        const code = typeof o.error === 'string' ? o.error.trim() : ''
        const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
        const parts = [code, detail].filter(Boolean)
        if (parts.length) throw new Error(parts.join(' — '))
      }
      throw new Error(text?.trim() || `HTTP ${res.status}`)
    }
    lastErr = text.slice(0, 200)
  }
  throw new Error(lastErr || 'ai_chat_unavailable')
}

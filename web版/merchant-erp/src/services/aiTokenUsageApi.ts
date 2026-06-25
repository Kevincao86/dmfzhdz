import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export type AiTokenUsageRange = 'day' | 'week' | 'month' | 'custom'

export type AiTokenUsageResponse = {
  ok: boolean
  range?: AiTokenUsageRange
  from?: string
  to?: string
  summary?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    callCount: number
  }
  byProvider?: Array<{
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    callCount: number
  }>
  dailySeries?: Array<{
    date: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    callCount: number
  }>
  error?: string
}

export type FetchAiTokenUsageOpts = {
  range: AiTokenUsageRange
  from?: string
  to?: string
  /** 星选履约：传 mp 会话 token */
  mpSessionToken?: string
}

async function authHeaders(mpSessionToken?: string): Promise<Record<string, string>> {
  if (mpSessionToken?.trim()) {
    return { 'X-Mp-Session': mpSessionToken.trim() }
  }
  if (!supabaseConfigured || !supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function fetchAiTokenUsage(opts: FetchAiTokenUsageOpts): Promise<AiTokenUsageResponse> {
  const params = new URLSearchParams({ range: opts.range })
  if (opts.range === 'custom') {
    if (opts.from) params.set('from', opts.from)
    if (opts.to) params.set('to', opts.to)
  }
  const path = `/api/meoo-ai-token-usage?${params.toString()}`
  const headers = await authHeaders(opts.mpSessionToken)
  const urls = merchantErpApiCandidates(path)
  let lastErr = 'fetch_failed'
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]!, { headers, cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as AiTokenUsageResponse
      if (res.ok && data.ok !== false) return data
      lastErr = String(data.error || `http_${res.status}`)
      if ((res.status === 404 || res.status >= 502) && i < urls.length - 1) continue
      return { ok: false, error: lastErr }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < urls.length - 1) continue
    }
  }
  return { ok: false, error: lastErr }
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('zh-CN')
}

const PROVIDER_LABELS: Record<string, string> = {
  tokenmix: 'TokenMix',
  doubao: '豆包',
  qwen: '通义千问',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  minimax: 'MiniMax',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  unknown: '其他',
}

export function aiProviderLabel(provider: string): string {
  const key = provider.trim().toLowerCase()
  return PROVIDER_LABELS[key] ?? (provider || '其他')
}

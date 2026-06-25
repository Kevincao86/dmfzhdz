import { apiUrl } from '../lib/mpApiBase'
import { getToken } from '../lib/mpSession'

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

export async function fetchAiTokenUsage(opts: {
  range: AiTokenUsageRange
  from?: string
  to?: string
}): Promise<AiTokenUsageResponse> {
  const params = new URLSearchParams({ range: opts.range })
  if (opts.range === 'custom') {
    if (opts.from) params.set('from', opts.from)
    if (opts.to) params.set('to', opts.to)
  }
  const token = getToken()
  if (!token) return { ok: false, error: 'login_required' }
  const url = apiUrl(`/api/meoo-ai-token-usage?${params.toString()}`)
  try {
    const res = await fetch(url, {
      headers: { 'X-Mp-Session': token },
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as AiTokenUsageResponse
    if (res.ok && data.ok !== false) return data
    return { ok: false, error: data.error || `http_${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  }
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
  unknown: '其他',
}

export function aiProviderLabel(provider: string): string {
  const key = provider.trim().toLowerCase()
  return PROVIDER_LABELS[key] ?? (provider || '其他')
}

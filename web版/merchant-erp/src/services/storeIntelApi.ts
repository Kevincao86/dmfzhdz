/**
 * 门店菜单识别、竞品分析、商品方案 API
 */
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import type { StoreMenuItem } from '../lib/storeMenuStorage'
import type { CompetitorEntry } from '../lib/competitorStorage'

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = await bearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const o = json as { error?: string; detail?: string } | null
    throw new Error([o?.error, o?.detail].filter(Boolean).join(' — ') || `请求失败 ${res.status}`)
  }
  return json as T
}

export async function recognizeStoreMenuImage(
  imageDataUrl: string,
  storeName?: string,
): Promise<
  | { ok: true; items: StoreMenuItem[]; notes?: string }
  | { ok: false; message: string }
> {
  try {
    const r = await postJson<{ ok: boolean; items?: StoreMenuItem[]; notes?: string; error?: string }>(
      '/api/meoo-store-menu-recognize',
      { imageDataUrl, storeName },
    )
    if (r.ok && Array.isArray(r.items)) return { ok: true, items: r.items, notes: r.notes }
    return { ok: false, message: r.error ?? '识别失败' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function analyzeCompetitors(body: {
  storeName: string
  address: string
  city?: string
  industryHint?: string
  menuSummary?: string
}): Promise<
  | {
      ok: true
      summary: string
      industryHint?: string
      competitors: CompetitorEntry[]
      suggestions: string[]
    }
  | { ok: false; message: string }
> {
  try {
    const r = await postJson<{
      ok: boolean
      summary?: string
      industryHint?: string
      competitors?: CompetitorEntry[]
      suggestions?: string[]
      error?: string
    }>('/api/meoo-competitor-analysis', body)
    if (r.ok && r.summary) {
      return {
        ok: true,
        summary: r.summary,
        industryHint: r.industryHint,
        competitors: Array.isArray(r.competitors) ? r.competitors : [],
        suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
      }
    }
    return { ok: false, message: r.error ?? '分析失败' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export type AiProductPlan = {
  productName: string
  suggestedPriceYuan: number
  originYuan?: number
  description: string
  comboLines: string[]
  marginNote?: string
  competitorNote?: string
  riskLevel?: 'low' | 'medium' | 'high'
}

export async function fetchAiProductPlan(body: {
  userBrief: string
  platform?: string
  storeName?: string
  menuSummary?: string
  margins?: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
}): Promise<{ ok: true; plan: AiProductPlan } | { ok: false; message: string }> {
  try {
    const r = await postJson<{ ok: boolean; plan?: AiProductPlan; error?: string }>(
      '/api/meoo-ai-product-plan',
      body,
    )
    if (r.ok && r.plan?.productName) return { ok: true, plan: r.plan }
    return { ok: false, message: r.error ?? '生成方案失败' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

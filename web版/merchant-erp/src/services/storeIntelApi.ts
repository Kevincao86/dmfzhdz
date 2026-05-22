/**
 * 门店菜单识别、竞品分析、商品方案 API
 */
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import type { StoreMenuItem } from '../lib/storeMenuStorage'
import type { CompetitorEntry } from '../lib/competitorStorage'
import {
  coerceAgentDisplayError,
  coerceAgentTextField,
  parseComboLinesFromApi,
  parsePriceYuanFromApi,
} from '../lib/aiAgentActionParse'

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
    const o = json as { error?: unknown; detail?: unknown; message?: unknown } | null
    const msg = normalizeApiErrorMessage(o?.error ?? o?.message, o?.detail)
    throw new Error(msg === '生成方案失败' ? `请求失败 ${res.status}` : msg)
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
    const r = await postJson<{
      ok: boolean
      items?: StoreMenuItem[]
      notes?: string
      empty?: boolean
      error?: string
      detail?: string
    }>('/api/meoo-store-menu-recognize', { imageDataUrl, storeName })
    if (r.ok && Array.isArray(r.items)) {
      if (r.items.length === 0) {
        const hint =
          r.notes ||
          r.detail ||
          '未识别到价目条目。请确认 Vercel 已配置 TOKENMIX_API_KEY 或通义/豆包视觉模型 Key，并重新部署后再试。'
        return { ok: false, message: hint }
      }
      return { ok: true, items: r.items, notes: r.notes }
    }
    const msg = [r.error, r.detail, r.notes].filter((x) => typeof x === 'string' && x.trim()).join(' — ')
    return { ok: false, message: msg || '识别失败' }
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

function normalizeApiErrorMessage(err: unknown, detail?: unknown): string {
  const parts: string[] = []
  for (const x of [err, detail]) {
    const line = coerceAgentDisplayError(x, '')
    if (line) parts.push(line)
  }
  return parts.length ? [...new Set(parts)].join(' — ') : '生成方案失败'
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
    const r = await postJson<{ ok: boolean; plan?: AiProductPlan; error?: string; detail?: string }>(
      '/api/meoo-ai-product-plan',
      body,
    )
    if (r.ok && r.plan) {
      const productName = coerceAgentTextField(r.plan.productName)
      const suggestedPriceYuan = parsePriceYuanFromApi(r.plan.suggestedPriceYuan)
      if (productName && suggestedPriceYuan != null) {
        return {
          ok: true,
          plan: {
            productName,
            suggestedPriceYuan,
            description: coerceAgentTextField(r.plan.description) || '',
            comboLines: parseComboLinesFromApi(r.plan.comboLines),
            ...(parsePriceYuanFromApi(r.plan.originYuan) != null
              ? { originYuan: parsePriceYuanFromApi(r.plan.originYuan) }
              : {}),
            ...(coerceAgentTextField(r.plan.marginNote)
              ? { marginNote: coerceAgentTextField(r.plan.marginNote) }
              : {}),
            ...(coerceAgentTextField(r.plan.competitorNote)
              ? { competitorNote: coerceAgentTextField(r.plan.competitorNote) }
              : {}),
            ...(r.plan.riskLevel === 'low' ||
            r.plan.riskLevel === 'medium' ||
            r.plan.riskLevel === 'high'
              ? { riskLevel: r.plan.riskLevel }
              : {}),
          },
        }
      }
    }
    return { ok: false, message: normalizeApiErrorMessage(r.error, r.detail) }
  } catch (e) {
    return { ok: false, message: coerceAgentDisplayError(e, '生成方案失败') }
  }
}

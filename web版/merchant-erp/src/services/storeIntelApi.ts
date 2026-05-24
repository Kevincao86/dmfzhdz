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
    const o = json as {
      error?: unknown
      detail?: unknown
      message?: unknown
      code?: unknown
    } | null
    const vercelCrash =
      res.status >= 500 &&
      (o?.code === 500 ||
        o?.code === '500' ||
        String(o?.message ?? '').includes('server error has occurred'))
    if (vercelCrash) {
      throw new Error(
        '服务端函数异常（HTTP 500）。请到 Vercel 部署日志查看对应 API；常见原因：未配置 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY / TOKENMIX_API_KEY，或函数超时。',
      )
    }
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

export async function recognizeStoreMenuExcel(
  body: {
    rows: string[][]
    fileName?: string
    sheetName?: string
    storeName?: string
  },
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
    }>('/api/meoo-store-menu-excel-recognize', body)
    if (r.ok && Array.isArray(r.items)) {
      if (r.items.length === 0) {
        const hint =
          r.notes ||
          r.detail ||
          '未识别到价目条目。请确认表格含品名/价格列，且 Vercel 已配置 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY / TOKENMIX_API_KEY。'
        return { ok: false, message: hint }
      }
      return { ok: true, items: r.items, notes: r.notes }
    }
    const msg = [r.error, r.detail, r.notes].filter((x) => typeof x === 'string' && x.trim()).join(' — ')
    return { ok: false, message: msg || 'Excel 识别失败' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function analyzeCompetitors(body: {
  storeName: string
  address: string
  city?: string
  industryHint?: string
  industryPath?: string
  industryName?: string
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

function normalizePlanFromApi(raw: AiProductPlan & { slotLabel?: string }): (AiProductPlan & { slotLabel?: string }) | null {
  const productName = coerceAgentTextField(raw.productName)
  const suggestedPriceYuan = parsePriceYuanFromApi(raw.suggestedPriceYuan)
  if (!productName || suggestedPriceYuan == null) return null
  return {
    productName,
    suggestedPriceYuan,
    description: coerceAgentTextField(raw.description) || '',
    comboLines: parseComboLinesFromApi(raw.comboLines),
    ...(parsePriceYuanFromApi(raw.originYuan) != null
      ? { originYuan: parsePriceYuanFromApi(raw.originYuan) }
      : {}),
    ...(coerceAgentTextField(raw.marginNote) ? { marginNote: coerceAgentTextField(raw.marginNote) } : {}),
    ...(coerceAgentTextField(raw.competitorNote)
      ? { competitorNote: coerceAgentTextField(raw.competitorNote) }
      : {}),
    ...(raw.riskLevel === 'low' || raw.riskLevel === 'medium' || raw.riskLevel === 'high'
      ? { riskLevel: raw.riskLevel }
      : {}),
    ...(raw.slotLabel ? { slotLabel: raw.slotLabel } : {}),
  }
}

export type AiProductPlanRequest = {
  userBrief: string
  intentLabels?: string[]
  platform?: string
  storeName?: string
  menuSummary?: string
  margins?: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
}

export async function fetchAiProductPlan(
  body: AiProductPlanRequest,
): Promise<{ ok: true; plan: AiProductPlan } | { ok: false; message: string }> {
  try {
    const r = await postJson<{ ok: boolean; plan?: AiProductPlan; error?: string; detail?: string }>(
      '/api/meoo-ai-product-plan',
      body,
    )
    if (r.ok && r.plan) {
      const plan = normalizePlanFromApi(r.plan)
      if (plan) return { ok: true, plan }
    }
    return { ok: false, message: normalizeApiErrorMessage(r.error, r.detail) }
  } catch (e) {
    return { ok: false, message: coerceAgentDisplayError(e, '生成方案失败') }
  }
}

export async function fetchAiProductPlansBatch(
  body: AiProductPlanRequest & { intentLabels: string[] },
): Promise<
  | { ok: true; plans: Array<AiProductPlan & { slotLabel: string }> }
  | { ok: false; message: string }
> {
  try {
    const r = await postJson<{
      ok: boolean
      plans?: Array<AiProductPlan & { slotLabel?: string }>
      error?: string
      detail?: string
    }>('/api/meoo-ai-product-plan', body)
    if (r.ok && Array.isArray(r.plans)) {
      const plans: Array<AiProductPlan & { slotLabel: string }> = []
      for (const row of r.plans) {
        const norm = normalizePlanFromApi(row)
        const slotLabel = coerceAgentTextField(row.slotLabel) || norm?.productName
        if (norm && slotLabel) {
          plans.push({ ...norm, slotLabel })
        }
      }
      if (plans.length) return { ok: true, plans }
    }
    return { ok: false, message: normalizeApiErrorMessage(r.error, r.detail) }
  } catch (e) {
    return { ok: false, message: coerceAgentDisplayError(e, '生成方案失败') }
  }
}

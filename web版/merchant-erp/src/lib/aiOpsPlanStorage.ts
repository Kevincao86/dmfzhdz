import type { AiOpsPlanGenerateInput, AiOpsPlanResult } from './aiOpsPlanTypes'

const PREFIX = 'meoo_ai_ops_plans_v1'
const INTEL_PREFIX = 'meoo_ai_ops_intel_v1'

/** FWS 可编辑门店情报（按客户 scope 持久化） */
export type AiOpsPlanEditableIntel = {
  storeName: string
  industryPath: string
  menuSummary: string
  competitorSummary: string
  marginDouyin: string
  marginMeituan: string
  marginXhs: string
}

export function emptyAiOpsPlanEditableIntel(): AiOpsPlanEditableIntel {
  return {
    storeName: '',
    industryPath: '',
    menuSummary: '',
    competitorSummary: '',
    marginDouyin: '',
    marginMeituan: '',
    marginXhs: '',
  }
}

function intelStorageKey(scopeId: string): string {
  const s = String(scopeId || 'default').trim() || 'default'
  return `${INTEL_PREFIX}:${s}`
}

export function loadAiOpsPlanEditableIntel(scopeId: string): AiOpsPlanEditableIntel | null {
  try {
    const raw = localStorage.getItem(intelStorageKey(scopeId))
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<AiOpsPlanEditableIntel>
    if (!o || typeof o !== 'object') return null
    return {
      storeName: String(o.storeName || ''),
      industryPath: String(o.industryPath || ''),
      menuSummary: String(o.menuSummary || ''),
      competitorSummary: String(o.competitorSummary || ''),
      marginDouyin: String(o.marginDouyin || ''),
      marginMeituan: String(o.marginMeituan || ''),
      marginXhs: String(o.marginXhs || ''),
    }
  } catch {
    return null
  }
}

export function saveAiOpsPlanEditableIntel(scopeId: string, intel: AiOpsPlanEditableIntel): void {
  try {
    localStorage.setItem(intelStorageKey(scopeId), JSON.stringify(intel))
  } catch {
    /* quota */
  }
}

export type AiOpsPlanHistoryItem = {
  id: string
  title: string
  createdAt: string
  platforms: string[]
  budgetYuan: number
  periodStart: string
  periodEnd: string
  plan: AiOpsPlanResult
}

function storageKey(scopeId: string): string {
  const s = String(scopeId || 'default').trim() || 'default'
  return `${PREFIX}:${s}`
}

export function resolveAiOpsPlanScopeId(opts: {
  tenantUserId?: string | null
  partnerClientId?: string | null
}): string {
  const tenant = String(opts.tenantUserId || 'anon').trim() || 'anon'
  const client = String(opts.partnerClientId || '').trim()
  return client ? `${tenant}:pc:${client}` : tenant
}

export function loadAiOpsPlanHistory(scopeId: string): AiOpsPlanHistoryItem[] {
  try {
    const raw = localStorage.getItem(storageKey(scopeId))
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is AiOpsPlanHistoryItem => !!x && typeof x === 'object' && !!(x as AiOpsPlanHistoryItem).id)
      .slice(0, 40)
  } catch {
    return []
  }
}

export function saveAiOpsPlanHistoryItem(
  scopeId: string,
  input: AiOpsPlanGenerateInput,
  plan: AiOpsPlanResult,
  title?: string,
): AiOpsPlanHistoryItem {
  const item: AiOpsPlanHistoryItem = {
    id: `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title:
      title?.trim() ||
      `${input.periodStart || ''}～${input.periodEnd || ''} · ${(input.platforms || []).slice(0, 3).join('/') || '多平台'}`,
    createdAt: new Date().toISOString(),
    platforms: [...(input.platforms || [])],
    budgetYuan: Number(input.budgetYuan) || 0,
    periodStart: input.periodStart || '',
    periodEnd: input.periodEnd || '',
    plan,
  }
  const prev = loadAiOpsPlanHistory(scopeId)
  const next = [item, ...prev].slice(0, 40)
  try {
    localStorage.setItem(storageKey(scopeId), JSON.stringify(next))
  } catch {
    /* quota */
  }
  return item
}

export function deleteAiOpsPlanHistoryItem(scopeId: string, id: string): void {
  const next = loadAiOpsPlanHistory(scopeId).filter((x) => x.id !== id)
  try {
    localStorage.setItem(storageKey(scopeId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

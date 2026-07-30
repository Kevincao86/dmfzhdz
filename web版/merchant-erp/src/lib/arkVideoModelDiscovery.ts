/**
 * 从火山方舟 GET /api/v3/models 拉取账号已开通的视频模型，供 Seedance 轮询与配置展示。
 */
import { DOUBAO_VIDEO_CATALOG, isArkGenerativeVideoModelId } from './arkModelCatalog.js'
import {
  isArkVideoEndpointId,
  isDoubaoSeedanceModelId,
  looksLikeDoubaoChatModelId,
  normalizeArkVideoModelParam,
} from './arkVideoEndpointsConfig.js'

export type ArkDiscoveredVideoModel = {
  id: string
  label: string
  source: 'api' | 'catalog'
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; models: ArkDiscoveredVideoModel[] }>()

function cacheKey(apiKey: string, baseUrl: string): string {
  return `${baseUrl}::${apiKey.slice(0, 8)}::${apiKey.length}`
}

function labelForModelId(id: string): string {
  const norm = normalizeArkVideoModelParam(id)
  const hit = DOUBAO_VIDEO_CATALOG.find((e) => normalizeArkVideoModelParam(e.modelId) === norm)
  if (hit) return hit.label
  if (/^ep-/i.test(norm)) return `接入点 ${norm}`
  return norm
}

export function isArkListableVideoModelId(id: string): boolean {
  const norm = normalizeArkVideoModelParam(id.trim())
  if (!norm) return false
  if (looksLikeDoubaoChatModelId(norm)) return false
  if (isArkVideoEndpointId(norm)) return true
  if (isDoubaoSeedanceModelId(norm)) return true
  if (isArkGenerativeVideoModelId(norm)) return true
  if (/^wan2-1-14b|^wan2\.1-14b|^doubao-seaweed/i.test(norm)) return true
  return false
}

function parseModelsListResponse(j: unknown): string[] {
  const root = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
  const data = root.data
  const rows = Array.isArray(data) ? data : Array.isArray(root) ? root : []
  const out: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { id?: unknown }).id ?? '').trim()
    if (id && isArkListableVideoModelId(id) && !out.includes(id)) out.push(normalizeArkVideoModelParam(id))
  }
  return out
}

/** 拉取账号已开通视频模型（含 ep- 接入点）；失败时返回空数组 */
export async function fetchArkAccountVideoModels(input: {
  apiKey: string
  apiV3Root?: string
  forceRefresh?: boolean
}): Promise<ArkDiscoveredVideoModel[]> {
  const key = input.apiKey.trim()
  if (!key) return []
  const root = (input.apiV3Root ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const ck = cacheKey(key, root)
  if (!input.forceRefresh) {
    const hit = cache.get(ck)
    if (hit && hit.expiresAt > Date.now()) return hit.models
  }

  try {
    const res = await fetch(`${root}/models`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      cache.set(ck, { expiresAt: Date.now() + 60_000, models: [] })
      return []
    }
    const j = await res.json()
    const ids = parseModelsListResponse(j)
    const models = ids.map((id) => ({ id, label: labelForModelId(id), source: 'api' as const }))
    cache.set(ck, { expiresAt: Date.now() + CACHE_TTL_MS, models })
    return models
  } catch {
    cache.set(ck, { expiresAt: Date.now() + 60_000, models: [] })
    return []
  }
}

/** 合并 API 已开通模型 + 内置目录；API 命中优先 */
export function mergeDiscoveredVideoModelIds(
  discovered: readonly ArkDiscoveredVideoModel[],
  catalogIds: readonly string[],
): string[] {
  const out: string[] = []
  const add = (id: string) => {
    const norm = normalizeArkVideoModelParam(id.trim())
    if (!norm || !isArkListableVideoModelId(norm)) return
    if (!out.includes(norm)) out.push(norm)
  }
  for (const m of discovered) add(m.id)
  for (const id of catalogIds) add(id)
  return out
}

/** 会话内记录额度用尽模型，避免反复空试 */
const exhaustedUntil = new Map<string, number>()
const EXHAUST_TTL_MS = 45 * 60 * 1000

function exhaustKey(apiKey: string, modelId: string): string {
  return `${apiKey.slice(0, 8)}:${normalizeArkVideoModelParam(modelId)}`
}

export function markArkVideoModelQuotaExhausted(apiKey: string, modelId: string): void {
  if (!apiKey.trim() || !modelId.trim()) return
  exhaustedUntil.set(exhaustKey(apiKey, modelId), Date.now() + EXHAUST_TTL_MS)
}

export function clearArkVideoModelQuotaExhausted(apiKey: string, modelId: string): void {
  exhaustedUntil.delete(exhaustKey(apiKey, modelId))
}

export function isArkVideoModelQuotaExhausted(apiKey: string, modelId: string): boolean {
  const until = exhaustedUntil.get(exhaustKey(apiKey, modelId))
  if (!until) return false
  if (until <= Date.now()) {
    exhaustedUntil.delete(exhaustKey(apiKey, modelId))
    return false
  }
  return true
}

/** 额度稳定场景排序：有免费额度的 1.0-pro-fast / lite-i2v 优先，1.5 次之，未开通的 2.0 靠后 */
export function sortArkVideoModelsByQuotaHint(ids: readonly string[]): string[] {
  const norm = (id: string) => normalizeArkVideoModelParam(id).toLowerCase()
  const tier = (id: string): number => {
    const m = norm(id)
    if (/seedance-1-0-pro-fast|seedance-1\.0-pro-fast/.test(m)) return 1
    if (/lite-i2v/.test(m)) return 2
    if (/seedance-1-5|seedance-1\.5/.test(m)) return 3
    if (/seaweed|doubao-seaweed/.test(m)) return 4
    if (/wan2-1-14b|wan2\.1-14b/.test(m)) return 5
    if (/seedance-2-0-mini|seedance-2\.0-mini/.test(m)) return 10
    if (/seedance-2-0-fast|seedance-2\.0-fast/.test(m)) return 11
    if (/seedance-2-0|seedance-2\.0/.test(m)) return 12
    if (/lite-t2v/.test(m)) return 14
    if (/seedance-1-0-pro|seedance-1\.0-pro/.test(m)) return 88
    if (isArkVideoEndpointId(id)) return 20
    return 50
  }
  return [...ids].sort((a, b) => {
    const ta = tier(a)
    const tb = tier(b)
    if (ta !== tb) return ta - tb
    return norm(a).localeCompare(norm(b))
  })
}

/** 已开通优先 → 额度提示排序 → 剔除本会话额度用尽 */
export function orderArkVideoModelsForGeneration(input: {
  apiKey: string
  candidateIds: readonly string[]
  discoveredIds: readonly string[]
  preferQuotaStable?: boolean
}): string[] {
  const discoveredSet = new Set(input.discoveredIds.map((id) => normalizeArkVideoModelParam(id)))
  const hasDiscovery = discoveredSet.size > 0

  let list = [...input.candidateIds].map((id) => normalizeArkVideoModelParam(id))
  list = list.filter((id) => !isArkVideoModelQuotaExhausted(input.apiKey, id))

  if (hasDiscovery) {
    const activated = list.filter((id) => discoveredSet.has(id) || isArkVideoEndpointId(id))
    const fallback = list.filter((id) => !discoveredSet.has(id) && !isArkVideoEndpointId(id))
    list = [...activated, ...fallback]
  }

  if (input.preferQuotaStable) return sortArkVideoModelsByQuotaHint(list)
  return list
}

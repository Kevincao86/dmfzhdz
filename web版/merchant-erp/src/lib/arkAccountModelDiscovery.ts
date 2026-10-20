/**
 * 火山方舟 GET /api/v3/models：拉取账号已开通模型并按能力分类（语言 / 视觉 / 向量 / 视频）。
 * Brief 生文优先用 API 已开通语言模型，额度用尽或报错自动切换下一个。
 */
import { DOUBAO_CHAT_CATALOG, DOUBAO_VIDEO_CATALOG } from './arkModelCatalog.js'
import {
  isArkVideoEndpointId,
  isDoubaoSeedanceModelId,
  looksLikeDoubaoChatModelId,
  normalizeArkVideoModelParam,
} from './arkVideoEndpointsConfig.js'

export type ArkModelCapability = 'chat' | 'vision' | 'vector' | 'video' | 'speech' | 'other'

export type ArkDiscoveredModel = {
  id: string
  label: string
  capability: ArkModelCapability
  source: 'api'
}

const CACHE_TTL_MS = 5 * 60 * 1000

type ArkListedModel = { id: string; status: string; name: string }

const listCache = new Map<string, { expiresAt: number; rows: ArkListedModel[] }>()
/** 最近一次拉取到的状态。Shutdown 不进入候选；Retiring 排在仍开通的后面。 */
const listedModelStatus = new Map<string, string>()
const listedModelName = new Map<string, string>()

function cacheKey(apiKey: string, baseUrl: string): string {
  return `${baseUrl}::${apiKey.slice(0, 8)}::${apiKey.length}`
}

function labelForModelId(id: string): string {
  const norm = normalizeArkVideoModelParam(id)
  const chatHit = DOUBAO_CHAT_CATALOG.find((e) => normalizeArkVideoModelParam(e.modelId) === norm)
  if (chatHit) return chatHit.label
  const videoHit = DOUBAO_VIDEO_CATALOG.find((e) => normalizeArkVideoModelParam(e.modelId) === norm)
  if (videoHit) return videoHit.label
  if (/^ep-/i.test(norm)) return `接入点 ${norm}`
  return listedModelName.get(norm) || norm
}

/** 语言生文（Brief / 运营文稿）；排除视频、生图、纯视觉 VL、向量、语音 */
export function classifyArkModelId(id: string): ArkModelCapability {
  const t = id.trim().toLowerCase()
  if (!t) return 'other'
  if (/embedding|text-embedding|bge-|e5-|vector/.test(t)) return 'vector'
  if (
    /^doubao-seedance|^seedance-|^doubao-seaweed|^wan2-|^doubao-seed3d|^doubao-seedream|^doubao-seededit|^doubao-seaweed/.test(
      t,
    )
  )
    return 'video'
  if (/cosyvoice|sambert|tts-|asr-|speech_|bigmodel.*tts/.test(t)) return 'speech'
  if (
    /-vision(?!.*translation)|doubao-vision-|ui-tars|seed-1\.6-vision|seed-1-5-vision|thinking-vision|vision-pro|vision-lite/.test(
      t,
    ) &&
    !/thinking-pro$/.test(t)
  )
    return 'vision'
  if (/^ep-/.test(t)) return 'chat'
  if (looksLikeDoubaoChatModelId(id)) return 'chat'
  if (/^doubao-seed/.test(t) && !/seedance|seedream|seededit|seed3d/.test(t)) return 'chat'
  if (/^deepseek|^glm-|^kimi|^moonshot|^doubao-pro|^doubao-lite|^doubao-1\.|^sk-/.test(t)) return 'chat'
  return 'other'
}

export function isArkListableChatModelId(id: string): boolean {
  const cap = classifyArkModelId(id)
  return cap === 'chat'
}

export function isArkListableVisionModelId(id: string): boolean {
  return classifyArkModelId(id) === 'vision'
}

export function isArkListableVectorModelId(id: string): boolean {
  return classifyArkModelId(id) === 'vector'
}

function isArkListedModelShutdown(status: string): boolean {
  return /shutdown/i.test(status)
}

function parseModelsPage(j: unknown): { rows: ArkListedModel[]; hasMore: boolean; after?: string } {
  const root = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
  const data = root.data
  const rawRows = Array.isArray(data) ? data : []
  const rows: ArkListedModel[] = []
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { id?: unknown; status?: unknown; name?: unknown }
    const id = normalizeArkVideoModelParam(String(rec.id ?? '').trim())
    if (!id || rows.some((item) => item.id === id)) continue
    rows.push({
      id,
      status: String(rec.status ?? '').trim(),
      name: String(rec.name ?? '').trim(),
    })
  }
  const hasMore = root.has_more === true
  const after =
    typeof root.last_id === 'string'
      ? root.last_id
      : typeof (root as { after?: unknown }).after === 'string'
        ? String((root as { after: string }).after)
        : rows.length
          ? rows[rows.length - 1]!.id
          : undefined
  return { rows, hasMore, after }
}

/** 分页拉取账号全部已开通模型 ID */
export async function fetchArkAccountAllModelIds(input: {
  apiKey: string
  apiV3Root?: string
  forceRefresh?: boolean
}): Promise<string[]> {
  const key = input.apiKey.trim()
  if (!key) return []
  const root = (input.apiV3Root ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const ck = cacheKey(key, root)
  if (!input.forceRefresh) {
    const hit = listCache.get(ck)
    if (hit && hit.expiresAt > Date.now()) return usableListedIds(hit.rows)
  }

  const all: ArkListedModel[] = []
  let after: string | undefined
  try {
    for (let page = 0; page < 30; page++) {
      const url = new URL(`${root}/models`)
      url.searchParams.set('limit', '100')
      if (after) url.searchParams.set('after', after)
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      })
      if (!res.ok) break
      const j = await res.json()
      const pageParsed = parseModelsPage(j)
      for (const row of pageParsed.rows) {
        if (!all.some((item) => item.id === row.id)) all.push(row)
      }
      if (!pageParsed.hasMore || !pageParsed.after) break
      after = pageParsed.after
    }
    rememberListedStatus(all)
    listCache.set(ck, { expiresAt: Date.now() + CACHE_TTL_MS, rows: all })
    return usableListedIds(all)
  } catch {
    rememberListedStatus(all)
    listCache.set(ck, { expiresAt: Date.now() + 60_000, rows: all })
    return usableListedIds(all)
  }
}

function rememberListedStatus(rows: readonly ArkListedModel[]): void {
  for (const row of rows) {
    listedModelStatus.set(row.id, row.status)
    if (row.name) listedModelName.set(row.id, row.name)
  }
}

/** 已关闭的接入点不能对话，拉列表时直接去掉。 */
function usableListedIds(rows: readonly ArkListedModel[]): string[] {
  return rows.filter((row) => !isArkListedModelShutdown(row.status)).map((row) => row.id)
}

export async function discoverArkAccountModels(input: {
  apiKey: string
  apiV3Root?: string
  forceRefresh?: boolean
}): Promise<{
  all: ArkDiscoveredModel[]
  chat: ArkDiscoveredModel[]
  vision: ArkDiscoveredModel[]
  vector: ArkDiscoveredModel[]
  video: ArkDiscoveredModel[]
}> {
  const ids = await fetchArkAccountAllModelIds(input)
  const all: ArkDiscoveredModel[] = []
  const chat: ArkDiscoveredModel[] = []
  const vision: ArkDiscoveredModel[] = []
  const vector: ArkDiscoveredModel[] = []
  const video: ArkDiscoveredModel[] = []

  for (const id of ids) {
    const capability = classifyArkModelId(id)
    const row: ArkDiscoveredModel = { id, label: labelForModelId(id), capability, source: 'api' }
    all.push(row)
    if (capability === 'chat') chat.push(row)
    else if (capability === 'vision') vision.push(row)
    else if (capability === 'vector') vector.push(row)
    else if (capability === 'video') video.push(row)
  }

  const chatOrder = sortArkChatModelsForBrief(chat.map((item) => item.id))
  chat.sort((a, b) => chatOrder.indexOf(a.id) - chatOrder.indexOf(b.id))

  return { all, chat, vision, vector, video }
}

/** 服务受限 / 额度低的 Character、1.8 排到最后（1-6-flash 实测可用且快，不降级） */
const CHAT_DEPRIORITIZED_PATTERNS = [
  /doubao-seed-character/i,
  /doubao-seed-1-8/i,
  /doubao-seed-1\.8/i,
]

export function isArkBriefDeprioritizedChatModelId(id: string): boolean {
  const m = id.trim().toLowerCase()
  return CHAT_DEPRIORITIZED_PATTERNS.some((re) => re.test(m))
}

/** 仍开通且有额度的语言模型靠前；2.0 pro / Character 额度经常是 0，退到后面。Retiring 排在同档仍开通版本之后。 */
function chatModelBriefTier(id: string): number {
  const m = id.toLowerCase()
  let tier = 50
  if (CHAT_DEPRIORITIZED_PATTERNS.some((re) => re.test(m))) tier = 900
  else if (/deepseek-r1|deepseek-v3|deepseek-r1-distill/i.test(m)) tier = 850
  else if (/2-0-pro|2\.0-pro/.test(m)) tier = 80
  else if (/2-0-lite|2\.0-lite/.test(m)) tier = 1
  else if (/2-0-mini|2\.0-mini/.test(m)) tier = 2
  else if (/2-1-lite|2\.1-lite/.test(m)) tier = 3
  else if (/deepseek-v4.*flash/.test(m)) tier = 4
  else if (/glm-5/.test(m)) tier = 5
  else if (/seed-evolving/.test(m)) tier = 6
  else if (/2-0-code|2\.0-code/.test(m)) tier = 7
  else if (/2-1-turbo|2\.1-turbo/.test(m)) tier = 8
  else if (/2-1-pro|2\.1-pro/.test(m)) tier = 9
  else if (/deepseek-v4/.test(m)) tier = 10
  else if (/translation/.test(m)) tier = 40
  else if (/1-6-flash|1\.6-flash/.test(m)) tier = 200
  else if (/1-6|1\.6/.test(m)) tier = 210
  else if (/glm-4/.test(m)) tier = 30
  else if (/kimi-k2|kimi-k/.test(m)) tier = 31
  else if (/doubao-pro-32k|doubao-pro-256k/.test(m)) tier = 32
  else if (/doubao-lite-32k|doubao-lite-128k/.test(m)) tier = 33
  else if (/1-5-pro|1\.5-pro/.test(m)) tier = 34
  else if (isArkVideoEndpointId(id)) tier = 60
  else if (/doubao-pro/.test(m)) tier = 35
  else if (/doubao-lite/.test(m)) tier = 36
  if (/retiring/i.test(listedModelStatus.get(normalizeArkVideoModelParam(id)) ?? '')) tier += 300
  return tier
}

function modelRecency(id: string): number {
  const m = id.match(/(\d{6})\d{0,2}$/)
  return m ? Number(m[1]) : 0
}

export function isDoubaoBriefExcludedChatModelId(id: string): boolean {
  const m = id.trim().toLowerCase()
  if (!m) return true
  if (/deepseek-r1|deepseek-r1-distill/i.test(m)) return true
  return false
}

export function sortArkChatModelsForBrief(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ta = chatModelBriefTier(a)
    const tb = chatModelBriefTier(b)
    if (ta !== tb) return ta - tb
    const ra = modelRecency(b) - modelRecency(a)
    if (ra !== 0) return ra
    return a.toLowerCase().localeCompare(b.toLowerCase())
  })
}

export function discoveredModelsToEndpointsCsv(models: readonly { id: string; label: string }[]): string {
  const out: string[] = []
  for (const m of models) {
    const id = m.id.trim()
    const label = (m.label || id).trim()
    if (!id) continue
    const seg = `${label}|${id}`
    if (!out.includes(seg)) out.push(seg)
  }
  return out.join(', ')
}

const chatExhaustedUntil = new Map<string, number>()
const CHAT_EXHAUST_TTL_MS = 30 * 60 * 1000

function chatExhaustKey(apiKey: string, modelId: string): string {
  return `${apiKey.slice(0, 8)}:${normalizeArkVideoModelParam(modelId)}`
}

export function markArkChatModelQuotaExhausted(apiKey: string, modelId: string): void {
  if (!apiKey.trim() || !modelId.trim()) return
  chatExhaustedUntil.set(chatExhaustKey(apiKey, modelId), Date.now() + CHAT_EXHAUST_TTL_MS)
}

export function clearArkChatModelQuotaExhausted(apiKey: string, modelId: string): void {
  chatExhaustedUntil.delete(chatExhaustKey(apiKey, modelId))
}

export function isArkChatModelQuotaExhausted(apiKey: string, modelId: string): boolean {
  const until = chatExhaustedUntil.get(chatExhaustKey(apiKey, modelId))
  if (!until) return false
  if (until <= Date.now()) {
    chatExhaustedUntil.delete(chatExhaustKey(apiKey, modelId))
    return false
  }
  return true
}

/** API 已开通语言模型优先 → 运营台配置 → 内置目录；剔除本会话额度用尽 */
export function buildArkBriefChatModelTryOrder(input: {
  apiKey: string
  discoveredChatIds: readonly string[]
  registryIds: readonly string[]
  catalogIds: readonly string[]
  preferredId?: string
}): string[] {
  const discoveredSet = new Set(input.discoveredChatIds.map((id) => normalizeArkVideoModelParam(id)))
  const out: string[] = []
  const add = (id: string) => {
    const t = normalizeArkVideoModelParam(id.trim())
    if (!t || !isArkListableChatModelId(t)) return
    if (isDoubaoBriefExcludedChatModelId(t)) return
    if (isArkChatModelQuotaExhausted(input.apiKey, t)) return
    if (!out.includes(t)) out.push(t)
  }

  const pref = input.preferredId?.trim()
  if (discoveredSet.size > 0) {
    for (const id of sortArkChatModelsForBrief(input.discoveredChatIds)) add(id)
  }

  for (const id of input.registryIds) add(id)
  for (const id of input.catalogIds) add(id)

  const sorted = sortArkChatModelsForBrief(out)
  if (pref && isArkListableChatModelId(pref) && !isArkBriefDeprioritizedChatModelId(pref)) {
    const normPref = normalizeArkVideoModelParam(pref)
    return [normPref, ...sorted.filter((id) => id !== normPref)]
  }
  return sorted
}

/** 兼容视频发现：从全量列表筛视频类 */
export function filterDiscoveredVideoModelIds(allIds: readonly string[]): string[] {
  return allIds.filter((id) => {
    const cap = classifyArkModelId(id)
    if (cap === 'video') return true
    if (isArkVideoEndpointId(id) && !looksLikeDoubaoChatModelId(id)) return true
    if (isDoubaoSeedanceModelId(id)) return true
    return false
  })
}

/**
 * 豆包/火山方舟视频模型路由：全量目录接入 → 视觉质量优先 → 额度/未开通时依次降级。
 */
import { DOUBAO_VIDEO_CATALOG, mergeCatalogModelIds } from './arkModelCatalog'
import { sortArkVideoModelsByQuotaHint } from './arkVideoModelDiscovery'
import {
  isArkVideoEndpointId,
  looksLikeArkPlaceholderEndpointId,
  looksLikeDoubaoChatModelId,
  normalizeArkVideoModelParam,
} from './arkVideoEndpointsConfig'
import { filterVideoModelsByDuration, type VideoGenMode } from './videoModelDuration'
import { SEEDANCE_SERVER_AUTO } from './shortVideoUiLabels'

function parseEnvModelList(raw: string): string[] {
  const out: string[] = []
  for (const part of String(raw ?? '').split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const pipes = seg.split('|').map((s) => s.trim())
    const id = (pipes.length >= 2 ? pipes[1] : pipes[0])?.trim()
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** 视觉质量 tier：越小越优先（Pro > Seaweed > Lite） */
export function arkVideoVisualTier(modelId: string): number {
  const norm = normalizeArkVideoModelParam(modelId).toLowerCase()
  if (/seedance-2-0-mini|seedance-2\.0-mini/.test(norm)) return 3
  if (/seedance-2-0-fast|seedance-2\.0-fast/.test(norm)) return 2
  if (/seedance-2-0|seedance-2\.0/.test(norm)) return 1
  if (/seedance-1-5|seedance-1\.5/.test(norm)) return 18
  if (/seedance-1-0-pro-fast|seedance-1\.0-pro-fast/.test(norm)) return 5
  if (/seedance-1-0-pro|seedance-1\.0-pro/.test(norm)) return 4
  if (/seaweed/.test(norm)) return 6
  if (/wan2-1-14b|wan2\.1-14b/.test(norm)) return 8
  if (/lite-i2v/.test(norm)) return 9
  if (/lite-t2v/.test(norm)) return 9
  if (/lite/.test(norm)) return 9
  if (isArkVideoEndpointId(norm)) return 7
  const entry = DOUBAO_VIDEO_CATALOG.find(
    (e) => normalizeArkVideoModelParam(e.modelId).toLowerCase() === norm,
  )
  return entry ? entry.priority + 10 : 900
}

/** 按视觉质量固定排序（禁止随机轮换，确保 Pro 优先、Lite 兜底） */
export function sortArkVideoModelsByVisualQuality(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ta = arkVideoVisualTier(a)
    const tb = arkVideoVisualTier(b)
    if (ta !== tb) return ta - tb
    return normalizeArkVideoModelParam(a).localeCompare(normalizeArkVideoModelParam(b))
  })
}

/**
 * 数字人口播等场景：优先 1.5-pro / pro-fast（常见有免费额度），Pro/2.0 未开通靠后。
 */
export function sortArkVideoModelsQuotaStableFirst(ids: readonly string[]): string[] {
  return sortArkVideoModelsByQuotaHint(ids)
}

export function labelForArkVideoModel(modelId: string): string {
  const norm = normalizeArkVideoModelParam(modelId)
  const entry = DOUBAO_VIDEO_CATALOG.find(
    (e) => normalizeArkVideoModelParam(e.modelId) === norm,
  )
  return entry?.label ?? norm
}

/**
 * 合并运营台 / 模型池 / 内置目录，按视觉质量 + 时长/文图生模式筛选，返回完整尝试顺序。
 */
export function buildArkVideoModelTryOrder(input: {
  envRaw?: string
  poolModels?: readonly string[]
  preferred?: string
  durationSec: number
  mode: VideoGenMode
  /** 数字人口播：lite-i2v / Seaweed 优先，Pro 排后 */
  preferQuotaStable?: boolean
}): string[] {
  const dur = Math.round(input.durationSec)
  const preferredRaw = input.preferred?.trim() ?? ''
  const preferred =
    preferredRaw && preferredRaw !== SEEDANCE_SERVER_AUTO
      ? normalizeArkVideoModelParam(preferredRaw)
      : ''
  const envRaw = input.envRaw?.trim() ?? ''
  const pool = input.poolModels ?? []

  const catalogMerged = mergeCatalogModelIds(DOUBAO_VIDEO_CATALOG, envRaw, undefined, input.mode)

  const raw: string[] = []
  const add = (id: string) => {
    const norm = normalizeArkVideoModelParam(id.trim())
    if (!norm || norm === SEEDANCE_SERVER_AUTO) return
    if (looksLikeArkPlaceholderEndpointId(norm) || looksLikeDoubaoChatModelId(norm)) return
    if (raw.includes(norm)) return
    raw.push(norm)
  }

  for (const id of parseEnvModelList(envRaw)) add(id)
  for (const id of pool) add(id)
  for (const id of catalogMerged) add(id)

  let filtered = filterVideoModelsByDuration(raw, dur, input.mode)
  filtered = input.preferQuotaStable
    ? sortArkVideoModelsQuotaStableFirst(filtered)
    : sortArkVideoModelsByVisualQuality(filtered)

  if (preferred && videoModelInList(preferred, filtered)) {
    return [preferred, ...filtered.filter((id) => id !== preferred)]
  }
  if (preferred && filterVideoModelsByDuration([preferred], dur, input.mode).length > 0) {
    return [preferred, ...filtered]
  }
  return filtered
}

function videoModelInList(id: string, list: readonly string[]): boolean {
  const norm = normalizeArkVideoModelParam(id)
  return list.some((x) => normalizeArkVideoModelParam(x) === norm)
}

/** 方舟视频 API 报错是否应切换下一模型（额度、未开通、限流等） */
export function isArkVideoFailoverError(msg: string): boolean {
  const raw = String(msg ?? '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (
    /inference limit|safe experience mode|model service has been paused|has not activated|not activated|not open|not enabled/i.test(
      raw,
    )
  )
    return true
  if (
    /推理限额|安全体验模式|模型服务已暂停|服务暂停|服务异常|暂停服务|尚未开通|未开通|未激活|未启用|服务未开通/i.test(
      raw,
    )
  )
    return true
  if (/额度|quota|exceed|resource exhausted|has been exhausted|token.*不足|tokens.*insufficient/i.test(raw))
    return true
  if (/免费额度|额度用完|allocationquota|throttling\.allocation|资源包.*用完/i.test(raw)) return true
  if (/free tier|free_quota|free quota/i.test(lower)) return true
  if (/\b403\b/.test(raw) && /exhaust|quota|tier|额度|free|forbidden/i.test(lower)) return true
  if (/\b429\b/.test(raw) || lower.includes('rate limit') || lower.includes('throttl')) return true
  if (/\b402\b/.test(raw) || lower.includes('insufficient balance') || lower.includes('insufficient_quota'))
    return true
  if (/does not exist|do not have access|not have access|model.*not.*found|unknown model|invalid.*model/i.test(raw))
    return true
  if (/duration customization is not supported|duration must be in/i.test(raw)) return true
  if (/invalid content\.text|invalid content text|content\.text/i.test(lower)) return true
  /** 双参考 role 互斥等参数错误：切下一模型或由调用方改单图重试 */
  if (
    /first\/last frame|cannot be mixed with reference|reference media content|parameter ['"]content['"]|content.*not valid/i.test(
      raw,
    )
  )
    return true
  if (/\b502\b/.test(raw) || /\b503\b/.test(raw) || /\b504\b/.test(raw)) return true
  return false
}

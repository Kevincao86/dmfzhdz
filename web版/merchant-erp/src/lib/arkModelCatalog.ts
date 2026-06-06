/**
 * 火山方舟豆包 + 通义千问模型目录：按能力分类，额度/限流时同型自动切换。
 * 控制台显示名与 API model 参数以方舟/百炼文档为准；未开通的模型会在 failover 中跳过。
 */

export type ArkModelKind =
  | 'chat'
  | 'image_t2i'
  | 'image_i2i'
  | 'video_t2v'
  | 'video_i2v'
  | 'video_both'
  | 'video_3d'
  | 'video_r2v'
  | 'video_portrait'
  | 'video_edit'

export type ArkCatalogEntry = {
  label: string
  modelId: string
  kind: ArkModelKind
  /** 越小越优先尝试 */
  priority: number
}

/** 图1：豆包语言模型 */
export const DOUBAO_CHAT_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seed-2.0-pro', modelId: 'doubao-seed-2-0-pro-251015', kind: 'chat', priority: 1 },
  { label: 'Doubao-Seed-2.0-lite', modelId: 'doubao-seed-2-0-lite-251015', kind: 'chat', priority: 2 },
  { label: 'Doubao-Seed-2.0-mini', modelId: 'doubao-seed-2-0-mini-251015', kind: 'chat', priority: 3 },
  { label: 'Doubao-Seed-1.8', modelId: 'doubao-seed-1-8-251228', kind: 'chat', priority: 4 },
  { label: 'Doubao-Seed-2.0-Code', modelId: 'doubao-seed-2-0-code-251015', kind: 'chat', priority: 5 },
  { label: 'Doubao-Seed-Character', modelId: 'doubao-seed-character-251128', kind: 'chat', priority: 6 },
]

/** 图2/3：豆包视觉 — 文生图 / 图生图 */
export const DOUBAO_IMAGE_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seedream-5.0-lite', modelId: 'doubao-seedream-5-0-lite-251015', kind: 'image_t2i', priority: 1 },
  { label: 'Doubao-Seedream-4.5', modelId: 'doubao-seedream-4-5-251110', kind: 'image_t2i', priority: 2 },
  { label: 'Doubao-Seedream-4.0', modelId: 'doubao-seedream-4-0-250828', kind: 'image_t2i', priority: 3 },
  { label: 'Doubao-Seedream-3.0-t2i', modelId: 'doubao-seedream-3-0-t2i-250415', kind: 'image_t2i', priority: 4 },
  { label: 'Doubao-SeedEdit-3.0-i2i', modelId: 'doubao-seededit-3-0-i2i-250628', kind: 'image_i2i', priority: 1 },
]

/** 图2/3/4：豆包视觉 — 视频生成 */
export const DOUBAO_VIDEO_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seedance-1.5-pro', modelId: 'doubao-seedance-1-5-pro-251215', kind: 'video_both', priority: 1 },
  { label: 'Doubao-Seedance-1.0-pro-fast', modelId: 'doubao-seedance-1-0-pro-fast-250528', kind: 'video_both', priority: 2 },
  { label: 'Doubao-Seedance-1.0-pro', modelId: 'doubao-seedance-1-0-pro-250528', kind: 'video_both', priority: 3 },
  { label: 'Doubao-视频生成-Seaweed', modelId: 'doubao-seaweed-241128', kind: 'video_both', priority: 4 },
  { label: 'Doubao-Seedance-1.0-lite-t2v', modelId: 'doubao-seedance-1-0-lite-t2v-250428', kind: 'video_t2v', priority: 5 },
  { label: 'Doubao-Seedance-1.0-lite-i2v', modelId: 'doubao-seedance-1-0-lite-i2v-250428', kind: 'video_i2v', priority: 5 },
  { label: 'Wan2.1-14B', modelId: 'wan2-1-14b-250224', kind: 'video_both', priority: 6 },
]

/** 图2：豆包 3D */
export const DOUBAO_3D_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seed3D-2.0', modelId: 'doubao-seed3d-2-0-251015', kind: 'video_3d', priority: 1 },
]

/** 千问视觉全量目录见 qwenVisionCatalog.ts */
export { QWEN_IMAGE_CATALOG, QWEN_VIDEO_CATALOG } from './qwenVisionCatalog.js'

export const QWEN_VIDEO_TASK_PREFIX = 'qwv1:'

export function isQwenVideoTaskId(taskId: string): boolean {
  return taskId.trim().startsWith(QWEN_VIDEO_TASK_PREFIX)
}

export function stripQwenVideoTaskPrefix(taskId: string): string {
  const t = taskId.trim()
  return t.startsWith(QWEN_VIDEO_TASK_PREFIX) ? t.slice(QWEN_VIDEO_TASK_PREFIX.length) : t
}

export function wrapQwenVideoTaskId(taskId: string): string {
  const t = taskId.trim()
  return t.startsWith(QWEN_VIDEO_TASK_PREFIX) ? t : `${QWEN_VIDEO_TASK_PREFIX}${t}`
}

/** 额度超限、欠费、安全体验模式、限流等可切换同型模型 */
export function isArkQuotaHopableError(msg: string): boolean {
  const raw = String(msg ?? '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('无法解析模型输出')) return false
  if (
    /inference limit|safe experience mode|model service has been paused|has not activated the model/i.test(
      raw,
    )
  )
    return true
  if (/欠费|账户已欠费|余额不足|额度|quota|exceed|resource exhausted/i.test(raw)) return true
  if (/免费额度|额度用完|allocationquota|throttling\.allocation/i.test(raw)) return true
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('throttl')) return true
  if (/\b402\b/.test(raw) || lower.includes('insufficient balance') || lower.includes('insufficient_quota'))
    return true
  if (lower.includes('503') || lower.includes('502 bad gateway')) return true
  if (/does not support content generation/i.test(raw)) return true
  if (/not support.*video|不支持.*视频/i.test(raw)) return true
  return false
}

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

function kindMatches(entry: ArkCatalogEntry, mode: 't2v' | 'i2v' | 't2i' | 'i2i' | 'chat' | '3d'): boolean {
  switch (mode) {
    case 'chat':
      return entry.kind === 'chat'
    case 't2i':
      return entry.kind === 'image_t2i'
    case 'i2i':
      return entry.kind === 'image_i2i'
    case 't2v':
      return entry.kind === 'video_t2v' || entry.kind === 'video_both'
    case 'i2v':
      return entry.kind === 'video_i2v' || entry.kind === 'video_both'
    case '3d':
      return entry.kind === 'video_3d'
    default:
      return false
  }
}

/** 合并运营配置 + 内置目录，去重保序 */
export function mergeCatalogModelIds(
  catalog: readonly ArkCatalogEntry[],
  envRaw: string | undefined,
  preferredId: string | undefined,
  mode: 't2v' | 'i2v' | 't2i' | 'i2i' | 'chat' | '3d',
): string[] {
  const filtered = catalog.filter((e) => kindMatches(e, mode))
  const sorted = [...filtered].sort((a, b) => a.priority - b.priority)
  const out: string[] = []
  const add = (id: string) => {
    const t = id.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  if (preferredId?.trim()) add(preferredId.trim())
  for (const id of parseEnvModelList(envRaw ?? '')) add(id)
  for (const e of sorted) add(e.modelId)
  return out
}

export function catalogToPickerOptions(
  catalog: readonly ArkCatalogEntry[],
  capability: 'chat' | 'image' | 'video',
): { id: string; label: string }[] {
  const kinds: ArkModelKind[] =
    capability === 'chat'
      ? ['chat']
      : capability === 'image'
        ? ['image_t2i', 'image_i2i']
        : ['video_t2v', 'video_i2v', 'video_both', 'video_3d', 'video_r2v', 'video_portrait', 'video_edit']
  return catalog
    .filter((e) => kinds.includes(e.kind))
    .sort((a, b) => a.priority - b.priority)
    .map((e) => ({ id: e.modelId, label: e.label }))
}

export function catalogEndpointsCsv(catalog: readonly ArkCatalogEntry[]): string {
  return catalog.map((e) => `${e.label}|${e.modelId}`).join(', ')
}

/** 是否方舟视频生成类 model（含 Seedance / Seaweed / Wan） */
export function isArkGenerativeVideoModelId(id: string): boolean {
  const t = id.trim().toLowerCase()
  if (!t || /^ep-/.test(t)) return false
  if (/^doubao-seedance/i.test(t)) return true
  if (/^doubao-seaweed/i.test(t)) return true
  if (/^wan2-1-14b/i.test(t) || /^wan2\.1-14b/i.test(t)) return true
  return DOUBAO_VIDEO_CATALOG.some((e) => e.modelId.toLowerCase() === t)
}

/**
 * 豆包 / 千问内置模型池：按「语言 / 图文 / 视觉」六类封装，随机起点 + 同型额度 failover。
 */
import {
  catalogToPickerOptions,
  DOUBAO_3D_CATALOG,
  DOUBAO_CHAT_CATALOG,
  DOUBAO_IMAGE_CATALOG,
  DOUBAO_VIDEO_CATALOG,
  isArkQuotaHopableError,
  mergeCatalogModelIds,
  type ArkCatalogEntry,
  type ArkModelKind,
} from './arkModelCatalog.js'
import { QWEN_IMAGE_CATALOG, QWEN_VIDEO_CATALOG } from './qwenVisionCatalog.js'

export type BuiltinVendor = 'doubao' | 'qwen'

/** 语言=对话；图文=文生图 t2i；视觉=图生图+视频+数字人+3D 等 */
export type VendorModelTier = 'language' | 'image_text' | 'vision'

export const VENDOR_TIER_LABELS: Record<BuiltinVendor, Record<VendorModelTier, string>> = {
  doubao: {
    language: '豆包 · 语言模型',
    image_text: '豆包 · 图文模型',
    vision: '豆包 · 视觉模型',
  },
  qwen: {
    language: '通义千问 · 语言模型',
    image_text: '通义千问 · 图文模型',
    vision: '通义千问 · 视觉模型',
  },
}

/** 通义千问语言模型（DashScope compatible-mode）；额度 failover 按 priority 依次尝试 */
export const QWEN_CHAT_CATALOG: ArkCatalogEntry[] = [
  { label: 'qwen-flash', modelId: 'qwen-flash', kind: 'chat', priority: 1 },
  { label: 'qwen2.5-32b-instruct', modelId: 'qwen2.5-32b-instruct', kind: 'chat', priority: 2 },
  { label: 'qwen2.5-14b-instruct', modelId: 'qwen2.5-14b-instruct', kind: 'chat', priority: 3 },
  { label: 'qwen2.5-7b-instruct', modelId: 'qwen2.5-7b-instruct', kind: 'chat', priority: 4 },
  { label: 'qwen-long', modelId: 'qwen-long', kind: 'chat', priority: 5 },
  { label: 'qwen2.5-72b-instruct', modelId: 'qwen2.5-72b-instruct', kind: 'chat', priority: 6 },
  { label: 'qwen-plus', modelId: 'qwen-plus', kind: 'chat', priority: 7 },
  { label: 'qwen-turbo', modelId: 'qwen-turbo', kind: 'chat', priority: 8 },
  { label: 'qwen-max', modelId: 'qwen-max', kind: 'chat', priority: 9 },
  { label: 'qwen-math-plus', modelId: 'qwen-math-plus', kind: 'chat', priority: 10 },
  { label: 'qwen-coder-plus', modelId: 'qwen-coder-plus', kind: 'chat', priority: 11 },
]

const VISION_IMAGE_KINDS: ArkModelKind[] = ['image_i2i']

function filterCatalogByKinds(catalog: readonly ArkCatalogEntry[], kinds: readonly ArkModelKind[]): ArkCatalogEntry[] {
  const set = new Set(kinds)
  return catalog.filter((e) => set.has(e.kind))
}

/** 返回某厂商某档位的内置模型目录 */
export function vendorTierCatalog(vendor: BuiltinVendor, tier: VendorModelTier): readonly ArkCatalogEntry[] {
  if (vendor === 'doubao') {
    switch (tier) {
      case 'language':
        return DOUBAO_CHAT_CATALOG
      case 'image_text':
        return filterCatalogByKinds(DOUBAO_IMAGE_CATALOG, ['image_t2i'])
      case 'vision':
        return [
          ...filterCatalogByKinds(DOUBAO_IMAGE_CATALOG, VISION_IMAGE_KINDS),
          ...DOUBAO_VIDEO_CATALOG,
          ...DOUBAO_3D_CATALOG,
        ]
    }
  }
  switch (tier) {
    case 'language':
      return QWEN_CHAT_CATALOG
    case 'image_text':
      return filterCatalogByKinds(QWEN_IMAGE_CATALOG, ['image_t2i'])
    case 'vision':
      return [
        ...filterCatalogByKinds(QWEN_IMAGE_CATALOG, VISION_IMAGE_KINDS),
        ...QWEN_VIDEO_CATALOG,
      ]
  }
}

export type VendorPoolMode = 'chat' | 't2i' | 'i2i' | 't2v' | 'i2v' | '3d'

export function vendorTierToPoolMode(tier: VendorModelTier, subMode?: 't2v' | 'i2v'): VendorPoolMode {
  if (tier === 'language') return 'chat'
  if (tier === 'image_text') return 't2i'
  if (subMode === 't2v' || subMode === 'i2v') return subMode
  return 'i2i'
}

/** 随机旋转列表：从随机下标起依次尝试，实现同类模型负载分散 */
export function randomRotateModelIds(ids: readonly string[]): string[] {
  if (ids.length <= 1) return [...ids]
  const start = Math.floor(Math.random() * ids.length)
  return [...ids.slice(start), ...ids.slice(0, start)]
}

export type BuildVendorCandidatesOpts = {
  envRaw?: string
  preferredId?: string
  mode?: VendorPoolMode
  /** 为 false 时按目录 priority 固定顺序（手选指定模型时） */
  randomRotate?: boolean
}

/**
 * 合并运营台/环境变量覆盖 + 内置目录，并可随机起点。
 * preferredId 始终排第一（手选模型），其余随机轮换。
 */
export function buildVendorModelCandidates(
  vendor: BuiltinVendor,
  tier: VendorModelTier,
  opts: BuildVendorCandidatesOpts = {},
): string[] {
  const catalog = vendorTierCatalog(vendor, tier)
  const mode = opts.mode ?? vendorTierToPoolMode(tier)
  const merged = mergeCatalogModelIds(catalog, opts.envRaw, opts.preferredId, mode)
  if (!merged.length) return merged

  const randomRotate = opts.randomRotate !== false
  const pref = opts.preferredId?.trim()
  if (!randomRotate) return merged
  if (pref && merged[0] === pref) {
    const rest = merged.slice(1)
    return rest.length ? [pref, ...randomRotateModelIds(rest)] : [pref]
  }
  return randomRotateModelIds(merged)
}

export function isQuotaHopableError(msg: unknown): boolean {
  const raw = typeof msg === 'string' ? msg : msg instanceof Error ? msg.message : String(msg ?? '')
  if (isArkQuotaHopableError(raw)) return true
  const lower = raw.toLowerCase()
  if (lower.includes('access denied') || lower.includes('access_denied')) return true
  if (lower.includes('upstream_error') || lower.includes('model access denied')) return true
  if (/401|403|unauthorized|forbidden|无权|鉴权失败/.test(raw)) return true
  if (/workspace.*denied|not authorized to access this workspace/i.test(raw)) return true
  if (/failed to parse url|invalid url|invalid uri|url scheme|malformed url/i.test(raw)) return true
  if (/\b2061\b/.test(raw) || /plan not support|not support model|current token plan/i.test(lower)) return true
  if (/服务受限|service restricted|servicerestricted/i.test(raw)) return true
  return false
}

/** 按候选顺序调用，额度/限流类错误自动切换下一个同型模型 */
export async function invokeWithQuotaFailover<T>(
  candidates: readonly string[],
  invoke: (modelId: string) => Promise<T>,
): Promise<{ result: T; modelUsed: string }> {
  let lastErr: Error | null = null
  for (const modelId of candidates) {
    try {
      const result = await invoke(modelId)
      return { result, modelUsed: modelId }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (!isQuotaHopableError(lastErr.message)) throw lastErr
    }
  }
  throw lastErr ?? new Error('模型池已全部不可用（额度或限流）')
}

export function vendorTierPickerOptions(
  vendor: BuiltinVendor,
  tier: VendorModelTier,
  capability?: 'chat' | 'image' | 'video',
): { id: string; label: string }[] {
  const cap =
    capability ?? (tier === 'language' ? 'chat' : tier === 'image_text' ? 'image' : 'video')
  return catalogToPickerOptions(vendorTierCatalog(vendor, tier), cap)
}

export function vendorTierAutoPickerKey(vendor: BuiltinVendor, tier: VendorModelTier): string {
  return `${vendor}::tier::${tier}::__auto__`
}

export function parseVendorTierAutoPickerKey(key: string): { vendor: BuiltinVendor; tier: VendorModelTier } | null {
  const parts = key.split('::')
  if (parts.length !== 4 || parts[0] !== 'doubao' && parts[0] !== 'qwen') return null
  if (parts[1] !== 'tier' || parts[3] !== '__auto__') return null
  const tier = parts[2] as VendorModelTier
  if (tier !== 'language' && tier !== 'image_text' && tier !== 'vision') return null
  return { vendor: parts[0] as BuiltinVendor, tier }
}

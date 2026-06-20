import type { RegistryVideoAi } from './opsRegistryTypes.js'

const VIDEO_AI_FIELD_KEYS = [
  'klingAccessKey',
  'klingSecretKey',
  'klingApiBase',
  'arkVideoEndpoints',
  'arkChatEndpoints',
  'arkVideoApiKey',
  'iceAppId',
  'iceAccessKeyId',
  'iceAccessKeySecret',
  'iceRegion',
  'iceVodStorageLocation',
  'iceOutputOssUrlPrefix',
  'qwenVideoModels',
] as const

/**
 * 保存时合并：请求体未带的字段保留库内原值；显式传空字符串则清除该字段。
 * 避免 JSON.stringify 省略 undefined 时误清空可灵/云剪凭据。
 */
export function mergeRegistryVideoAiSave(prev: unknown, patch: unknown): RegistryVideoAi {
  const base = normalizeRegistryVideoAi(prev)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const raw = patch as Record<string, unknown>
  const merged: Record<string, string> = {}
  for (const k of VIDEO_AI_FIELD_KEYS) {
    if (k in raw) {
      const v = raw[k]
      if (typeof v === 'string') {
        const t = v.trim()
        if (t) merged[k] = t
      }
      continue
    }
    const kept = base[k]
    if (kept) merged[k] = kept
  }
  return normalizeRegistryVideoAi(merged)
}

/** 运营台与 dev 注册表共用的 videoAi 规范化（去空白、截断长度）。 */
export function normalizeRegistryVideoAi(raw: unknown): RegistryVideoAi {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const slice = (k: string, maxLen: number): string | undefined => {
    const v = o[k]
    if (typeof v !== 'string') return undefined
    const t = v.trim()
    if (!t) return undefined
    return t.length > maxLen ? t.slice(0, maxLen) : t
  }
  return {
    klingAccessKey: slice('klingAccessKey', 260),
    klingSecretKey: slice('klingSecretKey', 520),
    klingApiBase: slice('klingApiBase', 260),
    arkVideoEndpoints: slice('arkVideoEndpoints', 8192),
    arkChatEndpoints: slice('arkChatEndpoints', 8192),
    arkVideoApiKey: slice('arkVideoApiKey', 520),
    iceAppId: slice('iceAppId', 120),
    iceAccessKeyId: slice('iceAccessKeyId', 260),
    iceAccessKeySecret: slice('iceAccessKeySecret', 520),
    iceRegion: slice('iceRegion', 64),
    iceVodStorageLocation: slice('iceVodStorageLocation', 520),
    iceOutputOssUrlPrefix: slice('iceOutputOssUrlPrefix', 520),
    qwenVideoModels: slice('qwenVideoModels', 8192),
  }
}

import type { RegistryVideoAi } from './opsRegistryTypes'

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
    arkVideoApiKey: slice('arkVideoApiKey', 520),
  }
}

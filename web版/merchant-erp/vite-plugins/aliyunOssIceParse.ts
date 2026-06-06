import type { AliyunIceConfig } from './aliyunIceCore.js'

export type ParsedOssPrefix = {
  bucket: string
  region: string
  keyPrefix: string
}

/** 解析 https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/ */
export function parseOssUrlPrefix(raw: string): ParsedOssPrefix | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const m = url.hostname.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
    if (!m?.[1] || !m[2]) return null
    const keyPrefix = url.pathname.replace(/^\/+|\/+$/g, '')
    return { bucket: m[1], region: m[2], keyPrefix }
  } catch {
    return null
  }
}

/** ICE 点播 StorageLocation（outin-*.oss-cn-*.aliyuncs.com）已在 IMS 媒资库，RegisterMediaInfo 不易 403 */
export function parseVodStorageAsOssPrefix(cfg: AliyunIceConfig): ParsedOssPrefix | null {
  const raw = cfg.vodStorageLocation?.trim()
  if (!raw) return null
  let host = raw
  if (raw.includes('://')) {
    try {
      host = new URL(raw).hostname
    } catch {
      return null
    }
  } else {
    host = (raw.split('/')[0] ?? raw).trim()
  }
  const m = host.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
  if (!m?.[1] || !m[2]) return null
  return { bucket: m[1], region: m[2], keyPrefix: 'meoo' }
}

export function resolveIceOssUploadPrefix(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): ParsedOssPrefix | null {
  const explicit = env.ALIYUN_ICE_SOURCE_OSS_URL_PREFIX?.trim()
  if (explicit) {
    const parsed = parseOssUrlPrefix(explicit)
    if (parsed) return parsed
  }
  // 优先写入 ICE 点播库 Bucket，避免素材落在未加入媒资库的自建 Bucket 导致 RegisterMediaInfo 403
  const vod = parseVodStorageAsOssPrefix(cfg)
  if (vod) return vod
  return parseOssUrlPrefix(cfg.outputOssUrlPrefix?.trim() ?? '')
}

export function iceOssUploadAvailable(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): boolean {
  return resolveIceOssUploadPrefix(cfg, env) !== null
}

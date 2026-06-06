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

/** 本地上传候选 Bucket（按优先级）；outin 点播库通常不可 AK 直写 PutObject */
export function resolveIceOssUploadCandidates(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): ParsedOssPrefix[] {
  const out: ParsedOssPrefix[] = []
  const add = (p: ParsedOssPrefix | null) => {
    if (!p) return
    if (!out.some((x) => x.bucket === p.bucket && x.region === p.region && x.keyPrefix === p.keyPrefix)) {
      out.push(p)
    }
  }

  const explicit = env.ALIYUN_ICE_SOURCE_OSS_URL_PREFIX?.trim()
  if (explicit) add(parseOssUrlPrefix(explicit))

  // 自建 Bucket（运营台 OSS 成片前缀）须已加入 IMS 媒资库，且 RAM 含 oss:PutObject
  add(parseOssUrlPrefix(cfg.outputOssUrlPrefix?.trim() ?? ''))

  // outin 仅作兜底：多数账号对点播库无 bucket 写 ACL
  add(parseVodStorageAsOssPrefix(cfg))
  return out
}

export function resolveIceOssUploadPrefix(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): ParsedOssPrefix | null {
  return resolveIceOssUploadCandidates(cfg, env)[0] ?? null
}

export function iceOssUploadAvailable(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): boolean {
  return resolveIceOssUploadPrefix(cfg, env) !== null
}

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

/** ICE 点播库 outin-* 不可经 AK 直写 PutObject（会 bucket acl） */
export function isIceVodOutinBucket(bucket: string): boolean {
  return /^outin-/i.test(bucket.trim())
}

/** 本地上传候选 Bucket（按优先级）；跳过 outin 点播库 */
export function resolveIceOssUploadCandidates(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): ParsedOssPrefix[] {
  const out: ParsedOssPrefix[] = []
  const add = (p: ParsedOssPrefix | null) => {
    if (!p) return
    if (isIceVodOutinBucket(p.bucket)) return
    if (!out.some((x) => x.bucket === p.bucket && x.region === p.region && x.keyPrefix === p.keyPrefix)) {
      out.push(p)
    }
  }

  const explicit = env.ALIYUN_ICE_SOURCE_OSS_URL_PREFIX?.trim()
  if (explicit) add(parseOssUrlPrefix(explicit))

  // 自建 Bucket（运营台 OSS 成片前缀）须已加入 IMS 媒资库，且 RAM 含 oss:PutObject
  add(parseOssUrlPrefix(cfg.outputOssUrlPrefix?.trim() ?? ''))

  // 不再把 outin 作上传兜底（仅用于成片输出 / RegisterMediaInfo StorageLocation）
  return out
}

export function describeIceUploadBucketSelection(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
): {
  uploadBucket: string | null
  uploadBuckets: string[]
  outputPrefixParseOk: boolean
  skippedOutinSources: string[]
} {
  const candidates = resolveIceOssUploadCandidates(cfg, env)
  const outputPrefixParseOk = Boolean(parseOssUrlPrefix(cfg.outputOssUrlPrefix?.trim() ?? ''))
  const skipped: string[] = []
  if (isIceVodOutinBucket(parseOssUrlPrefix(cfg.outputOssUrlPrefix?.trim() ?? '')?.bucket ?? '')) {
    skipped.push('iceOutputOssUrlPrefix 指向 outin，已跳过直传')
  }
  const explicit = env.ALIYUN_ICE_SOURCE_OSS_URL_PREFIX?.trim()
  if (explicit && isIceVodOutinBucket(parseOssUrlPrefix(explicit)?.bucket ?? '')) {
    skipped.push('ALIYUN_ICE_SOURCE_OSS_URL_PREFIX 指向 outin，已跳过')
  }
  const uploadBuckets = candidates.map((p) => `${p.bucket}.oss-${p.region}.aliyuncs.com`)
  const first = candidates[0]
  return {
    uploadBucket: first ? `${first.bucket}.oss-${first.region}.aliyuncs.com` : null,
    uploadBuckets,
    outputPrefixParseOk,
    skippedOutinSources: skipped,
  }
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

/** ICE 时间线与浏览器预览须 HTTPS，避免 Mixed Content 与 InputFile is bad */
export function ensureIceHttpsUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/^http:\/\//i, 'https://')
}

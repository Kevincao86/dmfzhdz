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

/** ICE Timeline 仅接受 OSS 外网 Endpoint 直链，勿带 ?Signature= 等查询参数 */
export function toIceTimelineOssUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('oss://')) {
    const rest = trimmed.slice(6)
    const slash = rest.indexOf('/')
    if (slash > 0) {
      const bucket = rest.slice(0, slash)
      const key = rest.slice(slash + 1)
      const m = bucket.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
      if (m?.[1] && m[2]) {
        return ensureIceHttpsUrl(
          `https://${m[1]}.oss-${m[2]}.aliyuncs.com/${key.replace(/^\/+/, '')}`,
        )
      }
    }
  }
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (/^([^.]+)\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(u.hostname)) {
      u.protocol = 'https:'
      u.search = ''
      u.hash = ''
      return u.toString()
    }
  } catch {
    /* fall through */
  }
  return ensureIceHttpsUrl(trimmed)
}

export function buildIceCanonicalOssUrl(prefix: ParsedOssPrefix, objectKey: string): string {
  const key = objectKey.replace(/^\/+/, '')
  return ensureIceHttpsUrl(`https://${prefix.bucket}.oss-${prefix.region}.aliyuncs.com/${key}`)
}

const ICE_OSS_HTTPS_RE = /^https:\/\/[^/]+\.oss-[a-z0-9-]+\.aliyuncs\.com\/.+/i

/** 提交云剪前校验；返回 null 表示可用 */
export function validateIcePipelineImageUrl(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return '图片地址为空'
  if (/your-cdn\.com|example\.com|placeholder/i.test(raw)) {
    return '检测到示例占位链接，请删除后使用「本地上传」写入 OSS'
  }
  if (/localhost|127\.0\.0\.1|blob:/i.test(raw)) {
    return '图片须为公网 OSS 地址，请使用「本地上传」'
  }
  if (/[?#].*signature/i.test(raw) || raw.includes('?')) {
    return '勿使用带 ?Signature= 的签名链接，请重新本地上传（系统会生成无签名 OSS 直链）'
  }
  const oss = toIceTimelineOssUrl(raw)
  if (!ICE_OSS_HTTPS_RE.test(oss)) {
    return '须为阿里云 OSS 直链（形如 https://bucket.oss-cn-xxx.aliyuncs.com/路径），请本地上传后提交'
  }
  return null
}

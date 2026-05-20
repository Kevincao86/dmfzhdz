/**
 * 墨典AI云剪 — 本地上传至 OSS（运行时动态加载 ali-oss，避免 Vite 配置阶段加载）。
 */
import path from 'node:path'
import type { AliyunIceConfig } from './aliyunIceCore.js'
import { resolveIceOssUploadPrefix, type ParsedOssPrefix } from './aliyunOssIceParse.js'

const MAX_BYTES = 500 * 1024 * 1024
/** 经服务端转存 OSS（避免浏览器直传 CORS）；本地开发单请求上限 */
export const ICE_SERVER_UPLOAD_MAX_BYTES = 48 * 1024 * 1024
/** 分片上传每片大小（须小于 Vercel 请求体约 4.5MB，含 base64 开销） */
export const ICE_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024

/** 单次 JSON 直传上限：Vercel 上仅支持小文件，大文件走分片接口 */
export function resolveIceServerUploadMaxBytes(): number {
  if (process.env.VERCEL) return ICE_UPLOAD_CHUNK_BYTES
  return ICE_SERVER_UPLOAD_MAX_BYTES
}
const UPLOAD_EXPIRES_SEC = 3600
const MEDIA_URL_EXPIRES_SEC = 7 * 24 * 3600

function safeExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'].includes(ext)) return ext
  return '.mp4'
}

async function createOssClient(cfg: AliyunIceConfig, ossPrefix: ParsedOssPrefix) {
  const { default: OSS } = await import('ali-oss')
  return new OSS({
    region: `oss-${ossPrefix.region}`,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: ossPrefix.bucket,
  })
}

function buildObjectKey(prefix: ParsedOssPrefix, fileName: string): string {
  const ext = safeExt(fileName)
  const day = new Date().toISOString().slice(0, 10)
  const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const parts = [prefix.keyPrefix, 'source', day, `${rand}${ext}`].filter(Boolean)
  return parts.join('/')
}

export async function createIceSourceUploadPlan(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  input: { fileName: string; contentType: string; sizeBytes: number },
): Promise<
  | {
      ok: true
      uploadUrl: string
      contentType: string
      mediaUrl: string
      objectKey: string
    }
  | { ok: false; message: string }
> {
  const ossPrefix = resolveIceOssUploadPrefix(cfg, env)
  if (!ossPrefix) {
    return {
      ok: false,
      message:
        '未配置 OSS：请在运营台「短视频 API」填写 OSS 成片 URL 前缀（如 https://你的bucket.oss-cn-shanghai.aliyuncs.com/meoo/），本地上传将写入该 Bucket 的 source/ 目录。',
    }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, message: '无效的文件大小' }
  }
  if (input.sizeBytes > MAX_BYTES) {
    return { ok: false, message: '单文件不能超过 500MB' }
  }

  const objectKey = buildObjectKey(ossPrefix, input.fileName || 'video.mp4')
  const contentType = input.contentType?.trim() || 'video/mp4'

  try {
    const client = await createOssClient(cfg, ossPrefix)
    const uploadUrl = client.signatureUrl(objectKey, {
      method: 'PUT',
      expires: UPLOAD_EXPIRES_SEC,
      'Content-Type': contentType,
    })
    const mediaUrl = client.signatureUrl(objectKey, { expires: MEDIA_URL_EXPIRES_SEC })
    return { ok: true, uploadUrl, contentType, mediaUrl, objectKey }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `生成 OSS 上传凭证失败：${msg}` }
  }
}

/** 服务端写入 OSS（商户端经 BFF 上传，无需 Bucket 配置浏览器 CORS） */
export async function putIceSourceObject(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  input: { fileName: string; contentType: string; buffer: Buffer },
): Promise<
  | { ok: true; mediaUrl: string; objectKey: string }
  | { ok: false; message: string }
> {
  const ossPrefix = resolveIceOssUploadPrefix(cfg, env)
  if (!ossPrefix) {
    return {
      ok: false,
      message:
        '未配置 OSS：请在运营台「短视频 API」填写 OSS 成片 URL 前缀，本地上传将写入该 Bucket 的 source/ 目录。',
    }
  }
  if (!input.buffer.length) {
    return { ok: false, message: '文件内容为空' }
  }
  if (input.buffer.length > MAX_BYTES) {
    return { ok: false, message: '单文件不能超过 500MB' }
  }

  const objectKey = buildObjectKey(ossPrefix, input.fileName || 'video.mp4')
  const contentType = input.contentType?.trim() || 'video/mp4'

  try {
    const client = await createOssClient(cfg, ossPrefix)
    await client.put(objectKey, input.buffer, {
      headers: { 'Content-Type': contentType },
    })
    const mediaUrl = client.signatureUrl(objectKey, { expires: MEDIA_URL_EXPIRES_SEC })
    return { ok: true, mediaUrl, objectKey }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `写入 OSS 失败：${msg}` }
  }
}

function normalizePartEtag(etag: string | undefined): string {
  const t = String(etag ?? '').trim()
  return t.replace(/^"|"$/g, '')
}

export async function initIceMultipartUpload(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  input: { fileName: string; contentType: string; sizeBytes: number },
): Promise<
  | {
      ok: true
      uploadId: string
      objectKey: string
      partSize: number
      partCount: number
    }
  | { ok: false; message: string }
> {
  const ossPrefix = resolveIceOssUploadPrefix(cfg, env)
  if (!ossPrefix) {
    return {
      ok: false,
      message:
        '未配置 OSS：请在运营台「短视频 API」填写 OSS 成片 URL 前缀，本地上传将写入该 Bucket 的 source/ 目录。',
    }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, message: '无效的文件大小' }
  }
  if (input.sizeBytes > MAX_BYTES) {
    return { ok: false, message: '单文件不能超过 500MB' }
  }

  const objectKey = buildObjectKey(ossPrefix, input.fileName || 'video.mp4')
  const partSize = ICE_UPLOAD_CHUNK_BYTES
  const partCount = Math.max(1, Math.ceil(input.sizeBytes / partSize))

  try {
    const client = await createOssClient(cfg, ossPrefix)
    const init = await client.initMultipartUpload(objectKey, {
      headers: { 'Content-Type': input.contentType?.trim() || 'video/mp4' },
    })
    const uploadId = String(init.uploadId ?? '').trim()
    if (!uploadId) {
      return { ok: false, message: 'OSS 分片初始化失败：缺少 uploadId' }
    }
    return { ok: true, uploadId, objectKey, partSize, partCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `OSS 分片初始化失败：${msg}` }
  }
}

export async function uploadIceMultipartPart(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  input: {
    objectKey: string
    uploadId: string
    partNumber: number
    buffer: Buffer
  },
): Promise<{ ok: true; etag: string } | { ok: false; message: string }> {
  const ossPrefix = resolveIceOssUploadPrefix(cfg, env)
  if (!ossPrefix) {
    return { ok: false, message: '未配置 OSS 前缀' }
  }
  if (!input.buffer.length) {
    return { ok: false, message: '分片内容为空' }
  }
  if (input.buffer.length > ICE_UPLOAD_CHUNK_BYTES + 256 * 1024) {
    return { ok: false, message: '单片过大' }
  }
  const partNumber = Math.floor(input.partNumber)
  if (!Number.isFinite(partNumber) || partNumber < 1 || partNumber > 10000) {
    return { ok: false, message: '无效的分片序号' }
  }

  try {
    const client = await createOssClient(cfg, ossPrefix)
    const part = await client.uploadPart(
      input.objectKey,
      input.uploadId,
      partNumber,
      input.buffer,
    )
    const rawEtag =
      (part as { etag?: string }).etag ??
      ((part as { res?: { headers?: { etag?: string } } }).res?.headers?.etag as string | undefined)
    const etag = normalizePartEtag(rawEtag)
    if (!etag) {
      return { ok: false, message: 'OSS 分片上传未返回 ETag' }
    }
    return { ok: true, etag }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `OSS 分片上传失败：${msg}` }
  }
}

export async function completeIceMultipartUpload(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  input: {
    objectKey: string
    uploadId: string
    parts: { partNumber: number; etag: string }[]
  },
): Promise<{ ok: true; mediaUrl: string; objectKey: string } | { ok: false; message: string }> {
  const ossPrefix = resolveIceOssUploadPrefix(cfg, env)
  if (!ossPrefix) {
    return { ok: false, message: '未配置 OSS 前缀' }
  }
  if (!input.parts.length) {
    return { ok: false, message: '缺少分片列表' }
  }

  const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber)
  try {
    const client = await createOssClient(cfg, ossPrefix)
    await client.completeMultipartUpload(
      input.objectKey,
      input.uploadId,
      sorted.map((p) => ({
        number: p.partNumber,
        etag: normalizePartEtag(p.etag),
      })),
    )
    const mediaUrl = client.signatureUrl(input.objectKey, { expires: MEDIA_URL_EXPIRES_SEC })
    return { ok: true, mediaUrl, objectKey: input.objectKey }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `OSS 合并分片失败：${msg}` }
  }
}

/** 解析成片 OSS 直链：https://bucket.oss-cn-xxx.aliyuncs.com/key/object.mp4（可带签名 query） */
export function parseOssObjectUrl(raw: string): { bucket: string; region: string; objectKey: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('oss://')) {
    const rest = trimmed.slice(6)
    const slash = rest.indexOf('/')
    if (slash <= 0) return null
    const bucket = rest.slice(0, slash)
    const objectKey = rest.slice(slash + 1)
    if (!bucket || !objectKey) return null
    const region =
      (process.env.ALIYUN_ICE_REGION ?? process.env.ALIYUN_ICE_OUTPUT_OSS_REGION ?? 'cn-shanghai').trim()
    return { bucket, region, objectKey }
  }
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const m = url.hostname.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
    if (!m?.[1] || !m[2]) return null
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!objectKey) return null
    return { bucket: m[1], region: m[2], objectKey }
  } catch {
    return null
  }
}

/** 轮询/下载前判断 OSS 成片是否可读（禁止 size=-1 误判为已就绪） */
export async function evaluateIceOutputReady(
  cfg: AliyunIceConfig,
  downloadUrl: string,
): Promise<{ ready: boolean; bytes: number; message?: string }> {
  const probe = await probeIceOutputObjectSize(cfg, downloadUrl)
  if (!probe.ok) {
    return { ready: false, bytes: 0, message: probe.message }
  }
  if (probe.size >= MIN_ICE_OUTPUT_BYTES) {
    return { ready: true, bytes: probe.size }
  }
  if (probe.size > 0) {
    return { ready: false, bytes: probe.size, message: '成片写入 OSS 中…' }
  }
  return { ready: false, bytes: 0, message: '成片写入 OSS 中…' }
}

/** 私有 Bucket 成片：生成限时可读签名 URL（与 ICE AccessKey 相同） */
export async function signIceOssObjectUrl(
  cfg: AliyunIceConfig,
  rawUrl: string,
  expiresSec = 3600,
): Promise<string | null> {
  const parsed = parseOssObjectUrl(rawUrl)
  if (!parsed) return null
  try {
    const { default: OSS } = await import('ali-oss')
    const client = new OSS({
      region: `oss-${parsed.region}`,
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      bucket: parsed.bucket,
    })
    return client.signatureUrl(parsed.objectKey, { expires: expiresSec })
  } catch {
    return null
  }
}

/** 有效 MP4 至少应有若干 KB；过小视为未写完或 ICE 未写入 OSS */
export const MIN_ICE_OUTPUT_BYTES = 2048

type OssHeadResult = { res?: { headers?: Record<string, string | number | string[]> } }
type OssGetResult = { content: Buffer | Uint8Array; res?: { headers?: Record<string, string> } }
type OssObjectClient = {
  head(name: string): Promise<OssHeadResult>
  get(name: string): Promise<OssGetResult>
}

async function ossClientForObject(
  cfg: AliyunIceConfig,
  parsed: { bucket: string; region: string },
): Promise<OssObjectClient> {
  const { default: OSS } = await import('ali-oss')
  return new OSS({
    region: `oss-${parsed.region}`,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: parsed.bucket,
  }) as unknown as OssObjectClient
}

/** HEAD 成片 OSS 对象大小（用于轮询「Success 但尚未落盘」） */
export async function probeIceOutputObjectSize(
  cfg: AliyunIceConfig,
  rawUrl: string,
): Promise<{ ok: true; size: number } | { ok: false; message: string }> {
  const parsed = parseOssObjectUrl(rawUrl)
  if (!parsed) {
    return { ok: true, size: -1 }
  }
  try {
    const client = await ossClientForObject(cfg, parsed)
    const head = await client.head(parsed.objectKey)
    const size = Number(head.res?.headers?.['content-length'] ?? 0)
    return { ok: true, size: Number.isFinite(size) ? size : 0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/not found|404|NoSuchKey/i.test(msg)) {
      return { ok: true, size: 0 }
    }
    return { ok: false, message: msg }
  }
}

function sniffOssErrorXml(buf: Buffer): string | null {
  if (buf.length > 8192) return null
  const head = buf.toString('utf8', 0, Math.min(buf.length, 400))
  if (!head.includes('<Error>')) return null
  const code = /<Code>([^<]+)<\/Code>/i.exec(head)?.[1]
  const msg = /<Message>([^<]+)<\/Message>/i.exec(head)?.[1]
  return [code, msg].filter(Boolean).join(': ') || head.slice(0, 200)
}

/** ISO BMFF（MP4/MOV）文件头 */
export function isLikelyMp4Buffer(buf: Buffer): boolean {
  if (buf.length < 12) return false
  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
}

function sniffInvalidIceOutputBody(buf: Buffer): string | null {
  const xmlErr = sniffOssErrorXml(buf)
  if (xmlErr) return `读取成片失败：${xmlErr}`
  const head = buf.toString('utf8', 0, Math.min(buf.length, 120)).trimStart()
  if (head.startsWith('<!') || /^<html/i.test(head)) {
    return '拉取到的不是视频文件（疑似 HTML 错误页），请检查 OSS 权限或 API 路由'
  }
  if (head.startsWith('{') || head.startsWith('[')) {
    return '拉取到的不是视频文件（疑似 JSON 错误），请稍后重试或联系运营'
  }
  if (!isLikelyMp4Buffer(buf)) {
    return 'OSS 上的成片不是有效 MP4，请确认 ICE 输出为 H.264/AAC 的 .mp4 并重新提交云剪'
  }
  return null
}

function normalizeIceVideoContentType(ct: string): string {
  const t = ct.trim().toLowerCase()
  if (t.includes('video/') || t.includes('mp4')) return 'video/mp4'
  return 'video/mp4'
}

/** 服务端拉取成片（优先 OSS SDK get，私有桶不依赖公网直链） */
export async function fetchIceOutputObject(
  cfg: AliyunIceConfig,
  rawUrl: string,
): Promise<{ ok: true; buf: Buffer; contentType: string } | { ok: false; message: string }> {
  const parsed = parseOssObjectUrl(rawUrl)
  if (parsed) {
    try {
      const client = await ossClientForObject(cfg, parsed)
      const result = await client.get(parsed.objectKey)
      const raw = result.content
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Buffer)
      const ct = normalizeIceVideoContentType(
        String(result.res?.headers?.['content-type'] ?? '').trim() || 'video/mp4',
      )
      const invalid = sniffInvalidIceOutputBody(buf)
      if (invalid) return { ok: false, message: invalid }
      if (buf.length < MIN_ICE_OUTPUT_BYTES) {
        return {
          ok: false,
          message: `成片文件过小（${buf.length} 字节）。请确认 ICE 对 Bucket「${parsed.bucket}」有写入权限，且输出 OSS 与 ICE 同在 cn-shanghai；稍后重试或联系运营检查运营台 OSS 前缀配置。`,
        }
      }
      return { ok: true, buf, contentType: ct }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: `OSS 读取成片失败：${msg}` }
    }
  }

  let fetchUrl = rawUrl.trim()
  const signed = await signIceOssObjectUrl(cfg, fetchUrl)
  if (signed) fetchUrl = signed
  try {
    const res = await fetch(fetchUrl, { redirect: 'follow' })
    if (!res.ok) {
      return { ok: false, message: `拉取成片失败 HTTP ${res.status}` }
    }
    const ct = normalizeIceVideoContentType(res.headers.get('content-type') ?? 'video/mp4')
    const buf = Buffer.from(await res.arrayBuffer())
    const invalid = sniffInvalidIceOutputBody(buf)
    if (invalid) return { ok: false, message: invalid }
    if (buf.length < MIN_ICE_OUTPUT_BYTES) {
      return { ok: false, message: `成片文件过小（${buf.length} 字节），请稍后重试。` }
    }
    return { ok: true, buf, contentType: ct }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

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

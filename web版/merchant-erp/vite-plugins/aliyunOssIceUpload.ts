/**
 * 墨典AI云剪 — 本地上传至 OSS（运行时动态加载 ali-oss，避免 Vite 配置阶段加载）。
 */
import path from 'node:path'
import type { AliyunIceConfig } from './aliyunIceCore.js'
import { resolveIceOssUploadPrefix, type ParsedOssPrefix } from './aliyunOssIceParse.js'

const MAX_BYTES = 500 * 1024 * 1024
const UPLOAD_EXPIRES_SEC = 3600
const MEDIA_URL_EXPIRES_SEC = 7 * 24 * 3600

function safeExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'].includes(ext)) return ext
  return '.mp4'
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
    const { default: OSS } = await import('ali-oss')
    const client = new OSS({
      region: `oss-${ossPrefix.region}`,
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      bucket: ossPrefix.bucket,
    })
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

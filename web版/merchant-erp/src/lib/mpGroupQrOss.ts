/**
 * 转发群二维码 → OSS 公网 URL（side map 仅存 https，小程序直拉图片）
 */
import path from 'node:path'
import {
  readMerchantProductImageOssEnv,
  resolveMerchantProductImageEnv,
} from '../../vite-plugins/merchantProductImageStorage.js'

const OSS_PREFIX = 'mp-group-qr'
const MAX_BYTES = 3 * 1024 * 1024
const UPLOAD_EXPIRES_SEC = 3600

function safeExt(fileName: string, contentType: string): string {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('png')) return '.png'
  if (ct.includes('webp')) return '.webp'
  return '.jpg'
}

function publicUrlFor(bucket: string, region: string, objectKey: string): string {
  const reg = region.startsWith('oss-') ? region : `oss-${region.replace(/^oss-/, '')}`
  return `https://${bucket}.${reg}.aliyuncs.com/${objectKey}`
}

export function isGroupQrOssUrl(raw: unknown): boolean {
  return /^https:\/\//i.test(String(raw || '').trim())
}

export async function createMpGroupQrUploadPlan(input: {
  mpOrderId: string
  fileName?: string
  contentType?: string
  sizeBytes: number
}): Promise<
  | { ok: true; uploadUrl: string; imageUrl: string; contentType: string; objectKey: string }
  | { ok: false; message: string }
> {
  const mpOrderId = String(input.mpOrderId || '')
    .trim()
    .replace(/[^\w-]/g, '')
  if (!mpOrderId) return { ok: false, message: 'invalid_mp_order' }

  const sizeBytes = Number(input.sizeBytes) || 0
  if (!sizeBytes || sizeBytes <= 0) return { ok: false, message: 'invalid_size' }
  if (sizeBytes > MAX_BYTES) return { ok: false, message: 'group_qr_too_large' }

  const env = await resolveMerchantProductImageEnv()
  const cfg = readMerchantProductImageOssEnv(env)
  if (!cfg?.bucket || !cfg.accessKeyId || !cfg.accessKeySecret) {
    return { ok: false, message: 'oss_not_configured' }
  }

  const contentType = String(input.contentType || 'image/jpeg').trim() || 'image/jpeg'
  const ext = safeExt(input.fileName || 'group-qr.jpg', contentType)
  const objectKey = `${OSS_PREFIX}/${mpOrderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`

  try {
    const mod = await import('ali-oss')
    const OSS = mod.default as unknown as new (opts: Record<string, unknown>) => {
      signatureUrl: (
        key: string,
        opts: Record<string, unknown>,
      ) => string
    }
    const client = new OSS({
      region: cfg.region,
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
    })
    const uploadUrl = client
      .signatureUrl(objectKey, {
        method: 'PUT',
        expires: UPLOAD_EXPIRES_SEC,
        'Content-Type': contentType,
        secure: true,
      })
      .replace(/^http:\/\//i, 'https://')
    const imageUrl = publicUrlFor(cfg.bucket, cfg.region, objectKey)
    return { ok: true, uploadUrl, imageUrl, contentType, objectKey }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.slice(0, 240) }
  }
}

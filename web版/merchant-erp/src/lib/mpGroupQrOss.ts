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

  const plan = await resolveMpGroupQrObjectPlan({
    mpOrderId,
    fileName: input.fileName,
    contentType: input.contentType,
  })
  if (!plan.ok) return plan

  try {
    const mod = await import('ali-oss')
    const OSS = mod.default as unknown as new (opts: Record<string, unknown>) => {
      signatureUrl: (
        key: string,
        opts: Record<string, unknown>,
      ) => string
    }
    const client = new OSS({
      region: plan.cfg.region,
      bucket: plan.cfg.bucket,
      accessKeyId: plan.cfg.accessKeyId,
      accessKeySecret: plan.cfg.accessKeySecret,
    })
    const uploadUrl = client
      .signatureUrl(plan.objectKey, {
        method: 'PUT',
        expires: UPLOAD_EXPIRES_SEC,
        'Content-Type': plan.contentType,
        secure: true,
      })
      .replace(/^http:\/\//i, 'https://')
    return {
      ok: true,
      uploadUrl,
      imageUrl: plan.imageUrl,
      contentType: plan.contentType,
      objectKey: plan.objectKey,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.slice(0, 240) }
  }
}

/** 服务端直传 OSS（小程序走 erp-api，避免 OSS 域名未入 request 合法域名） */
export async function putMpGroupQrBuffer(input: {
  mpOrderId: string
  fileName?: string
  contentType?: string
  buffer: Buffer
}): Promise<
  | { ok: true; imageUrl: string; objectKey: string; contentType: string }
  | { ok: false; message: string }
> {
  const buffer = input.buffer
  const sizeBytes = buffer?.length || 0
  if (!sizeBytes) return { ok: false, message: 'invalid_size' }
  if (sizeBytes > MAX_BYTES) return { ok: false, message: 'group_qr_too_large' }

  const plan = await resolveMpGroupQrObjectPlan({
    mpOrderId: input.mpOrderId,
    fileName: input.fileName,
    contentType: input.contentType,
  })
  if (!plan.ok) return plan

  try {
    const mod = await import('ali-oss')
    const OSS = mod.default as unknown as new (opts: Record<string, unknown>) => {
      put: (
        key: string,
        data: Buffer,
        opts?: Record<string, unknown>,
      ) => Promise<unknown>
    }
    const client = new OSS({
      region: plan.cfg.region,
      bucket: plan.cfg.bucket,
      accessKeyId: plan.cfg.accessKeyId,
      accessKeySecret: plan.cfg.accessKeySecret,
    })
    await client.put(plan.objectKey, buffer, {
      headers: { 'Content-Type': plan.contentType },
    })
    return {
      ok: true,
      imageUrl: plan.imageUrl,
      objectKey: plan.objectKey,
      contentType: plan.contentType,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.slice(0, 240) }
  }
}

async function resolveMpGroupQrObjectPlan(input: {
  mpOrderId: string
  fileName?: string
  contentType?: string
}): Promise<
  | {
      ok: true
      cfg: NonNullable<ReturnType<typeof readMerchantProductImageOssEnv>>
      objectKey: string
      imageUrl: string
      contentType: string
    }
  | { ok: false; message: string }
> {
  const mpOrderId = String(input.mpOrderId || '')
    .trim()
    .replace(/[^\w-]/g, '')
  if (!mpOrderId) return { ok: false, message: 'invalid_mp_order' }

  const env = await resolveMerchantProductImageEnv()
  const cfg = readMerchantProductImageOssEnv(env)
  if (!cfg?.bucket || !cfg.accessKeyId || !cfg.accessKeySecret) {
    return { ok: false, message: 'oss_not_configured' }
  }

  const contentType = String(input.contentType || 'image/jpeg').trim() || 'image/jpeg'
  const ext = safeExt(input.fileName || 'group-qr.jpg', contentType)
  const objectKey = `${OSS_PREFIX}/${mpOrderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const imageUrl = publicUrlFor(cfg.bucket, cfg.region, objectKey)
  return { ok: true, cfg, objectKey, imageUrl, contentType }
}

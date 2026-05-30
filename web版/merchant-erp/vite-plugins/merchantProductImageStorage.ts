/**
 * 商户商品图上传：优先阿里云 OSS（与云剪同 Bucket 时可共用 AccessKey），备选 Supabase Storage。
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from './merchantSupabaseAdminEnv.js'

export const MERCHANT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export function productImageDemoFallbackAllowed(): boolean {
  const a = process.env.MERCHANT_PRODUCT_IMAGE_UPLOAD_DEMO_FALLBACK?.trim().toLowerCase()
  const b = process.env.MERCHANT_DOUYIN_IMAGE_UPLOAD_DEMO_FALLBACK?.trim().toLowerCase()
  const c = process.env.MERCHANT_KUAISHOU_IMAGE_UPLOAD_DEMO_FALLBACK?.trim().toLowerCase()
  return (
    a === '1' ||
    a === 'true' ||
    b === '1' ||
    b === 'true' ||
    c === '1' ||
    c === 'true'
  )
}

export function merchantProductImageStoragePrefix(): string {
  const p = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_PREFIX ??
    process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_PREFIX ??
    'douyin-goods'
  )
    .trim()
    .replace(/^\/+|\/+$/g, '')
  return p || 'douyin-goods'
}

export function merchantProductImageSupabaseBucket(): string {
  return (process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET ?? '').trim()
}

export type MerchantProductImageOssEnv = {
  bucket: string
  region: string
  accessKeyId: string
  accessKeySecret: string
}

/** ali-oss 需要 `oss-cn-shanghai` 形式；勿写成 `shanghai` 或 `oss-shanghai`。 */
function normalizeOssRegion(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (!t) return 'oss-cn-shanghai'
  const core = t.replace(/^oss-/, '')
  const cityAlias: Record<string, string> = {
    shanghai: 'cn-shanghai',
    hangzhou: 'cn-hangzhou',
    beijing: 'cn-beijing',
    shenzhen: 'cn-shenzhen',
    qingdao: 'cn-qingdao',
    zhangjiakou: 'cn-zhangjiakou',
    huhehaote: 'cn-huhehaote',
  }
  const normalized = cityAlias[core] ?? core
  return normalized.startsWith('cn-') || normalized.startsWith('us-') || normalized.startsWith('ap-')
    ? `oss-${normalized}`
    : /^oss-/.test(t)
      ? t
      : `oss-${normalized}`
}

export function readMerchantProductImageOssEnv(): MerchantProductImageOssEnv | null {
  const bucket = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_BUCKET ??
    process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET ??
    ''
  ).trim()
  const region = normalizeOssRegion(
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_REGION ??
      process.env.ALIYUN_ICE_OUTPUT_OSS_REGION ??
      'oss-cn-shanghai',
  )
  const accessKeyId = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID ??
    process.env.ALIYUN_ICE_ACCESS_KEY_ID ??
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ??
    ''
  ).trim()
  const accessKeySecret = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET ??
    process.env.ALIYUN_ICE_ACCESS_KEY_SECRET ??
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ??
    ''
  ).trim()
  if (!bucket || !accessKeyId || !accessKeySecret) return null
  return { bucket, region, accessKeyId, accessKeySecret }
}

export function merchantProductImageOssConfigured(): boolean {
  return readMerchantProductImageOssEnv() !== null
}

export function merchantProductImageSupabaseConfigured(): boolean {
  const bucket = merchantProductImageSupabaseBucket()
  if (!bucket) return false
  return readMerchantSupabaseAdminEnv().missingParts.length === 0
}

export function merchantProductImageStorageConfigured(): 'oss' | 'supabase' | null {
  if (merchantProductImageOssConfigured()) return 'oss'
  if (merchantProductImageSupabaseConfigured()) return 'supabase'
  return null
}

export function merchantProductImageStorageMissingMessage(): string {
  const lines: string[] = [
    '商品图上传需配置阿里云 OSS（推荐，与云剪可共用 Bucket）或 Supabase Storage。',
    'OSS：MERCHANT_PRODUCT_IMAGE_OSS_BUCKET、MERCHANT_PRODUCT_IMAGE_OSS_REGION、MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID、MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET（可与 ALIYUN_ICE_ACCESS_KEY_* 相同）；可选 MERCHANT_PRODUCT_IMAGE_OSS_PREFIX。',
    'Supabase Storage（备选）：MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET + SUPABASE_SERVICE_ROLE_KEY。',
  ]
  const oss = readMerchantProductImageOssEnv()
  if (!oss?.bucket) lines.push('· 缺少 MERCHANT_PRODUCT_IMAGE_OSS_BUCKET')
  if (oss && !oss.accessKeyId) lines.push('· 缺少 OSS AccessKey ID')
  if (oss && !oss.accessKeySecret) lines.push('· 缺少 OSS AccessKey Secret')
  const adminParts = readMerchantSupabaseAdminEnv()
  if (!merchantProductImageSupabaseBucket() && !oss?.bucket) {
    lines.push('· 缺少 MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET（若不用 OSS）')
  }
  if (adminParts.missingParts.length && !merchantProductImageOssConfigured()) {
    lines.push(merchantSupabaseAdminEnvConfigureHint(adminParts.missingParts))
  }
  return lines.join('\n')
}

function extFromMimeAndName(mime: string, name: string): string {
  const m = mime.toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('bmp')) return 'bmp'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  const base = name.split(/[/\\]/).pop() ?? ''
  const hit = /\.([a-z0-9]{1,8})$/i.exec(base)
  if (hit && /^[a-z0-9]+$/i.test(hit[1]!)) return hit[1]!.toLowerCase()
  return 'jpg'
}

function buildObjectPath(merchantId: string, safeMime: string, originalName: string): string {
  const safeMid = merchantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'merchant'
  const ext = extFromMimeAndName(safeMime, originalName)
  return `${merchantProductImageStoragePrefix()}/${safeMid}/${Date.now()}-${randomUUID()}.${ext}`
}

async function uploadMerchantProductImageToOss(params: {
  merchantId: string
  buf: Buffer
  safeMime: string
  originalName: string
}): Promise<{ publicUrl: string; objectPath: string; bucket: string }> {
  const cfg = readMerchantProductImageOssEnv()
  if (!cfg) throw new Error('OSS 未配置')

  const objectPath = buildObjectPath(params.merchantId, params.safeMime, params.originalName)
  const { default: OSS } = await import('ali-oss')
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })

  await client.put(objectPath, params.buf, {
    headers: {
      'Content-Type': params.safeMime,
      'Cache-Control': 'public, max-age=604800',
    },
  })

  const publicUrl = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${objectPath}`
  if (!/^https:\/\//i.test(publicUrl)) {
    throw new Error('OSS 公开 URL 生成失败：请确认 Bucket 为公共读')
  }
  return { publicUrl, objectPath, bucket: cfg.bucket }
}

async function uploadMerchantProductImageToSupabase(params: {
  merchantId: string
  buf: Buffer
  safeMime: string
  originalName: string
}): Promise<{ publicUrl: string; objectPath: string; bucket: string }> {
  const bucket = merchantProductImageSupabaseBucket()
  if (!bucket) throw new Error('MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET 未配置')

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    throw new Error(`Supabase 服务端密钥不齐：${missingParts.join(', ')}`)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const objectPath = buildObjectPath(params.merchantId, params.safeMime, params.originalName)

  const { error } = await admin.storage.from(bucket).upload(objectPath, params.buf, {
    contentType: params.safeMime,
    upsert: false,
    cacheControl: 'public, max-age=604800',
  })
  if (error) {
    throw new Error(error.message || 'storage.upload 失败')
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(objectPath)
  const publicUrl = pub.publicUrl?.trim() ?? ''
  if (!/^https:\/\//i.test(publicUrl)) {
    throw new Error('getPublicUrl 未返回 https：请将桶设为 Public bucket，或为 storage.objects 配置匿名可读策略')
  }
  return { publicUrl, objectPath, bucket }
}

export async function uploadMerchantProductImage(params: {
  merchantId: string
  buf: Buffer
  safeMime: string
  originalName: string
}): Promise<{ publicUrl: string; objectPath: string; storage: 'oss' | 'supabase'; bucket: string }> {
  const mode = merchantProductImageStorageConfigured()
  if (mode === 'oss') {
    const r = await uploadMerchantProductImageToOss(params)
    return { ...r, storage: 'oss' }
  }
  if (mode === 'supabase') {
    const r = await uploadMerchantProductImageToSupabase(params)
    return { ...r, storage: 'supabase' }
  }
  throw new Error('商品图存储未配置')
}

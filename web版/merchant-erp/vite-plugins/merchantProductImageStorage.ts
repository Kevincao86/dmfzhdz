/**
 * 商户商品图上传：优先阿里云 OSS（与云剪同 Bucket 时可共用 AccessKey），备选 Supabase Storage。
 */
/// <reference path="./ali-oss.d.ts" />
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { parseOssUrlPrefix, type ParsedOssPrefix } from './aliyunOssIceParse.js'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { mergeVideoAiMerchantEnvWithSnapshot } from './merchantVideoAiGateway.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from './merchantSupabaseAdminEnv.js'

export type MerchantProductImageStorageContext = {
  viteRoot?: string
  env?: Record<string, string | undefined>
}

/** 与云剪同源：合并 .env、本地 registry.json、Supabase ops_registry_snapshot 中的 videoAi。 */
export async function resolveMerchantProductImageEnv(
  ctx?: MerchantProductImageStorageContext,
): Promise<Record<string, string | undefined>> {
  const base = { ...process.env, ...ctx?.env } as MerchantAiEnv
  return (await mergeVideoAiMerchantEnvWithSnapshot(
    ctx?.viteRoot ?? process.cwd(),
    base,
  )) as Record<string, string | undefined>
}

export const MERCHANT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
/** 私有 Bucket 时返回给前端的签名 URL 有效期（秒）；抖音拉图需在此窗口内完成审核或配置 Bucket 公共读前缀 */
export const MERCHANT_PRODUCT_IMAGE_SIGNED_URL_EXPIRES_SEC = 7 * 24 * 3600

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

function normalizeOssKeyPrefix(raw: string): string {
  return raw.trim().replace(/^\/+|\/+$/g, '')
}

function readIceOssUrlPrefix(env: Record<string, string | undefined>): ParsedOssPrefix | null {
  const candidates = [
    env.ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX,
    env.ALIYUN_ICE_SOURCE_OSS_URL_PREFIX,
    env.MERCHANT_PRODUCT_IMAGE_ICE_OSS_URL_PREFIX,
  ]
  for (const raw of candidates) {
    const parsed = parseOssUrlPrefix(String(raw ?? '').trim())
    if (parsed) return parsed
  }
  return null
}

/** 云剪 RAM 常见授权目录；运营台未填 OSS URL 前缀时用作商品图回退。 */
const DEFAULT_ICE_OBJECT_KEY_PREFIXES = ['meoo-out', 'meoo_out'] as const

function iceObjectKeyPrefixes(env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  const add = (p: string) => {
    const n = normalizeOssKeyPrefix(p)
    if (n && !out.includes(n)) out.push(n)
  }
  add(env.MERCHANT_PRODUCT_IMAGE_OSS_ICE_SUBPREFIX ?? '')
  const ice = readIceOssUrlPrefix(env)
  if (ice?.keyPrefix) add(ice.keyPrefix)
  if (readMerchantProductImageOssEnv(env)) {
    for (const p of DEFAULT_ICE_OBJECT_KEY_PREFIXES) add(p)
  }
  return out
}

function underIceDouyinGoodsPrefix(env: Record<string, string | undefined>): string | null {
  const ice = readIceOssUrlPrefix(env)
  if (ice?.keyPrefix) {
    return `${normalizeOssKeyPrefix(ice.keyPrefix)}/douyin-goods`
  }
  const first = iceObjectKeyPrefixes(env)[0]
  return first ? `${first}/douyin-goods` : null
}

/** 与云剪本地上传一致：RAM 常仅授权 `{prefix}/source/*`。 */
function iceSourceDouyinGoodsPrefixes(env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  const add = (p: string) => {
    const n = normalizeOssKeyPrefix(p)
    if (n && !out.includes(n)) out.push(n)
  }
  const ice = readIceOssUrlPrefix(env)
  if (ice?.keyPrefix) add(`${ice.keyPrefix}/source/douyin-goods`)
  for (const kp of iceObjectKeyPrefixes(env)) {
    add(`${kp}/source/douyin-goods`)
  }
  return out
}

/** 云剪 RAM 常只授权 meoo-out/*；未显式配置时默认写到该目录下的 douyin-goods。 */
export function merchantProductImageStoragePrefix(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const explicit = normalizeOssKeyPrefix(
    env.MERCHANT_PRODUCT_IMAGE_OSS_PREFIX ?? env.MERCHANT_PRODUCT_IMAGE_SUPABASE_PREFIX ?? '',
  )
  const underIce = underIceDouyinGoodsPrefix(env)
  if (explicit) {
    if (explicit === 'douyin-goods' && underIce) return underIce
    return explicit
  }
  if (underIce) return underIce
  return 'douyin-goods'
}

/** 上传失败时按顺序尝试的前缀（云剪目录优先，避免 RAM 仅授权 meoo-out/* 时先写根目录 douyin-goods）。 */
export function merchantProductImageStoragePrefixCandidates(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string[] {
  const primary = merchantProductImageStoragePrefix(env)
  const out: string[] = []
  const add = (p: string) => {
    const n = normalizeOssKeyPrefix(p)
    if (n && !out.includes(n)) out.push(n)
  }

  for (const p of iceSourceDouyinGoodsPrefixes(env)) add(p)

  const underIce = underIceDouyinGoodsPrefix(env)
  if (underIce) add(underIce)

  for (const kp of iceObjectKeyPrefixes(env)) {
    add(`${kp}/douyin-goods`)
  }

  if (primary) add(primary)

  const hasNestedDouyinGoods = out.some((p) => p.includes('/') && p.endsWith('douyin-goods'))
  if (!hasNestedDouyinGoods) add('douyin-goods')

  return out
}

function isOssBucketAclError(msg: string): boolean {
  return /bucket acl|access denied|accessdenied|403/i.test(msg)
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

export function readMerchantProductImageOssEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): MerchantProductImageOssEnv | null {
  const accessKeyId = (
    env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID ??
    env.ALIYUN_ICE_ACCESS_KEY_ID ??
    env.ALIBABA_CLOUD_ACCESS_KEY_ID ??
    ''
  ).trim()
  const accessKeySecret = (
    env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET ??
    env.ALIYUN_ICE_ACCESS_KEY_SECRET ??
    env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ??
    ''
  ).trim()
  if (!accessKeyId || !accessKeySecret) return null

  const explicitBucket = (env.MERCHANT_PRODUCT_IMAGE_OSS_BUCKET ?? '').trim()
  const iceParsed = readIceOssUrlPrefix(env)
  const bucket = explicitBucket || iceParsed?.bucket || ''
  const region = normalizeOssRegion(
    env.MERCHANT_PRODUCT_IMAGE_OSS_REGION?.trim() ||
      (iceParsed ? `oss-${iceParsed.region}` : '') ||
      env.ALIYUN_ICE_OUTPUT_OSS_REGION ||
      env.ALIYUN_ICE_REGION ||
      'oss-cn-shanghai',
  )
  if (!bucket) return null
  return { bucket, region, accessKeyId, accessKeySecret }
}

export function formatMerchantProductImageOssError(raw: string, env?: Record<string, string | undefined>): string {
  const msg = raw.trim()
  if (isOssBucketAclError(msg)) {
    const bucket =
      readMerchantProductImageOssEnv(env)?.bucket ||
      readIceOssUrlPrefix(env ?? (process.env as Record<string, string | undefined>))?.bucket ||
      'your-bucket'
    const preferredPrefix = merchantProductImageStoragePrefix(
      env ?? (process.env as Record<string, string | undefined>),
    )
    const nested = merchantProductImageStoragePrefixCandidates(
      env ?? (process.env as Record<string, string | undefined>),
    ).filter((p) => p.includes('/'))
    const ramHint =
      nested.length > 0
        ? `云剪 RAM 通常只授权 ${nested[0].split('/')[0]}/*：请删除 Vercel 中的 MERCHANT_PRODUCT_IMAGE_OSS_PREFIX=douyin-goods，或在运营台填写 ICE 成片 OSS 前缀（如 https://${bucket}.oss-cn-shanghai.aliyuncs.com/meoo-out/）后 Redeploy。`
        : '云剪 RAM 通常只授权 meoo-out/*：请删除 MERCHANT_PRODUCT_IMAGE_OSS_PREFIX=douyin-goods，或在运营台填写 ICE 成片 OSS 前缀后 Redeploy。'
    return [
      msg,
      'AccessKey 可能缺少 oss:PutObject 权限，或 Bucket 已禁用 ACL 但当前账号无权写入。',
      ramHint,
      '请在 RAM 为子账号授权（Resource 改成你的 Bucket）：',
      ...nested.slice(0, 2).map(
        (p) => `  oss:PutObject、oss:GetObject → acs:oss:*:*:${bucket}/${p}/*`,
      ),
      ...(nested.length === 0
        ? [`  oss:PutObject、oss:GetObject → acs:oss:*:*:${bucket}/${preferredPrefix}/*`]
        : []),
      `若抖音需长期拉图，请在 OSS 控制台为商品图目录配置 Bucket 策略允许匿名 GetObject（公共读前缀）。`,
    ].join(' ')
  }
  if (/signature|does not match/i.test(msg)) {
    return `${msg} 请核对 AccessKey ID/Secret 成对，且 MERCHANT_PRODUCT_IMAGE_OSS_REGION 与 Bucket 地域一致（如 oss-cn-shanghai）。`
  }
  if (/nosuchbucket|bucket does not exist/i.test(msg)) {
    return `${msg} 请检查 MERCHANT_PRODUCT_IMAGE_OSS_BUCKET 是否为真实 OSS 桶名（勿填 Supabase Storage 桶名）。`
  }
  return msg
}

export function merchantProductImageOssConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return readMerchantProductImageOssEnv(env) !== null
}

export async function merchantProductImageOssConfiguredWithRegistry(
  ctx?: MerchantProductImageStorageContext,
): Promise<boolean> {
  const env = await resolveMerchantProductImageEnv(ctx)
  return merchantProductImageOssConfigured(env)
}

export function merchantProductImageSupabaseConfigured(): boolean {
  const bucket = merchantProductImageSupabaseBucket()
  if (!bucket) return false
  return readMerchantSupabaseAdminEnv().missingParts.length === 0
}

export function merchantProductImageStorageConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): 'oss' | 'supabase' | null {
  if (merchantProductImageOssConfigured(env)) return 'oss'
  if (merchantProductImageSupabaseConfigured()) return 'supabase'
  return null
}

export async function merchantProductImageStorageConfiguredWithRegistry(
  ctx?: MerchantProductImageStorageContext,
): Promise<'oss' | 'supabase' | null> {
  const env = await resolveMerchantProductImageEnv(ctx)
  return merchantProductImageStorageConfigured(env)
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
  if (m.includes('webm')) return 'webm'
  if (m.includes('quicktime')) return 'mov'
  if (m.includes('mp4') || m.includes('m4v')) return 'mp4'
  const base = name.split(/[/\\]/).pop() ?? ''
  const hit = /\.([a-z0-9]{1,8})$/i.exec(base)
  if (hit && /^[a-z0-9]+$/i.test(hit[1]!)) return hit[1]!.toLowerCase()
  return 'jpg'
}

function buildObjectPath(
  keyPrefix: string,
  merchantId: string,
  safeMime: string,
  originalName: string,
): string {
  const safeMid = merchantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'merchant'
  const ext = extFromMimeAndName(safeMime, originalName)
  return `${normalizeOssKeyPrefix(keyPrefix)}/${safeMid}/${Date.now()}-${randomUUID()}.${ext}`
}

function productImageOssUseAuthV4(env: Record<string, string | undefined>): boolean {
  const raw = (env.MERCHANT_PRODUCT_IMAGE_OSS_AUTH_V4 ?? '').trim().toLowerCase()
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  /** 与云剪 ali-oss 客户端默认一致；避免 V4 签名与 RAM/Bucket 策略不匹配导致 bucket acl */
  return false
}

async function createMerchantProductImageOssClient(
  cfg: MerchantProductImageOssEnv,
  env: Record<string, string | undefined>,
  opts?: { authorizationV4?: boolean },
) {
  const { default: OSS } = await import('ali-oss')
  const endpoint = (env.MERCHANT_PRODUCT_IMAGE_OSS_ENDPOINT ?? '').trim()
  const useV4 = opts?.authorizationV4 ?? productImageOssUseAuthV4(env)
  return new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
    secure: true,
    ...(endpoint ? { endpoint } : {}),
    ...(useV4 ? { authorizationV4: true } : {}),
  })
}

function buildOssVirtualHostUrl(cfg: MerchantProductImageOssEnv, objectPath: string): string {
  return `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${objectPath}`
}

async function resolveOssObjectPublicUrl(
  client: Awaited<ReturnType<typeof createMerchantProductImageOssClient>>,
  cfg: MerchantProductImageOssEnv,
  objectPath: string,
  env: Record<string, string | undefined>,
): Promise<{ publicUrl: string; accessMode: 'public' | 'signed' }> {
  const virtualUrl = buildOssVirtualHostUrl(cfg, objectPath)
  const preferPublic = env.MERCHANT_PRODUCT_IMAGE_OSS_PUBLIC_URL !== '0'
  if (preferPublic) {
    try {
      const r = await fetch(virtualUrl, { method: 'HEAD' })
      if (r.ok) return { publicUrl: virtualUrl, accessMode: 'public' }
    } catch {
      /* fall through to signed URL */
    }
  }
  const signed = client.signatureUrl(objectPath, {
    expires: MERCHANT_PRODUCT_IMAGE_SIGNED_URL_EXPIRES_SEC,
  })
  if (!/^https:\/\//i.test(signed)) {
    throw new Error('OSS 签名 URL 生成失败')
  }
  return { publicUrl: signed, accessMode: 'signed' }
}

async function uploadMerchantProductImageToOss(
  params: {
    merchantId: string
    buf: Buffer
    safeMime: string
    originalName: string
  },
  env: Record<string, string | undefined>,
): Promise<{ publicUrl: string; objectPath: string; bucket: string; accessMode: 'public' | 'signed' }> {
  const cfg = readMerchantProductImageOssEnv(env)
  if (!cfg) throw new Error('OSS 未配置')

  const prefixCandidates = merchantProductImageStoragePrefixCandidates(env)
  let lastErr = 'OSS 上传失败'

  const tryPut = async (useV4: boolean) => {
    const client = await createMerchantProductImageOssClient(cfg, env, { authorizationV4: useV4 })
    for (let i = 0; i < prefixCandidates.length; i++) {
      const keyPrefix = prefixCandidates[i]!
      const objectPath = buildObjectPath(keyPrefix, params.merchantId, params.safeMime, params.originalName)
      try {
        await client.put(objectPath, params.buf, {
          headers: {
            'Content-Type': params.safeMime,
            'Cache-Control': 'public, max-age=604800',
          },
        })
        const { publicUrl, accessMode } = await resolveOssObjectPublicUrl(client, cfg, objectPath, env)
        return { publicUrl, objectPath, bucket: cfg.bucket, accessMode }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        const canRetry = i < prefixCandidates.length - 1 && isOssBucketAclError(lastErr)
        if (!canRetry) break
      }
    }
    return null
  }

  const primaryV4 = productImageOssUseAuthV4(env)
  const hit = (await tryPut(primaryV4)) ?? (primaryV4 ? await tryPut(false) : await tryPut(true))
  if (hit) return hit

  throw new Error(formatMerchantProductImageOssError(lastErr, env))
}

async function uploadMerchantProductImageToSupabase(
  params: {
    merchantId: string
    buf: Buffer
    safeMime: string
    originalName: string
  },
  env: Record<string, string | undefined>,
): Promise<{ publicUrl: string; objectPath: string; bucket: string }> {
  const bucket = merchantProductImageSupabaseBucket()
  if (!bucket) throw new Error('MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET 未配置')

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    throw new Error(`Supabase 服务端密钥不齐：${missingParts.join(', ')}`)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const objectPath = buildObjectPath(
    merchantProductImageStoragePrefix(env),
    params.merchantId,
    params.safeMime,
    params.originalName,
  )

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

export async function uploadMerchantProductImage(
  params: {
    merchantId: string
    buf: Buffer
    safeMime: string
    originalName: string
  },
  ctx?: MerchantProductImageStorageContext,
): Promise<{
  publicUrl: string
  objectPath: string
  storage: 'oss' | 'supabase'
  bucket: string
  accessMode?: 'public' | 'signed'
}> {
  const env = await resolveMerchantProductImageEnv(ctx)
  const mode = merchantProductImageStorageConfigured(env)
  if (mode === 'oss') {
    const r = await uploadMerchantProductImageToOss(params, env)
    return { ...r, storage: 'oss' }
  }
  if (mode === 'supabase') {
    const r = await uploadMerchantProductImageToSupabase(params, env)
    return { ...r, storage: 'supabase' }
  }
  throw new Error('商品图存储未配置')
}

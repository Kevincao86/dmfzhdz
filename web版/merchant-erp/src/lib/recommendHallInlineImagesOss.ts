/**
 * 推荐大厅响应：内联 base64 图片转 OSS 公网 URL（不删字段、不剥离报名明细）
 * 解决小程序云函数代理 1MB 响应上限，同时保留头像/封面/群码等完整业务数据。
 */
import { createHash } from 'node:crypto'
import {
  readMerchantProductImageOssEnv,
  resolveMerchantProductImageEnv,
} from '../../vite-plugins/merchantProductImageStorage.js'

const INLINE_IMAGE_RE = /^data:image\/[\w+.-]+;base64,/i
const OSS_PREFIX = String(process.env.REGISTRY_INLINE_OSS_PREFIX || 'mp-registry-assets').replace(/^\/+|\/+$/g, '')
const MAX_INLINE_LEN = 600
const UPLOAD_CONCURRENCY = 6

/** 进程内 dedupe：相同图片 hash → 同一 OSS URL */
const ossUrlByHash = new Map<string, string>()

type OssRuntime = {
  client: {
    head: (key: string) => Promise<unknown>
    put: (key: string, buf: Buffer, opts?: { headers?: Record<string, string> }) => Promise<unknown>
  }
  bucket: string
  region: string
}

let ossRuntimePromise: Promise<OssRuntime | null> | null = null

function isInlineImageValue(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s) return false
  if (INLINE_IMAGE_RE.test(s)) return true
  return s.length > MAX_INLINE_LEN && s.startsWith('data:image/')
}

function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  try {
    const buf = Buffer.from(m[2]!, 'base64')
    if (!buf.length) return null
    return { mime: m[1]!.toLowerCase(), buf }
  } catch {
    return null
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

function publicUrlFor(bucket: string, region: string, objectKey: string): string {
  const reg = region.startsWith('oss-') ? region : `oss-${region.replace(/^oss-/, '')}`
  return `https://${bucket}.${reg}.aliyuncs.com/${objectKey}`
}

async function loadOssRuntime(): Promise<OssRuntime | null> {
  if (!ossRuntimePromise) {
    ossRuntimePromise = (async () => {
      const env = await resolveMerchantProductImageEnv()
      const cfg = readMerchantProductImageOssEnv(env)
      if (!cfg?.bucket || !cfg.accessKeyId || !cfg.accessKeySecret) return null
      try {
        const mod = await import('ali-oss')
        const OSS = mod.default as unknown as new (opts: Record<string, unknown>) => OssRuntime['client'] & {
          options: { bucket: string; region: string }
        }
        const client = new OSS({
          region: cfg.region,
          bucket: cfg.bucket,
          accessKeyId: cfg.accessKeyId,
          accessKeySecret: cfg.accessKeySecret,
        })
        return { client, bucket: cfg.bucket, region: cfg.region }
      } catch (e) {
        console.warn('[recommend_hall_oss] init failed:', e instanceof Error ? e.message : e)
        return null
      }
    })()
  }
  return ossRuntimePromise
}

async function ensureInlineImageOssUrl(dataUrl: string, rt: OssRuntime): Promise<string> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return dataUrl
  const hash = createHash('sha256').update(parsed.buf).digest('hex')
  const cached = ossUrlByHash.get(hash)
  if (cached) return cached

  const ext = extFromMime(parsed.mime)
  const objectKey = `${OSS_PREFIX}/${hash.slice(0, 2)}/${hash}.${ext}`
  const publicUrl = publicUrlFor(rt.bucket, rt.region, objectKey)

  try {
    await rt.client.head(objectKey)
  } catch {
    await rt.client.put(objectKey, parsed.buf, {
      headers: {
        'Content-Type': parsed.mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  ossUrlByHash.set(hash, publicUrl)
  return publicUrl
}

async function mapPool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx]!)
    }
  }
  const n = Math.min(UPLOAD_CONCURRENCY, Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => run()))
  return out
}

async function collectInlineStrings(root: unknown, out: string[]): Promise<void> {
  if (typeof root === 'string') {
    if (isInlineImageValue(root)) out.push(root)
    return
  }
  if (Array.isArray(root)) {
    for (const item of root) await collectInlineStrings(item, out)
    return
  }
  if (root && typeof root === 'object') {
    for (const v of Object.values(root as Record<string, unknown>)) {
      await collectInlineStrings(v, out)
    }
  }
}

async function replaceInlineStrings(root: unknown, replaceMap: Map<string, string>): Promise<unknown> {
  if (typeof root === 'string') {
    return replaceMap.get(root) ?? root
  }
  if (Array.isArray(root)) {
    return mapPool(root, (item) => replaceInlineStrings(item, replaceMap))
  }
  if (root && typeof root === 'object') {
    const src = root as Record<string, unknown>
    const next: Record<string, unknown> = {}
    const keys = Object.keys(src)
    await mapPool(keys, async (k) => {
      next[k] = await replaceInlineStrings(src[k], replaceMap)
    })
    return next
  }
  return root
}

/** 深度遍历：仅把 data:image base64 换成 OSS HTTPS URL，其余字段原样保留 */
export async function hydrateRecommendHallInlineImagesToOss(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rt = await loadOssRuntime()
  if (!rt) {
    console.warn('[recommend_hall_oss] OSS 未配置，推荐大厅仍返回内联图（可能超云函数 1MB）')
    return payload
  }

  const unique: string[] = []
  await collectInlineStrings(payload, unique)
  const distinct = [...new Set(unique)]
  if (!distinct.length) return payload

  const replaceMap = new Map<string, string>()
  await mapPool(distinct, async (raw) => {
    const url = await ensureInlineImageOssUrl(raw, rt)
    replaceMap.set(raw, url)
  })

  const hydrated = (await replaceInlineStrings(payload, replaceMap)) as Record<string, unknown>
  return hydrated
}

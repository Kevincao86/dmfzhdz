/**
 * GET /api/meoo-product-image-storage-ping — 诊断商品图 OSS/Storage 是否在 Vercel 运行时生效
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  formatMerchantProductImageOssError,
  merchantProductImageStorageConfigured,
  merchantProductImageStorageMissingMessage,
  merchantProductImageStoragePrefix,
  readMerchantProductImageOssEnv,
} from '../vite-plugins/merchantProductImageStorage.js'
import { merchantDouyinSessionSecret } from './douyin-bind.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const mode = merchantProductImageStorageConfigured()
  const oss = readMerchantProductImageOssEnv()
  const out: Record<string, unknown> = {
    ok: mode === 'oss',
    storageMode: mode,
    oss: oss
      ? {
          bucket: oss.bucket,
          region: oss.region,
          hasAccessKeyId: !!oss.accessKeyId,
          hasAccessKeySecret: !!oss.accessKeySecret,
          prefix: merchantProductImageStoragePrefix(),
        }
      : null,
    douyinSessionSecretConfigured: !!merchantDouyinSessionSecret(),
    hint:
      mode === 'oss'
        ? 'OSS 环境变量已识别；若上传报 bucket acl，多为 RAM 缺少 oss:PutObject（douyin-goods/*），不是前端问题。'
        : merchantProductImageStorageMissingMessage(),
    checks: {} as Record<string, unknown>,
  }

  if (mode !== 'oss' || !oss) {
    sendJson(res, 503, out)
    return
  }

  try {
    const { default: OSS } = await import('ali-oss')
    const endpoint = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_ENDPOINT ?? '').trim()
    const client = new OSS({
      region: oss.region,
      accessKeyId: oss.accessKeyId,
      accessKeySecret: oss.accessKeySecret,
      bucket: oss.bucket,
      secure: true,
      ...(endpoint ? { endpoint } : {}),
      ...(process.env.MERCHANT_PRODUCT_IMAGE_OSS_AUTH_V4 !== '0' ? { authorizationV4: true } : {}),
    })
    const probeKey = `${merchantProductImageStoragePrefix()}/.meoo-storage-ping.txt`
    await client.put(probeKey, Buffer.from('ping', 'utf8'), {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
    try {
      await client.delete(probeKey)
    } catch {
      /* ignore cleanup failure */
    }
    ;(out.checks as Record<string, unknown>).putProbe = { ok: true, objectKey: probeKey }
    sendJson(res, 200, { ...out, ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const detail = formatMerchantProductImageOssError(msg)
    ;(out.checks as Record<string, unknown>).putProbe = { ok: false, error: detail.slice(0, 800) }
    sendJson(res, 502, {
      ...out,
      ok: false,
      error: detail.slice(0, 800),
      hint: /bucket acl|access denied/i.test(msg)
        ? 'RAM 子账号需授权 oss:PutObject 到 modianningbo/douyin-goods/*；勿把 Supabase 桶名填进 MERCHANT_PRODUCT_IMAGE_OSS_BUCKET。'
        : out.hint,
    })
  }
}

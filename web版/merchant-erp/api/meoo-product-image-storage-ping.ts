/**
 * GET /api/meoo-product-image-storage-ping — 诊断商品图 OSS/Storage 是否在 Vercel 运行时生效
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantProductImageStorageConfigured,
  merchantProductImageStorageMissingMessage,
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
        }
      : null,
    douyinSessionSecretConfigured: !!merchantDouyinSessionSecret(),
    hint:
      mode === 'oss'
        ? 'OSS 环境变量已识别；若上传仍失败，多为 AccessKey 权限、Bucket 区域不匹配或 Bucket 非公共读。'
        : merchantProductImageStorageMissingMessage(),
    checks: {} as Record<string, unknown>,
  }

  if (mode !== 'oss' || !oss) {
    sendJson(res, 503, out)
    return
  }

  try {
    const { default: OSS } = await import('ali-oss')
    const client = new OSS({
      region: oss.region,
      accessKeyId: oss.accessKeyId,
      accessKeySecret: oss.accessKeySecret,
      bucket: oss.bucket,
    })
    const probeKey = `${(process.env.MERCHANT_PRODUCT_IMAGE_OSS_PREFIX ?? 'douyin-goods').replace(/^\/+|\/+$/g, '') || 'douyin-goods'}/.meoo-storage-ping.txt`
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
    ;(out.checks as Record<string, unknown>).putProbe = { ok: false, error: msg.slice(0, 500) }
    sendJson(res, 502, {
      ...out,
      ok: false,
      error: msg.slice(0, 500),
      hint:
        /signature/i.test(msg)
          ? '签名不匹配：请核对 AccessKey ID/Secret 是否成对、Bucket 地域是否与 MERCHANT_PRODUCT_IMAGE_OSS_REGION 一致（如 oss-cn-shanghai）。'
          : out.hint,
    })
  }
}

/**
 * GET /api/meoo-product-image-storage-ping — 诊断商品图 OSS/Storage 是否在 Vercel 运行时生效
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  formatMerchantProductImageOssError,
  merchantProductImageStorageMissingMessage,
  merchantProductImageStoragePrefix,
  merchantProductImageStoragePrefixCandidates,
  readMerchantProductImageOssEnv,
  resolveMerchantProductImageEnv,
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

  const env = await resolveMerchantProductImageEnv({ viteRoot: process.cwd() })
  const storageMode = readMerchantProductImageOssEnv(env)
    ? 'oss'
    : (process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET ?? '').trim()
      ? 'supabase'
      : null
  const oss = readMerchantProductImageOssEnv(env)
  const out: Record<string, unknown> = {
    ok: storageMode === 'oss',
    storageMode,
    oss: oss
      ? {
          bucket: oss.bucket,
          region: oss.region,
          hasAccessKeyId: !!oss.accessKeyId,
          hasAccessKeySecret: !!oss.accessKeySecret,
          prefix: merchantProductImageStoragePrefix(env),
          prefixCandidates: merchantProductImageStoragePrefixCandidates(env),
          iceOutputPrefix: env.ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX ?? null,
        }
      : null,
    douyinSessionSecretConfigured: !!merchantDouyinSessionSecret(),
    hint:
      storageMode === 'oss'
        ? 'OSS 已识别（含运营注册表 videoAi）；若上传报 bucket acl，多为 RAM 缺少 oss:PutObject（优先 meoo-out/douyin-goods）。'
        : merchantProductImageStorageMissingMessage(),
    checks: {} as Record<string, unknown>,
  }

  if (storageMode !== 'oss' || !oss) {
    sendJson(res, 503, out)
    return
  }

  try {
    const { default: OSS } = await import('ali-oss')
    const endpoint = (env.MERCHANT_PRODUCT_IMAGE_OSS_ENDPOINT ?? '').trim()
    const client = new OSS({
      region: oss.region,
      accessKeyId: oss.accessKeyId,
      accessKeySecret: oss.accessKeySecret,
      bucket: oss.bucket,
      secure: true,
      ...(endpoint ? { endpoint } : {}),
      ...(env.MERCHANT_PRODUCT_IMAGE_OSS_AUTH_V4 !== '0' ? { authorizationV4: true } : {}),
    })
    const prefixCandidates = merchantProductImageStoragePrefixCandidates(env)
    const attempts: Array<{ prefix: string; ok: boolean; objectKey?: string; error?: string }> = []
    let successKey: string | null = null

    for (const prefix of prefixCandidates) {
      const probeKey = `${prefix}/.meoo-storage-ping.txt`
      try {
        await client.put(probeKey, Buffer.from('ping', 'utf8'), {
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        })
        try {
          await client.delete(probeKey)
        } catch {
          /* ignore cleanup failure */
        }
        attempts.push({ prefix, ok: true, objectKey: probeKey })
        successKey = probeKey
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push({ prefix, ok: false, error: msg.slice(0, 300) })
      }
    }

    if (!successKey) {
      const last = attempts[attempts.length - 1]
      const msg = last?.error ?? 'put failed'
      const detail = formatMerchantProductImageOssError(msg, env)
      ;(out.checks as Record<string, unknown>).putProbe = { ok: false, attempts }
      sendJson(res, 502, {
        ...out,
        ok: false,
        error: detail.slice(0, 800),
        hint: /bucket acl|access denied/i.test(msg)
          ? 'RAM 可能只授权了云剪目录（如 meoo-out/*）。可删除 MERCHANT_PRODUCT_IMAGE_OSS_PREFIX=douyin-goods，或在运营台填写 ICE 成片 OSS 前缀后 Redeploy。'
          : out.hint,
      })
      return
    }

    ;(out.checks as Record<string, unknown>).putProbe = { ok: true, objectKey: successKey, attempts }
    sendJson(res, 200, { ...out, ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const detail = formatMerchantProductImageOssError(msg, env)
    ;(out.checks as Record<string, unknown>).putProbe = { ok: false, error: detail.slice(0, 800) }
    sendJson(res, 502, {
      ...out,
      ok: false,
      error: detail.slice(0, 800),
      hint: out.hint,
    })
  }
}

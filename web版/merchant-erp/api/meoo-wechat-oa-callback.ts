/**
 * GET  /api/meoo-wechat-oa-callback — 服务号服务器配置 URL 验证
 * POST /api/meoo-wechat-oa-callback — 服务号事件推送（关注带参二维码绑定）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { verifyWechatOaSignature } from '../src/lib/mpWechatOfficialAccountCrypto.js'
import { handleWechatOaEventInSnapshot } from '../src/lib/mpWechatOaCallbackCore.js'
import { loadWechatOaConfig } from '../src/lib/mpWechatOfficialAccountConfig.js'

export const config = { maxDuration: 30 }

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function queryOne(req: VercelRequest, key: string): string {
  const v = req.query[key]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v || '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) {
    if (req.method === 'GET') {
      res.status(503).json({ ok: false, error: 'wx_oa_not_configured', missing: cfgResult.missing })
      return
    }
    res.status(503).send('not configured')
    return
  }
  const cfg = cfgResult.config

  if (req.method === 'GET') {
    const signature = queryOne(req, 'signature')
    const timestamp = queryOne(req, 'timestamp')
    const nonce = queryOne(req, 'nonce')
    const echostr = queryOne(req, 'echostr')
    if (verifyWechatOaSignature(cfg.token, timestamp, nonce, signature)) {
      res.status(200).send(echostr)
      return
    }
    res.status(403).send('invalid signature')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send('method not allowed')
    return
  }

  const signature = queryOne(req, 'signature')
  const timestamp = queryOne(req, 'timestamp')
  const nonce = queryOne(req, 'nonce')
  if (!verifyWechatOaSignature(cfg.token, timestamp, nonce, signature)) {
    res.status(403).send('invalid signature')
    return
  }

  const xml = rawBody(req)
  if (!xml) {
    res.status(200).send('success')
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    res.status(503).send('registry unavailable')
    return
  }

  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const result = handleWechatOaEventInSnapshot(data, xml)
  if (result.bind) {
    await io.save(data)
  }

  if (result.replyXml) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.status(200).send(result.replyXml)
    return
  }
  res.status(200).send('success')
}

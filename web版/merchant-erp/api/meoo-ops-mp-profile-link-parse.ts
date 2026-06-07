/**
 * POST /api/meoo-ops-mp-profile-link-parse — 达人资料：抖音主页链接结构化解析（无 LLM）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const body = JSON.parse(rawBody(req) || '{}') as { link?: string; platform?: string }
    const { runProfileLinkParseCore } = await import('../src/lib/profileLinkParseCore.js')
    const out = await runProfileLinkParseCore({
      link: String(body.link || ''),
      platform: body.platform,
    })
    if (!out.ok) {
      sendMerchantJson(res, 422, { ok: false, error: 'profile_parse_failed', message: out.message })
      return
    }
    sendMerchantJson(res, 200, out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      ok: false,
      error: 'profile_parse_error',
      detail: msg.slice(0, 600),
    })
  }
}

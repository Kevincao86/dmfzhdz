/**
 * POST /api/meoo-site-selection — 选址参考（优先高德周边配套，百度兜底 + 打分 + 近7日热度）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { runSiteSelectionCore } from '../vite-plugins/siteSelectionCore.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
    const out = await runSiteSelectionCore(rawBody(req), auth, process.env as Record<string, string>)
    sendMerchantJson(res, out.status, out.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}

/**
 * GET /api/meoo-merchant-dashboard-summary — 等价于 /api/merchant/{douyin|meituan|xhs}/dashboard/summary
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  runMerchantApiGatewayFromPath,
} from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')

  const platform = String(req.query.platform ?? 'douyin').trim()
  if (platform !== 'douyin' && platform !== 'meituan' && platform !== 'xhs') {
    res.status(400).json({ ok: false, message: 'platform 须为 douyin | meituan | xhs' })
    return
  }

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  const qs = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!qs.has('range')) qs.set('range', 'realtime')
  await runMerchantApiGatewayFromPath(
    req,
    res,
    `/api/merchant/${platform}/dashboard/summary?${qs.toString()}`,
  )
}

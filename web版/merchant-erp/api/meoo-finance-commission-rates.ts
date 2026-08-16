/**
 * GET /api/meoo-finance-commission-rates — 等价于 GET /api/merchant/finance/commission-rates
 * 各平台账单接口实算行业佣金率（报税用）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  runMerchantApiGatewayFromPath,
} from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Meoo-Douyin-Token, X-Meoo-Meituan-Token, X-Meoo-Xhs-Token, X-Meoo-Eleme-Token, X-Meoo-Meituan-Waimai-Token, X-Meoo-Jd-Waimai-Token',
  )
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.status(204).end()
    return
  }
  if (handleMerchantApiOptions(req, res)) return

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/finance/commission-rates${search}`)
}

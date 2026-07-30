/**
 * POST /api/meoo-douyin-poi-decorate — 等价于
 * POST /api/merchant/douyin/store-decoration/decorate
 * （抖音门店装修 / 五连图头图，官方 poi/decorate）
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

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  await runMerchantApiGatewayFromPath(
    req,
    res,
    `/api/merchant/douyin/store-decoration/decorate${search}`,
  )
}

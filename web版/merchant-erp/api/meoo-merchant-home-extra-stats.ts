/**
 * GET /api/meoo-merchant-home-extra-stats — 等价于 /api/merchant/home/extra-stats
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
  await runMerchantApiGatewayFromPath(req, res, '/api/merchant/home/extra-stats')
}

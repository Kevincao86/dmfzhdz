/**
 * POST /api/meoo-merchant-ai-video-concat-urls — 等价于 POST /api/merchant/ai/video/concat-urls
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  runMerchantApiGatewayFromPath,
} from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await runMerchantApiGatewayFromPath(req, res, '/api/merchant/ai/video/concat-urls')
}

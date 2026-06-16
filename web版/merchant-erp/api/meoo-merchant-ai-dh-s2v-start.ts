/**
 * POST /api/meoo-merchant-ai-dh-s2v-start — 数字人口播 wan2.2-s2v（仅千问，禁止方舟）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  runMerchantApiGatewayFromPath,
} from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await runMerchantApiGatewayFromPath(req, res, '/api/merchant/ai/video/dh-s2v/start')
}

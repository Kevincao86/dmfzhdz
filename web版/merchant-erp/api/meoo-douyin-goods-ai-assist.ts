/**
 * POST /api/meoo-douyin-goods-ai-assist — 等价于 POST /api/merchant/douyin/goods/ai/assist
 * （AI 智能优化 / 说明 / 生图 / 质检等，避免深层 merchant 路径在生产环境 404）
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
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/douyin/goods/ai/assist${search}`)
}

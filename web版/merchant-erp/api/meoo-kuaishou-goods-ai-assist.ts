/**
 * POST /api/meoo-kuaishou-goods-ai-assist — 等价于 POST /api/merchant/kuaishou/goods/ai/assist
 * （AI 智能优化 / 说明 / 生图 / 质检等，避免深层 merchant 路径在生产环境 404）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  runMerchantApiGatewayFromPath,
} from './merchant/merchantGatewayShared.js'

/** 通义万相等异步生图 + 冷启动可能超过 60s；与前端 fetch 超时对齐，降低首点辅助图 504 */
export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/kuaishou/goods/ai/assist${search}`)
}

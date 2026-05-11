/**
 * GET /api/meoo-douyin-goods-category-get — 等价于 GET /api/merchant/douyin/goods/category/get
 * 与 meoo-douyin-stores 同理：生产上深层 /api/merchant/* 易 404/HTML，顶层与 ping 同级更稳。
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
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/douyin/goods/category/get${search}`)
}

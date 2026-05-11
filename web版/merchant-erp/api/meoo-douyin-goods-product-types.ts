/**
 * GET /api/meoo-douyin-goods-product-types — 等价于 GET /api/merchant/douyin/goods/product-types
 * 与 meoo-douyin-goods-category-get 同理，减少深层 /api/merchant/* 在生产环境的 404。
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
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/douyin/goods/product-types${search}`)
}

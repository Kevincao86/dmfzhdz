/**
 * GET /api/meoo-merchant-ai-video-config — 与 GET /api/merchant/ai/video/config 等价。
 * 生产上部分环境对深层 /api/merchant/* 的 GET 会落到 SPA HTML，顶层路由与 /api/ping 同级更稳。
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
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/ai/video/config${search}`)
}

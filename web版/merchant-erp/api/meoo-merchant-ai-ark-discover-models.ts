/**
 * GET /api/meoo-merchant-ai-ark-discover-models — 等价于 GET /api/merchant/ai/ark/discover-models
 * 运营台经 /erp-api 调用：Nginx 把 /erp-api/FOO 接到 :3001/api/FOO，须用扁平顶层路由。
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
  await runMerchantApiGatewayFromPath(req, res, `/api/merchant/ai/ark/discover-models${search}`)
}

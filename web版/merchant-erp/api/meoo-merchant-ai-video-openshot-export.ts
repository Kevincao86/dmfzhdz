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
  const path =
    req.method === 'GET' && /export-download/i.test(urlStr)
      ? `/api/merchant/ai/video/openshot/export-download${search}`
      : `/api/merchant/ai/video/openshot/export${search}`
  await runMerchantApiGatewayFromPath(req, res, path)
}

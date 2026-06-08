/**
 * POST /api/meoo-merchant-ai-video-concat-urls
 * 多段 URL 拼接：直连 Buffer 写回，勿经 node-mocks-http。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoConcatUrlsDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoConcatUrlsDirect(req, res)
}

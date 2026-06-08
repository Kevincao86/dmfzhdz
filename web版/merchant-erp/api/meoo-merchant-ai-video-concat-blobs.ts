/**
 * POST /api/meoo-merchant-ai-video-concat-blobs
 * 多段 base64 拼接：直连 Buffer 写回，勿经 node-mocks-http。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoConcatBlobsDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoConcatBlobsDirect(req, res)
}

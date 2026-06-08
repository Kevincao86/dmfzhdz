/**
 * POST /api/meoo-merchant-ai-video-download-url
 * 成片下载：直连 Buffer 写回，勿经 node-mocks-http（否则 MP4 易变 0 字节）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoDownloadUrlDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoDownloadUrlDirect(req, res)
}

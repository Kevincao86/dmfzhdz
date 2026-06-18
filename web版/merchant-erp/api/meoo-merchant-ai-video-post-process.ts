/**
 * POST /api/meoo-merchant-ai-video-post-process
 * 成片后处理：SRT 字幕烧录 + 可选产品图叠加（base64 JSON → MP4 二进制）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoPostProcessDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoPostProcessDirect(req, res)
}

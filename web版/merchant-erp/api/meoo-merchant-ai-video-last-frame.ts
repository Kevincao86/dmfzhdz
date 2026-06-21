/**
 * POST /api/meoo-merchant-ai-video-last-frame
 * 长视频分段衔接：服务端 ffmpeg 截取远程成片尾帧（JPEG base64）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoLastFrameDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoLastFrameDirect(req, res)
}

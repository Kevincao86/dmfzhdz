/**
 * POST /api/meoo-merchant-ai-video-mux-audio
 * 将 TTS 口播 MP3 混入无声视频 MP4（base64 JSON）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { handleVideoMuxAudioDirect } from './merchant/videoBinaryApiDirect.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  await handleVideoMuxAudioDirect(req, res)
}

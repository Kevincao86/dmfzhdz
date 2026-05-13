/**
 * POST /api/meoo-ai-chat — 多模型 AI 统一网关（密钥仅服务端；前端只调本路径）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { runMeooAiChatCore } from '../vite-plugins/aiGateway/meooAiChatCore.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const bodyRaw = rawBody(req)
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
    const out = await runMeooAiChatCore(bodyRaw, auth, process.env as Record<string, string>)
    try {
      JSON.stringify(out.body)
    } catch (ser) {
      const m = ser instanceof Error ? ser.message : String(ser)
      console.error('[meoo-ai-chat] response body not JSON-serializable', m)
      sendMerchantJson(res, 500, {
        ok: false,
        error: 'internal_error',
        detail: `响应序列化失败：${m.slice(0, 400)}`,
      })
      return
    }
    sendMerchantJson(res, out.status, out.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-chat] fatal', msg)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}

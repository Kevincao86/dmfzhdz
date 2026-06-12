/**
 * POST /api/meoo-ops-mp-form-relay-source-parse — 转发工具原表链接抓取解析
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const body = JSON.parse(rawBody(req) || '{}') as { url?: string; platform?: string }
    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const env = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )
    const { runFormRelaySourceParseCore } = await import('../src/lib/formRelaySourceParseCore.js')
    const out = await runFormRelaySourceParseCore({
      url: String(body.url || ''),
      platform: body.platform,
      env,
    })
    if (!out.ok) {
      sendMerchantJson(res, 422, { ok: false, error: 'form_relay_parse_failed', message: out.message })
      return
    }
    sendMerchantJson(res, 200, out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      ok: false,
      error: 'form_relay_parse_error',
      detail: msg.slice(0, 600),
    })
  }
}

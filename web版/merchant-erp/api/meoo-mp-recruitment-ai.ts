/**
 * POST /api/meoo-mp-recruitment-ai — 达人招募小程序：商单 AI 标签 / 达人匹配 / 探店排期（豆包·通义千问）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'
import { sessionTokenFromHeaders, resolveMpAccountScopeFromSessionToken } from '../vite-plugins/aiTokenUsageCore.js'

export const config = { maxDuration: 90 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const env = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )
    const token = sessionTokenFromHeaders(req.headers as Record<string, string | string[] | undefined>)
    const bodyPeek = JSON.parse(rawBody(req) || '{}') as { mode?: string }
    const mode = String(bodyPeek.mode || 'tag').trim()
    const callerScope = token ? await resolveMpAccountScopeFromSessionToken(token) : null
    const usageRecord = { env, token, scope: callerScope, skipBilling: mode === 'tag' }
    const out =
      mode === 'tag'
        ? await (
            await import('../vite-plugins/mpRecruitmentHallAiTagPersist.js')
          ).runTagModeWithPersist(rawBody(req), env, usageRecord)
        : await (await import('../vite-plugins/mpRecruitmentAiCore.js')).runMpRecruitmentAiCore(
            rawBody(req),
            env,
            usageRecord,
          )
    sendMerchantJson(res, out.status, out.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      ok: false,
      error: 'meoo_mp_recruitment_ai_failed',
      detail: msg.slice(0, 600),
    })
  }
}

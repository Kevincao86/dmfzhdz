/**
 * POST /api/meoo-mp-pr-cash-wallet — 达人小程序与星选钱包：查看 PR 现金红包、发起提现。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import { walletViewForPr } from '../src/lib/marketingCampaignCore.js'
import { readMarketingCenter, withdrawPrCashWallet } from '../src/lib/marketingCampaignStore.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
  res.status(status).send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function sessionToken(req: VercelRequest): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {})
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }
    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }
    const rest = createMpAuthRest(supabaseUrl, serviceRole)
    const session = await resolveSession(rest, sessionToken(req))
    if (!session?.account) {
      sendJson(res, 401, { ok: false, error: 'login_required', message: '请先登录' })
      return
    }
    const prKey = String(session.account.lingqi_pr_id || session.account.registry_pr_id || '').trim()
    const displayName = String(session.account.wx_nick_name || session.account.login_name || '').trim()
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    if (String(body.action || 'summary') === 'withdraw') {
      if (!prKey) {
        sendJson(res, 400, { ok: false, error: 'not_pr', message: '请使用 PR 账号领取招募红包' })
        return
      }
      const result = await withdrawPrCashWallet(prKey, displayName)
      if (!result.ok) {
        sendJson(res, 400, { ok: false, error: result.error, message: result.message })
        return
      }
      const center = await readMarketingCenter()
      sendJson(res, 200, { ok: true, message: '提现已提交，等待运营打款', ...walletViewForPr(center, prKey) })
      return
    }
    const center = await readMarketingCenter()
    sendJson(res, 200, { ok: true, ...walletViewForPr(center, prKey) })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { ok: false, error: 'pr_cash_wallet_failed', message: '钱包加载失败', detail: msg.slice(0, 400) })
  }
}

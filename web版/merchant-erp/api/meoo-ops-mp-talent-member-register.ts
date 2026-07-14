/**
 * POST /api/meoo-ops-mp-talent-member-register — 达人招募小程序注册灵祺达人会员。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryMpTalentMember } from '../src/lib/opsRegistryTypes.js'
import { createMpAuthRest, registerMpTalentMember, resolveSession } from '../src/lib/mpAccountAuth.js'
import { persistBindDistributionAttribution } from '../src/lib/distributionAttributionPersist.js'
import type { DistributionAttributionSubjectType } from '../src/lib/distributionRegistryTypes.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
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
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    let body: { member?: RegistryMpTalentMember; refCode?: string }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { member?: RegistryMpTalentMember; refCode?: string }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    let member = body.member
    if (!member || !member.memberType || !String(member.wxNickName || '').trim()) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_member' })
      return
    }
    const supplierWork = member.workIdentity === 'shoot' || member.workIdentity === 'edit'
    const rest = createMpAuthRest(supabaseUrl, serviceRole)
    const token = sessionToken(req)
    const session = token ? await resolveSession(rest, token) : null
    const account = session?.account ?? null
    if (!account) {
      sendOpsJson(res, 401, { ok: false, error: 'login_required' })
      return
    }

    let contact = String(member.contact || '').trim()
    let wechatId = String(member.wechatId || '').trim()
    const openId = String(account.openid || member.wxOpenId || '').trim()
    if (!contact && supplierWork) contact = openId || String(member.wxNickName || '').trim()
    if (!wechatId && supplierWork) wechatId = contact || openId
    member = { ...member, contact, wechatId, wxOpenId: openId || member.wxOpenId }
    if (!contact || !wechatId) {
      sendOpsJson(res, 400, { ok: false, error: 'contact_required' })
      return
    }

    const saved = await registerMpTalentMember(supabaseUrl, serviceRole, member, account)
    const refCode = String(body.refCode || '').trim()
    if (refCode && saved.id) {
      let subjectType: DistributionAttributionSubjectType = 'xingxuan_talent'
      let subjectRegistryId = saved.id
      if (saved.workIdentity === 'shoot') {
        subjectType = 'xingxuan_shoot'
        subjectRegistryId = String(saved.lingqiShootTeamId || saved.id)
      } else if (saved.workIdentity === 'edit') {
        subjectType = 'xingxuan_edit'
        subjectRegistryId = String(saved.lingqiEditTeamId || saved.id)
      }
      void persistBindDistributionAttribution({
        refCode,
        subjectType,
        subjectRegistryId,
        landingSurface: 'mp',
        subjectLabel: String(saved.wxNickName || saved.contact || '').trim() || undefined,
      }).catch(() => {})
    }
    sendOpsJson(res, 200, {
      ok: true,
      id: saved.id,
      lingqiTalentId: saved.lingqiTalentId || null,
      lingqiShootTeamId: saved.lingqiShootTeamId || null,
      lingqiEditTeamId: saved.lingqiEditTeamId || null,
      workIdentity: saved.workIdentity || null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_talent_member_register_failed',
      detail: msg.slice(0, 800),
    })
  }
}

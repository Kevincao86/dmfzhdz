/**
 * POST/GET /api/meoo-ops-mp-auth — 达人/PR 统一登录（微信 code、账号密码、扫码票据）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyGetErpApi, proxyPostErpApi } from '../src/lib/mpErpApiProxy.js'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { loadMpHallRegistryPayload } from '../src/lib/mpHallRegistryCore.js'
import {
  accountToClientPayload,
  accountPayloadWithMemberExtras,
  createMpAuthRest,
  mpAuthPasswordLogin,
  mpAuthPhoneRegister,
  mpAuthScanConfirmDev,
  mpAuthScanCreate,
  mpAuthScanPoll,
  mpAuthSetLoginCredentials,
  mpAuthEnsureIdentity,
  mpAuthSwitchRole,
  mpAuthUpdateWxProfile,
  mpAuthWxLogin,
  resolveSession,
} from '../src/lib/mpAccountAuth.js'
import { mpAuthGetClientState, mpAuthSyncClientState } from '../src/lib/mpAccountClientState.js'
import { mpAuthGetRegistryProfile } from '../src/lib/mpRegistryProfileGet.js'
import type { RegistryMpTalentMember } from '../src/lib/opsRegistryTypes.js'
import { reconcileAccountPrFromRegistry } from '../src/lib/mpAccountAuth.js'
import { generateRecruitmentApplyShortLink } from '../src/lib/mpRecruitmentApplyShortLink.js'

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
}

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  sendCors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
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

function sessionToken(req: VercelRequest, body: Record<string, unknown>): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const q = req.query?.sessionToken ?? req.query?.token
  const fromQuery = Array.isArray(q) ? String(q[0] || '') : String(q || '')
  return String(body.sessionToken || body.token || fromQuery || '').trim()
}

/** 微信真机 Cronet 对根域 POST 易 reset；GET 查询参数与 POST body 等价 */
function pickAuthField(
  req: VercelRequest,
  body: Record<string, unknown>,
  key: string,
): string {
  const raw = req.query?.[key]
  const fromQuery = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '')
  return String(body[key] ?? fromQuery ?? '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  sendCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  /** Vercel（cs 域名）：服务端代转 ECS，规避微信 Cronet 对根域 POST reset */
  if (isVercelServerless()) {
    if (req.method === 'POST') {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
      } catch {
        sendJson(res, 400, { ok: false, error: 'invalid_json' })
        return
      }
      try {
        const { status, data } = await proxyPostErpApi('/api/meoo-ops-mp-auth', body)
        sendJson(res, status >= 200 && status < 600 ? status : 502, data)
        return
      } catch (e) {
        sendJson(res, 502, {
          ok: false,
          error: 'mp_auth_ecs_proxy_failed',
          detail: e instanceof Error ? e.message : String(e),
          hint: 'Vercel 配置 MEOO_ERP_API_HOST_IP=139.196.42.5；ECS 执行 bash scripts/ecs-fix-erp-api-502.sh',
        })
        return
      }
    }
    if (req.method === 'GET') {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(req.query || {})) {
        if (v == null) continue
        qs.set(k, Array.isArray(v) ? String(v[0]) : String(v))
      }
      const path = `/api/meoo-ops-mp-auth${qs.toString() ? `?${qs.toString()}` : ''}`
      try {
        const data = await proxyGetErpApi(path)
        sendJson(res, 200, data)
        return
      } catch (e) {
        sendJson(res, 502, {
          ok: false,
          error: 'mp_auth_ecs_proxy_failed',
          detail: e instanceof Error ? e.message : String(e),
        })
        return
      }
    }
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      missing: missingParts,
      hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
    })
    return
  }

  const queryAction = String(req.query?.action || '').trim()
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
  }
  const action = String(body.action || queryAction || '').trim()
  const rest = createMpAuthRest(supabaseUrl, serviceRole)

  try {
    if (action === 'wx_login') {
      const roleRaw = pickAuthField(req, body, 'role')
      const { token, account, isNew } = await mpAuthWxLogin(supabaseUrl, serviceRole, {
        code: pickAuthField(req, body, 'code'),
        stableDevOpenId: pickAuthField(req, body, 'stableDevOpenId'),
        role: roleRaw === 'pr' ? 'pr' : 'talent',
        wxNickName: pickAuthField(req, body, 'wxNickName'),
        wxAvatarUrl: pickAuthField(req, body, 'wxAvatarUrl'),
        registerTalent: body.registerTalent as never,
        registerPr: body.registerPr as never,
      })
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, token, isNew, account: payload })
      return
    }

    if (action === 'password_login') {
      const { token, account } = await mpAuthPasswordLogin(
        supabaseUrl,
        serviceRole,
        String(body.loginName || ''),
        String(body.password || ''),
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, token, account: payload })
      return
    }

    if (action === 'register') {
      const roleRaw = pickAuthField(req, body, 'role')
      const { token, account, isNew } = await mpAuthPhoneRegister(supabaseUrl, serviceRole, {
        phone: String(body.phone || body.loginName || ''),
        smsCode: String(body.smsCode || ''),
        password: String(body.password || ''),
        role: roleRaw === 'pr' ? 'pr' : 'talent',
        wxNickName: pickAuthField(req, body, 'wxNickName'),
        wxAvatarUrl: pickAuthField(req, body, 'wxAvatarUrl'),
      })
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, token, isNew, account: payload })
      return
    }

    if (action === 'set_password' || action === 'set_login_credentials') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      await mpAuthSetLoginCredentials(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        String(body.loginName || ''),
        String(body.password || ''),
      )
      const refreshed = await resolveSession(rest, token)
      sendJson(res, 200, {
        ok: true,
        account: refreshed ? accountToClientPayload(refreshed.account) : accountToClientPayload(sess.account),
      })
      return
    }

    if (action === 'switch_role') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const roleRaw = pickAuthField(req, body, 'role')
      const account = await mpAuthSwitchRole(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        roleRaw === 'pr' ? 'pr' : 'talent',
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, account: payload })
      return
    }

    if (action === 'ensure_identity') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const roleRaw = pickAuthField(req, body, 'role')
      const workRaw = pickAuthField(req, body, 'workIdentity')
      const workIdentity =
        workRaw === 'shoot' || workRaw === 'edit' ? workRaw : workRaw === 'talent' ? 'talent' : undefined
      const account = await mpAuthEnsureIdentity(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        roleRaw === 'pr' ? 'pr' : 'talent',
        workIdentity,
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, account: payload })
      return
    }

    if (action === 'session') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, sess.account)
      sendJson(res, 200, { ok: true, account: payload })
      return
    }

    if (action === 'update_wx_profile') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await mpAuthUpdateWxProfile(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        pickAuthField(req, body, 'wxNickName'),
        pickAuthField(req, body, 'wxAvatarUrl'),
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, account: payload })
      return
    }

    if (action === 'scan_create') {
      const scan = await mpAuthScanCreate(supabaseUrl, serviceRole)
      sendJson(res, 200, { ok: true, ...scan })
      return
    }

    if (action === 'scan_poll') {
      const ticket = String(body.ticket || req.query?.ticket || '')
      const out = await mpAuthScanPoll(supabaseUrl, serviceRole, ticket)
      sendJson(res, 200, { ok: true, ...out })
      return
    }

    if (action === 'scan_confirm_dev') {
      if (process.env.MP_AUTH_DEV_MODE !== 'true') {
        sendJson(res, 403, { ok: false, error: 'dev_only' })
        return
      }
      const { token, account } = await mpAuthScanConfirmDev(
        supabaseUrl,
        serviceRole,
        String(body.ticket || ''),
        String(body.code || ''),
      )
      sendJson(res, 200, { ok: true, token, account: accountToClientPayload(account) })
      return
    }

    /** 招募大厅：与 wx_login 同走 POST，云函数代理更稳 */
    if (action === 'hall_registry') {
      const includeRaw = body.includeMpOrderIds
      const includeMpOrderIds = Array.isArray(includeRaw)
        ? includeRaw.map((id) => String(id).trim()).filter(Boolean).slice(0, 120)
        : []
      const hallToken = sessionToken(req, body)
      let hallSess: Awaited<ReturnType<typeof resolveSession>> | null = null
      if (hallToken) {
        hallSess = await resolveSession(rest, hallToken)
      }
      let prOwnerKeys:
        | { lingqiPrId?: string; registryPrId?: string; prParticipantKey?: string }
        | undefined
      const needsPrOwnerKeys =
        body.includePrOwned === true ||
        (includeMpOrderIds.length > 0 && hallSess?.account?.active_role === 'pr')
      if (needsPrOwnerKeys) {
        if (!hallSess) {
          sendJson(res, 401, { ok: false, error: 'invalid_session' })
          return
        }
        const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, hallSess.account)
        prOwnerKeys = {
          lingqiPrId: String(
            account.lingqi_pr_id || body.lingqiPrId || '',
          ).trim(),
          registryPrId: String(
            account.registry_pr_id || body.registryPrId || '',
          ).trim(),
          prParticipantKey: String(body.prParticipantKey || '').trim(),
        }
        try {
          const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, account)
          const prDraft =
            profile.prProfile && typeof profile.prProfile === 'object'
              ? (profile.prProfile as Record<string, unknown>)
              : null
          const phone = String(prDraft?.contactPhone || '').trim()
          if (phone) {
            prOwnerKeys.prParticipantKey = `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
          }
          const profileLq = String(prDraft?.lingqiPrId || '').trim()
          const profileReg = String(prDraft?.id || '').trim()
          if (profileLq) prOwnerKeys.lingqiPrId = profileLq
          if (profileReg) prOwnerKeys.registryPrId = profileReg
        } catch {
          /* profile optional */
        }
      }
      let talentMember = null
      let talentAccount:
        | { lingqi_talent_id?: string | null; registry_member_id?: string | null; openid?: string | null }
        | undefined
      if (hallSess) {
        try {
          const hallAccount = hallSess.account
          const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, hallAccount)
          talentMember =
            profile.talentMember && typeof profile.talentMember === 'object'
              ? (profile.talentMember as RegistryMpTalentMember)
              : null
          talentAccount = {
            lingqi_talent_id: hallAccount.lingqi_talent_id,
            registry_member_id: hallAccount.registry_member_id,
            openid: hallAccount.openid,
          }
        } catch {
          /* inbox slice optional */
        }
      }
      const includeRecommendPool = body.includeRecommendPool === true
      const payload = await loadMpHallRegistryPayload({
        includeMpOrderIds,
        prOwnerKeys,
        talentMember,
        talentAccount,
        includeRecommendPool,
      })
      sendJson(res, 200, { ok: true, ...payload })
      return
    }

    if (action === 'registry_profile_get') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, ...profile })
      return
    }

    if (action === 'mp_apply_shortlink_get') {
      const mpOrderId = String(body.mpOrderId || body.orderId || pickAuthField(req, body, 'mpOrderId') || '').trim()
      const title = String(body.title || pickAuthField(req, body, 'title') || '').trim()
      if (!mpOrderId) {
        sendJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      try {
        const out = await generateRecruitmentApplyShortLink(mpOrderId, title || undefined)
        sendJson(res, 200, { ok: true, mpOrderId, ...out })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const status = msg === 'wx_not_configured' ? 503 : 500
        sendJson(res, status, { ok: false, error: msg })
      }
      return
    }

    if (action === 'client_state_get' || action === 'client_state_sync') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      if (action === 'client_state_get') {
        const state = await mpAuthGetClientState(supabaseUrl, serviceRole, sess.account.id)
        sendJson(res, 200, { ok: true, state })
        return
      }
      const { state, updatedAt } = await mpAuthSyncClientState(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        body.state,
      )
      sendJson(res, 200, { ok: true, state, updatedAt })
      return
    }

    sendJson(res, 400, {
      ok: false,
      error: 'unknown_action',
      actions: [
        'wx_login',
        'password_login',
        'register',
        'set_password',
        'switch_role',
        'ensure_identity',
        'session',
        'scan_create',
        'scan_poll',
        'scan_confirm_dev',
        'hall_registry',
        'client_state_get',
        'client_state_sync',
        'registry_profile_get',
        'mp_apply_shortlink_get',
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status =
      msg === 'invalid_credentials' ||
      msg === 'account_already_exists' ||
      msg === 'wx_already_registered' ||
      msg === 'login_name_taken' ||
      msg === 'sms_code_invalid' ||
      msg === 'invalid_phone' ||
      msg === 'invalid_sms_code' ||
      msg === 'invalid_password' ||
      /^invalid code/i.test(msg) ||
      /^wx_code2session_/i.test(msg) ||
      /duplicate key|23505/i.test(msg)
        ? 400
        : msg === 'wx_not_configured'
          ? 503
          : 500
    const zh: Record<string, string> = {
      sms_code_invalid: '验证码错误或已过期',
      invalid_sms_code: '请输入 6 位验证码',
      invalid_phone: '请输入有效大陆手机号',
      invalid_password: '密码至少 6 位',
      login_name_taken: '该手机号已被注册',
      invalid_credentials: '账号或密码错误',
      invalid_session: '登录已过期，请重新登录',
      account_not_found: '账号不存在',
      wx_not_configured: '微信登录未配置',
      wx_already_registered: '该微信已注册',
    }
    sendJson(res, status, {
      ok: false,
      error: msg,
      message: zh[msg] || (msg.includes('invalid') ? '请求参数无效' : '操作失败，请稍后重试'),
    })
  }
}

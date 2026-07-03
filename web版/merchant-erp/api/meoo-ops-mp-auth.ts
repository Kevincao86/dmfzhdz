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
import {
  loadMpHallRegistryPayload,
  loadTalentInboxForMpSession,
  resolvePublisherDisplayForMpOrder,
} from '../src/lib/mpHallRegistryCore.js'
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
  mpAuthBindWxOpenId,
  mpAuthWxLogin,
  mpAuthDyLogin,
  mpAuthBindPhoneLogin,
  mpAuthDyOAuthBegin,
  mpAuthDyOAuthComplete,
  resolveSession,
} from '../src/lib/mpAccountAuth.js'
import { mpAuthGetClientState, mpAuthSyncClientState } from '../src/lib/mpAccountClientState.js'
import { mpAuthGetRegistryProfile } from '../src/lib/mpRegistryProfileGet.js'
import { appendMembershipCheckoutFromSnapshot } from '../src/lib/mpMembershipCheckoutMutations.js'
import {
  createMembershipWechatPrepayFromSnapshot,
  pollMembershipWechatPayFromSnapshot,
} from '../src/lib/mpMembershipWechatPayMutations.js'
import {
  createMembershipAlipayPrepayFromSnapshot,
  pollMembershipAlipayPayFromSnapshot,
} from '../src/lib/mpMembershipAlipayPayMutations.js'
import {
  createMembershipDouyinPrepayFromSnapshot,
  launchMembershipDouyinPayFromSnapshot,
  pollMembershipDouyinPayFromSnapshot,
} from '../src/lib/mpMembershipDouyinPayMutations.js'
import {
  createPointsWechatPrepayFromSnapshot,
  pollPointsWechatPayFromSnapshot,
} from '../src/lib/mpPointsWechatPayMutations.js'
import {
  createPointsAlipayPrepayFromSnapshot,
  pollPointsAlipayPayFromSnapshot,
} from '../src/lib/mpPointsAlipayPayMutations.js'
import {
  createPointsDouyinPrepayFromSnapshot,
  pollPointsDouyinPayFromSnapshot,
} from '../src/lib/mpPointsDouyinPayMutations.js'
import { spendMpAiPointsForSessionToken, assertMpAiPointsAffordableForSessionToken } from '../src/lib/mpAiPointsSpendSession.js'
import {
  listMpBriefGenRecordsForSessionToken,
  saveMpBriefGenRecordForSessionToken,
} from '../src/lib/mpBriefGenRecordsSession.js'
import { mpPointsSpendHttpStatus } from '../src/lib/mpComplianceApiAuth.js'
import { parseMpPointsUsageKind } from '../src/lib/mpPointsEconomics.js'
import { loadWechatPayConfig } from '../src/lib/wechatPayV3.js'
import { loadAlipayPayConfig } from '../src/lib/alipayPay.js'
import { listMyPaymentOrdersFromSnapshot } from '../src/lib/mpMyPaymentOrdersGet.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import type { RegistryMpTalentMember } from '../src/lib/opsRegistryTypes.js'
import { reconcileAccountPrFromRegistry } from '../src/lib/mpAccountAuth.js'
import { generateRecruitmentApplyShortLink } from '../src/lib/mpRecruitmentApplyShortLink.js'
import { generateRecruitmentApplyWxacodeDataUrl } from '../src/lib/mpRecruitmentWxacode.js'

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

    if (action === 'dy_login') {
      const roleRaw = pickAuthField(req, body, 'role')
      const { token, account, isNew } = await mpAuthDyLogin(supabaseUrl, serviceRole, {
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

    if (action === 'bind_phone_login') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const platformRaw = pickAuthField(req, body, 'platform')
      const platform = platformRaw === 'dy' ? 'dy' : 'wx'
      const { token: nextToken, account } = await mpAuthBindPhoneLogin(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        String(body.phone || ''),
        platform,
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, { ok: true, token: nextToken, account: payload })
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

    if (action === 'bind_wx_openid') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const code = String(body.code || '').trim()
      if (!code) {
        sendJson(res, 400, { ok: false, error: 'missing_code' })
        return
      }
      const account = await mpAuthBindWxOpenId(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        code,
        String(body.stableDevOpenId || '').trim() || undefined,
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

    if (action === 'dy_oauth_begin') {
      const workIdentity = pickAuthField(req, body, 'workIdentity') || 'talent'
      const portalRaw = pickAuthField(req, body, 'portal') || 'xingxuan'
      const portal =
        portalRaw === 'merchant' || portalRaw === 'partner' ? portalRaw : ('xingxuan' as const)
      const redirectUri = pickAuthField(req, body, 'redirectUri')
      const out = await mpAuthDyOAuthBegin(supabaseUrl, serviceRole, workIdentity, {
        portal,
        redirectUri,
      })
      sendJson(res, 200, { ok: true, ...out })
      return
    }

    if (action === 'dy_oauth_complete') {
      const code = pickAuthField(req, body, 'code')
      const state = pickAuthField(req, body, 'state')
      if (!code || !state) {
        sendJson(res, 400, { ok: false, error: 'missing_code_or_state' })
        return
      }
      const { token, account, workIdentity, isNew, portal, erpSession } = await mpAuthDyOAuthComplete(
        supabaseUrl,
        serviceRole,
        code,
        state,
      )
      const payload = await accountPayloadWithMemberExtras(supabaseUrl, serviceRole, account)
      sendJson(res, 200, {
        ok: true,
        token,
        isNew,
        workIdentity,
        portal,
        account: payload,
        access_token: erpSession?.access_token,
        refresh_token: erpSession?.refresh_token,
        loginName: erpSession?.loginName,
      })
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
        | {
            lingqi_talent_id?: string | null
            registry_member_id?: string | null
            openid?: string | null
            login_name?: string | null
          }
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
            login_name: hallAccount.login_name,
          }
        } catch {
          /* inbox slice optional */
        }
      }
      const includeRecommendPool = body.includeRecommendPool === true
      const includeAllPrOwned = body.includePrOwned === true
      const payload = await loadMpHallRegistryPayload({
        includeMpOrderIds,
        prOwnerKeys,
        talentMember,
        talentAccount,
        includeRecommendPool,
        includeAllPrOwned,
        prOwnedList: includeAllPrOwned && includeMpOrderIds.length === 0,
        slimPrListApplicants: includeAllPrOwned && includeMpOrderIds.length === 0,
      })
      sendJson(res, 200, { ok: true, ...payload })
      return
    }

    /** 分享海报：实时读取 PR 用户库发单方名称（不走发布快照） */
    if (action === 'publisher_display_for_order') {
      const mpOrderId = String(body.mpOrderId || body.orderId || '').trim()
      if (!mpOrderId) {
        sendJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const result = await resolvePublisherDisplayForMpOrder(
        mpOrderId,
        supabaseUrl,
        serviceRole,
      )
      sendJson(res, 200, {
        ok: result.ok,
        mpOrderId: result.mpOrderId,
        displayName: result.displayName,
        prUser: result.prUser,
      })
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

    if (action === 'membership_plan_checkout') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = appendMembershipCheckoutFromSnapshot(data, account, body as Record<string, unknown>)
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.request.id,
        message:
          '支付申报已提交，请等待运营在管控台核对确认；确认后将自动开通对应会员版本，约 20 秒内与电脑端同步。',
      })
      return
    }

    if (action === 'membership_wechat_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      let account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const prepayBody = { ...(body as Record<string, unknown>) }
      const openidHint = String(prepayBody.openid || account.openid || '').trim()
      if (!openidHint && String(prepayBody.code || '').trim()) {
        account = await mpAuthBindWxOpenId(
          supabaseUrl,
          serviceRole,
          account.id,
          String(prepayBody.code).trim(),
          String(prepayBody.stableDevOpenId || '').trim() || undefined,
        )
        if (account.openid) prepayBody.openid = account.openid
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await createMembershipWechatPrepayFromSnapshot(data, account, prepayBody)
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        codeUrl: result.codeUrl,
        jsapiParams: result.jsapiParams,
      })
      return
    }

    if (action === 'membership_wechat_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const cfgResult = loadWechatPayConfig()
      if (!cfgResult.ok) {
        sendJson(res, 503, { ok: false, error: cfgResult.error, missing: cfgResult.missing })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollMembershipWechatPayFromSnapshot(data, outTradeNo, cfgResult.config)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        message:
          result.status === 'paid'
            ? '支付成功，会员档位已开通，约 20 秒内与电脑端同步。'
            : '等待支付完成…',
      })
      return
    }

    if (action === 'membership_alipay_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await createMembershipAlipayPrepayFromSnapshot(
        data,
        account,
        body as Record<string, unknown>,
      )
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        qrCode: result.qrCode,
        payPageUrl: result.payPageUrl,
        codeUrl: result.qrCode || result.payPageUrl,
      })
      return
    }

    if (action === 'membership_alipay_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const cfgResult = loadAlipayPayConfig()
      if (!cfgResult.ok) {
        sendJson(res, 503, { ok: false, error: cfgResult.error, missing: cfgResult.missing })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollMembershipAlipayPayFromSnapshot(data, outTradeNo, cfgResult.config)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        message:
          result.status === 'paid'
            ? '支付成功，会员档位已开通，约 20 秒内与电脑端同步。'
            : '等待支付完成…',
      })
      return
    }

    if (action === 'membership_douyin_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await createMembershipDouyinPrepayFromSnapshot(
        data,
        account,
        body as Record<string, unknown>,
      )
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        data: result.data,
        byteAuthorization: result.byteAuthorization,
        qrCode: result.qrCode,
        codeUrl: result.qrCode,
      })
      return
    }

    if (action === 'membership_douyin_launch') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = launchMembershipDouyinPayFromSnapshot(data, outTradeNo)
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        data: result.data,
        byteAuthorization: result.byteAuthorization,
      })
      return
    }

    if (action === 'membership_douyin_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollMembershipDouyinPayFromSnapshot(data, outTradeNo)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        message:
          result.status === 'paid'
            ? '支付成功，会员档位已开通，约 20 秒内与电脑端同步。'
            : '等待支付完成…',
      })
      return
    }

    if (action === 'points_wechat_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      let account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const prepayBody = { ...(body as Record<string, unknown>) }
      const openidHint = String(prepayBody.openid || account.openid || '').trim()
      if (!openidHint && String(prepayBody.code || '').trim()) {
        account = await mpAuthBindWxOpenId(
          supabaseUrl,
          serviceRole,
          account.id,
          String(prepayBody.code).trim(),
          String(prepayBody.stableDevOpenId || '').trim() || undefined,
        )
        if (account.openid) prepayBody.openid = account.openid
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await createPointsWechatPrepayFromSnapshot(data, account, prepayBody)
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        points: result.points,
        amountCents: result.amountCents,
        codeUrl: result.codeUrl,
        jsapiParams: result.jsapiParams,
      })
      return
    }

    if (action === 'points_wechat_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const cfgResult = loadWechatPayConfig()
      if (!cfgResult.ok) {
        sendJson(res, 503, { ok: false, error: cfgResult.error, missing: cfgResult.missing })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollPointsWechatPayFromSnapshot(data, outTradeNo, cfgResult.config)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        newBalance: result.newBalance,
        message:
          result.status === 'paid'
            ? `支付成功，${result.newBalance != null ? `当前积分 ${result.newBalance.toLocaleString('zh-CN')}` : '积分已到账'}，约 20 秒内与电脑端同步。`
            : '等待支付完成…',
      })
      return
    }

    if (action === 'points_alipay_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await createPointsAlipayPrepayFromSnapshot(
        data,
        account,
        body as Record<string, unknown>,
      )
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        points: result.points,
        amountCents: result.amountCents,
        qrCode: result.qrCode,
        payPageUrl: result.payPageUrl,
        codeUrl: result.qrCode || result.payPageUrl,
      })
      return
    }

    if (action === 'points_alipay_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const cfgResult = loadAlipayPayConfig()
      if (!cfgResult.ok) {
        sendJson(res, 503, { ok: false, error: cfgResult.error, missing: cfgResult.missing })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollPointsAlipayPayFromSnapshot(data, outTradeNo, cfgResult.config)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        newBalance: result.newBalance,
        message:
          result.status === 'paid'
            ? `支付成功，${result.newBalance != null ? `当前积分 ${result.newBalance.toLocaleString('zh-CN')}` : '积分已到账'}，约 20 秒内与电脑端同步。`
            : '等待支付完成…',
      })
      return
    }

    if (action === 'points_douyin_prepay') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const prepayBody = { ...(body as Record<string, unknown>), payMode: 'native' }
      const result = await createPointsDouyinPrepayFromSnapshot(data, account, prepayBody)
      if (!result.ok) {
        sendJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendJson(res, 200, {
        ok: true,
        requestId: result.requestId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        points: result.points,
        amountCents: result.amountCents,
        qrCode: result.qrCode,
        codeUrl: result.codeUrl,
      })
      return
    }

    if (action === 'points_douyin_poll') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const result = await pollPointsDouyinPayFromSnapshot(data, outTradeNo)
      if (!result.ok) {
        sendJson(res, 502, { ok: false, error: result.error })
        return
      }
      if (result.status === 'paid') {
        await io.save(data)
      }
      sendJson(res, 200, {
        ok: true,
        status: result.status,
        requestId: result.requestId,
        newBalance: result.newBalance,
        message:
          result.status === 'paid'
            ? `支付成功，${result.newBalance != null ? `当前积分 ${result.newBalance.toLocaleString('zh-CN')}` : '积分已到账'}，约 20 秒内与电脑端同步。`
            : '等待支付完成…',
      })
      return
    }

    if (action === 'mp_ai_points_afford') {
      const token = sessionToken(req, body)
      const kindRaw = String(body.kind || '').trim()
      const kind = parseMpPointsUsageKind(kindRaw)
      if (!kind) {
        sendJson(res, 400, { ok: false, error: 'invalid_kind' })
        return
      }
      const durationSec = body.durationSec != null ? Number(body.durationSec) : undefined
      const result = await assertMpAiPointsAffordableForSessionToken(supabaseUrl, serviceRole, token, kind, {
        durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
      })
      if (!result.ok) {
        sendJson(res, mpPointsSpendHttpStatus(result.error), {
          ok: false,
          error: result.error,
          message: result.message,
          required: result.required,
          balance: result.balance,
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        pointsRequired: result.pointsCharged,
        mpAiPointsBalance: result.newBalance,
      })
      return
    }

    if (action === 'mp_ai_points_spend') {
      const token = sessionToken(req, body)
      const kindRaw = String(body.kind || '').trim()
      const kind = parseMpPointsUsageKind(kindRaw)
      if (!kind) {
        sendJson(res, 400, { ok: false, error: 'invalid_kind' })
        return
      }
      const durationSec = body.durationSec != null ? Number(body.durationSec) : undefined
      const idempotencyKey = String(body.idempotencyKey || '').trim()
      const result = await spendMpAiPointsForSessionToken(supabaseUrl, serviceRole, token, {
        kind,
        durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
        idempotencyKey: idempotencyKey || undefined,
        note: String(body.note || '').trim() || undefined,
      })
      if (!result.ok) {
        sendJson(res, mpPointsSpendHttpStatus(result.error), {
          ok: false,
          error: result.error,
          message: result.message,
          required: result.required,
          balance: result.balance,
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        pointsCharged: result.pointsCharged,
        mpAiPointsBalance: result.newBalance,
        already: result.already === true,
      })
      return
    }

    if (action === 'mp_brief_gen_records_list') {
      const token = sessionToken(req, body)
      const result = await listMpBriefGenRecordsForSessionToken(supabaseUrl, serviceRole, token)
      if (!result.ok) {
        sendJson(res, 401, { ok: false, message: result.message })
        return
      }
      sendJson(res, 200, {
        ok: true,
        records: result.records,
        retentionDays: result.retentionDays,
      })
      return
    }

    if (action === 'mp_brief_gen_record_save') {
      const token = sessionToken(req, body)
      const result = await saveMpBriefGenRecordForSessionToken(supabaseUrl, serviceRole, token, {
        orderId: String(body.orderId || '').trim(),
        orderTitle: String(body.orderTitle || '').trim(),
        platform: String(body.platform || '').trim(),
        style: String(body.style || '').trim(),
        outputMode: String(body.outputMode || 'video_brief').trim(),
        resultJson: String(body.resultJson || ''),
        fullMarkdown: String(body.fullMarkdown || ''),
        idempotencyKey: String(body.idempotencyKey || '').trim() || undefined,
      })
      if (!result.ok) {
        sendJson(res, 400, { ok: false, message: result.message })
        return
      }
      sendJson(res, 200, {
        ok: true,
        record: result.record,
        already: result.already === true,
      })
      return
    }

    if (action === 'my_payment_orders_list') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      const orders = listMyPaymentOrdersFromSnapshot(data, account)
      sendJson(res, 200, { ok: true, ...orders })
      return
    }

    /** 达人消息页：专用 inbox 切片（大厅轻量拉单不含 ops 公告，与星选 full registry 对齐） */
    if (action === 'talent_inbox') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const hallAccount = sess.account
      let talentMember: RegistryMpTalentMember | null = null
      try {
        const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, hallAccount)
        talentMember =
          profile.talentMember && typeof profile.talentMember === 'object'
            ? (profile.talentMember as RegistryMpTalentMember)
            : null
      } catch {
        /* profile optional */
      }
      const mpTalentInbox = await loadTalentInboxForMpSession({
        talentMember,
        talentAccount: {
          lingqi_talent_id: hallAccount.lingqi_talent_id,
          registry_member_id: hallAccount.registry_member_id,
          openid: hallAccount.openid,
          login_name: hallAccount.login_name,
        },
      })
      sendJson(res, 200, { ok: true, mpTalentInbox })
      return
    }

    if (action === 'mp_apply_wxacode_get') {
      const mpOrderId = String(body.mpOrderId || body.orderId || pickAuthField(req, body, 'mpOrderId') || '').trim()
      if (!mpOrderId) {
        sendJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      try {
        const dataUrl = await generateRecruitmentApplyWxacodeDataUrl(mpOrderId)
        sendJson(res, 200, { ok: true, mpOrderId, dataUrl, source: 'wechat_wxacode' })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const status = msg === 'wx_not_configured' ? 503 : 500
        sendJson(res, status, { ok: false, error: msg })
      }
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
        'dy_login',
        'bind_phone_login',
        'password_login',
        'register',
        'set_password',
        'switch_role',
        'ensure_identity',
        'session',
        'scan_create',
        'scan_poll',
        'dy_oauth_begin',
        'dy_oauth_complete',
        'scan_confirm_dev',
        'hall_registry',
        'client_state_get',
        'client_state_sync',
        'registry_profile_get',
        'update_wx_profile',
        'bind_wx_openid',
        'membership_plan_checkout',
        'membership_wechat_prepay',
        'membership_wechat_poll',
        'membership_alipay_prepay',
        'membership_alipay_poll',
        'membership_douyin_prepay',
        'membership_douyin_launch',
        'membership_douyin_poll',
        'points_wechat_prepay',
        'points_wechat_poll',
        'points_alipay_prepay',
        'points_alipay_poll',
        'points_douyin_prepay',
        'points_douyin_poll',
        'mp_ai_points_afford',
        'mp_ai_points_spend',
        'mp_brief_gen_records_list',
        'mp_brief_gen_record_save',
        'my_payment_orders_list',
        'talent_inbox',
        'mp_apply_wxacode_get',
        'mp_apply_shortlink_get',
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status =
      msg.startsWith('mp_account_update_') ||
      msg.startsWith('mp_account_delete_') ||
      msg === 'invalid_credentials' ||
      msg === 'account_no_password' ||
      msg.startsWith('mp_accounts_query_failed') ||
      msg === 'account_already_exists' ||
      msg === 'wx_already_registered' ||
      msg === 'login_name_taken' ||
      msg === 'sms_code_invalid' ||
      msg === 'invalid_phone' ||
      msg === 'invalid_sms_code' ||
      msg === 'phone_bind_failed' ||
      msg === 'wx_openid_conflict' ||
      msg === 'dy_openid_conflict' ||
      msg === 'invalid_password' ||
      msg === 'wx_openid_already_bound' ||
      msg === 'missing_openid' ||
      msg === 'missing_code' ||
      /^invalid code/i.test(msg) ||
      /^wx_code2session_/i.test(msg) ||
      /^dy_code2session_/i.test(msg) ||
      /duplicate key|23505/i.test(msg)
        ? 400
        : msg === 'wx_not_configured' || msg === 'dy_not_configured'
          ? 503
          : msg === 'dy_web_not_configured'
            ? 503
            : 500
    const zh: Record<string, string> = {
      sms_code_invalid: '验证码错误或已过期',
      invalid_sms_code: '请输入 6 位验证码',
      invalid_phone: '请输入有效大陆手机号',
      invalid_password: '密码至少 6 位',
      login_name_taken: '该手机号已被注册',
      invalid_credentials: '账号或密码错误',
      account_no_password: '该账号未设置密码，请先用微信登录并在资料页设置密码',
      invalid_session: '登录已过期，请重新登录',
      account_not_found: '账号不存在',
      wx_not_configured: '微信登录未配置',
      dy_not_configured: '抖音登录未配置（请在轻量配置 MP_DOUYIN_SECRET）',
      dy_web_not_configured:
        '抖音网站扫码登录未配置（请在轻量配置 MP_DOUYIN_WEB_CLIENT_KEY / MP_DOUYIN_WEB_CLIENT_SECRET，并在抖音开放平台配置授权回调）',
      dy_oauth_state_invalid: '抖音授权状态无效，请返回登录页重试',
      dy_oauth_ticket_expired: '抖音扫码登录已过期，请重新发起',
      erp_dy_phone_not_bound: '该抖音账号未绑定手机号，请先在小程序完善资料或使用手机验证码登录',
      erp_dy_phone_not_registered: '该手机号尚未注册 ERP 账号，请先注册或使用账号密码登录',
      wx_already_registered: '该微信已注册',
      wx_openid_already_bound: '该微信已绑定其他账号，请用原账号登录',
      phone_bind_failed: '手机号绑定失败，请重试',
      wx_openid_conflict: '该微信已绑定其他手机号账号',
      dy_openid_conflict: '该抖音已绑定其他手机号账号',
      missing_openid: '缺少微信 openid，请重新登录后再试',
      unknown_action: '后台接口未更新，请稍后再试',
    }
    const message =
      zh[msg] ||
      (msg.startsWith('registry_patch_too_large')
        ? '注册表同步体积过大，请联系管理员在轻量执行 nginx 热修并部署最新 auth-api'
        : msg.includes('invalid')
          ? '请求参数无效'
          : '操作失败，请稍后重试')
    sendJson(res, status, {
      ok: false,
      error: msg,
      message,
    })
  }
}

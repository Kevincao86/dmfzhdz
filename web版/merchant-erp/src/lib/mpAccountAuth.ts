/**
 * 达人/PR 统一账号：一微信 openid 仅一条 mp_accounts；Web 与小程序共用会话 token。
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { RegistryMpPrUser, RegistryMpTalentMember } from './opsRegistryTypes.js'
import {
  allocateLingqiEditTeamId,
  allocateLingqiShootTeamId,
  allocateLingqiTalentId,
} from './lingqiIdentity.js'
import { dedupeMpTalentMembersByOpenId, upsertMpTalentMember } from './mpTalentMemberUpsert.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { resolvePrFeatureAccess, resolveMpFeatureAccess } from './prFeatureAccess.js'
import { memberHasResolvablePlatformInfo } from './mpTalentPlatformProfileResolve.js'
import { upsertSupplierTeamLibraryFromMember } from './supplierTeamLibrarySync.js'
import { upsertMpPrUser, dedupeMpPrUsersByOpenId } from './mpPrUserUpsert.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { normalizeMpLoginName, normalizeMpLoginPhone, isValidMpLoginPhone } from './mpPhoneAuth.js'
import { verifyAuthSmsCode } from '../../vite-plugins/authSmsAuthShared.js'
import {
  buildDouyinWebAuthorizeUrl,
  decodeDyOAuthState,
  douyinWebOpenIdStorageKey,
  encodeDyOAuthState,
  exchangeDouyinWebOAuthCode,
  isDouyinWebOAuthConfigured,
  pickDouyinWebRedirectUri,
  type DyOAuthPortal,
} from './douyinWebOAuth.js'
import {
  createAdminSessionForUserId,
  findAuthUserByPhone,
} from '../../vite-plugins/authSmsAuthShared.js'

export type MpAccountRole = 'talent' | 'pr'

const WX_PLACEHOLDER_NICKS = new Set(['', '微信用户', '用户', '灵祺用户'])

function mergeWxNick(incoming: string, existing?: string | null): string {
  const inc = String(incoming || '').trim()
  const ex = String(existing || '').trim()
  if (inc && !WX_PLACEHOLDER_NICKS.has(inc)) return inc
  if (ex && !WX_PLACEHOLDER_NICKS.has(ex)) return ex
  return inc || ex || '微信用户'
}

function mergeWxAvatar(incoming: string, existing?: string | null): string {
  const inc = String(incoming || '').trim()
  const ex = String(existing || '').trim()
  const usable = (u: string) => Boolean(u) && !u.startsWith('wxfile://')
  if (usable(inc)) return inc
  if (usable(ex)) return ex
  return inc || ex
}

export type MpAccountRow = {
  id: string
  openid: string | null
  dy_openid?: string | null
  login_name: string | null
  password_hash: string | null
  password_salt: string | null
  active_role: MpAccountRole
  lingqi_talent_id: string | null
  lingqi_pr_id: string | null
  registry_member_id: string | null
  registry_pr_id: string | null
  wx_nick_name: string | null
  wx_avatar_url: string | null
}

type SupabaseRest = {
  get: (path: string) => Promise<Response>
  post: (path: string, body: unknown) => Promise<Response>
  patch: (path: string, body: unknown) => Promise<Response>
  delete: (path: string) => Promise<Response>
}

const SESSION_DAYS = 14
const SCAN_TTL_SEC = 300

export function createMpAuthRest(supabaseUrl: string, serviceRole: string): SupabaseRest {
  return restClient(supabaseUrl, serviceRole)
}

function restClient(supabaseUrl: string, serviceRole: string): SupabaseRest {
  const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return {
    get: (path) => fetch(`${base}${path}`, { headers: { ...headers, Prefer: 'return=representation' } }),
    post: (path, body) =>
      fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    patch: (path, body) =>
      fetch(`${base}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
    delete: (path) => fetch(`${base}${path}`, { method: 'DELETE', headers }),
  }
}

/** 注册表 / 去重用的平台 openid（微信优先，否则抖音） */
export function mpAccountOAuthOpenId(account: MpAccountRow): string {
  return String(account.openid || account.dy_openid || '').trim()
}

export function mpAccountNeedsPhoneBind(account: MpAccountRow): boolean {
  return !isValidMpLoginPhone(String(account.login_name || ''))
}

function pepper(): string {
  return (
    process.env.MP_AUTH_PEPPER ||
    process.env.MERCHANT_AUTH_PEPPER ||
    'meoo-mp-auth-dev-pepper-change-in-prod'
  )
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(16).toString('hex')
  const hash = scryptSync(password + pepper(), s, 32).toString('hex')
  return { hash, salt: s }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const next = scryptSync(password + pepper(), salt, 32)
  const prev = Buffer.from(hash, 'hex')
  if (prev.length !== next.length) return false
  return timingSafeEqual(prev, next)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function newScanTicket(): string {
  return `scan_${randomBytes(16).toString('hex')}`
}

export async function wxCodeToOpenId(
  code: string,
  stableDevOpenId?: string,
): Promise<{ openid: string; session_key?: string }> {
  if (process.env.MP_AUTH_DEV_MODE === 'true') {
    const stable = String(stableDevOpenId || process.env.MP_DEV_FIXED_OPENID || '').trim()
    if (stable) {
      return { openid: stable.startsWith('dev_') ? stable : `dev_${stable}` }
    }
    if (code) {
      const openid = `dev_${createHash('sha256').update(code).digest('hex').slice(0, 28)}`
      return { openid }
    }
  }
  const appId = String(process.env.MP_WECHAT_APPID || process.env.WX_APPID || '').trim()
  const secret = String(process.env.MP_WECHAT_SECRET || process.env.WX_SECRET || '').trim()
  if (!appId || !secret) {
    throw new Error('wx_not_configured')
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const res = await fetch(url)
  const data = (await res.json()) as { openid?: string; session_key?: string; errcode?: number; errmsg?: string }
  if (!data.openid) {
    throw new Error(data.errmsg || `wx_code2session_${data.errcode ?? 'fail'}`)
  }
  return { openid: data.openid, session_key: data.session_key }
}

export async function dyCodeToOpenId(
  code: string,
  stableDevOpenId?: string,
): Promise<{ openid: string; session_key?: string }> {
  if (process.env.MP_AUTH_DEV_MODE === 'true') {
    const stable = String(stableDevOpenId || process.env.MP_DY_DEV_FIXED_OPENID || '').trim()
    if (stable) {
      return { openid: stable.startsWith('dydev_') ? stable : `dydev_${stable}` }
    }
    if (code) {
      const openid = `dydev_${createHash('sha256').update(code).digest('hex').slice(0, 28)}`
      return { openid }
    }
  }
  const appId = String(
    process.env.MP_DOUYIN_APPID || process.env.DOUYIN_APPID || 'tt9f05e9b8016199c301',
  ).trim()
  const secret = String(process.env.MP_DOUYIN_SECRET || process.env.DOUYIN_SECRET || '').trim()
  if (!appId || !secret) {
    throw new Error('dy_not_configured')
  }
  const res = await fetch('https://developer.toutiao.com/api/apps/v2/jscode2session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appid: appId,
      secret,
      code: String(code || '').trim(),
    }),
  })
  const data = (await res.json()) as {
    err_no?: number
    err_tips?: string
    data?: { openid?: string; session_key?: string }
  }
  const openid = data.data?.openid
  if (!openid) {
    throw new Error(data.err_tips || `dy_code2session_${data.err_no ?? 'fail'}`)
  }
  return { openid, session_key: data.data?.session_key }
}

async function findAccountByOpenId(rest: SupabaseRest, openid: string): Promise<MpAccountRow | null> {
  const q = `/mp_accounts?openid=eq.${encodeURIComponent(openid)}&limit=1`
  const res = await rest.get(q)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function findAccountByDyOpenId(rest: SupabaseRest, dyOpenid: string): Promise<MpAccountRow | null> {
  const q = `/mp_accounts?dy_openid=eq.${encodeURIComponent(dyOpenid)}&limit=1`
  const res = await rest.get(q)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

/** 历史抖音账号曾写入 openid 列，首次 dy_login 后迁移到 dy_openid */
async function findAccountForDyLogin(rest: SupabaseRest, dyOpenId: string): Promise<MpAccountRow | null> {
  let account = await findAccountByDyOpenId(rest, dyOpenId)
  if (account) return account
  account = await findAccountByOpenId(rest, dyOpenId)
  if (!account) return null
  if (!String(account.dy_openid || '').trim()) {
    await updateAccount(rest, account.id, { dy_openid: dyOpenId, openid: null })
    account = (await findAccountById(rest, account.id))!
  }
  return account
}

async function deleteAccountById(rest: SupabaseRest, id: string): Promise<void> {
  const res = await rest.delete(`/mp_accounts?id=eq.${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`mp_account_delete_${res.status}`)
}

async function findAccountByLoginName(rest: SupabaseRest, loginName: string): Promise<MpAccountRow | null> {
  const q = `/mp_accounts?login_name=eq.${encodeURIComponent(loginName)}&limit=1`
  const res = await rest.get(q)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`mp_accounts_query_failed:${res.status}:${t.slice(0, 120)}`)
  }
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function findAccountById(rest: SupabaseRest, id: string): Promise<MpAccountRow | null> {
  const res = await rest.get(`/mp_accounts?id=eq.${encodeURIComponent(id)}&limit=1`)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function insertAccount(rest: SupabaseRest, row: Record<string, unknown>): Promise<MpAccountRow> {
  const res = await rest.post('/mp_accounts', row)
  if (!res.ok) {
    const t = await res.text()
    if (/duplicate|unique/i.test(t)) throw new Error('account_already_exists')
    throw new Error(`mp_account_insert_${res.status}:${t.slice(0, 200)}`)
  }
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0]!
}

async function updateAccount(rest: SupabaseRest, id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await rest.patch(`/mp_accounts?id=eq.${encodeURIComponent(id)}`, {
    ...patch,
    updated_at: new Date().toISOString(),
  })
  if (!res.ok) throw new Error(`mp_account_update_${res.status}`)
}

async function createSession(rest: SupabaseRest, accountId: string): Promise<string> {
  const token = newSessionToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString()
  const res = await rest.post('/mp_auth_sessions', { token, account_id: accountId, expires_at: expires })
  if (!res.ok) throw new Error('session_create_failed')
  return token
}

export async function resolveSession(
  rest: SupabaseRest,
  token: string,
): Promise<{ account: MpAccountRow; token: string } | null> {
  const t = String(token || '').trim()
  if (!t) return null
  const res = await rest.get(
    `/mp_auth_sessions?token=eq.${encodeURIComponent(t)}&select=token,account_id,expires_at&limit=1`,
  )
  if (!res.ok) return null
  const rows = (await res.json()) as { token: string; account_id: string; expires_at: string }[]
  const row = rows[0]
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null
  const account = await findAccountById(rest, row.account_id)
  if (!account) return null
  return { account, token: t }
}

export function accountToClientPayload(
  account: MpAccountRow,
  extras?: {
    lingqiShootTeamId?: string | null
    lingqiEditTeamId?: string | null
    workIdentity?: string | null
    prFeatureAccess?: { addons: boolean; recommendHall: boolean }
  },
) {
  return {
    accountId: account.id,
    openid: account.openid,
    loginName: account.login_name,
    activeRole: account.active_role,
    lingqiTalentId: account.lingqi_talent_id,
    lingqiPrId: account.lingqi_pr_id,
    lingqiShootTeamId: extras?.lingqiShootTeamId ?? null,
    lingqiEditTeamId: extras?.lingqiEditTeamId ?? null,
    workIdentity: extras?.workIdentity ?? null,
    registryMemberId: account.registry_member_id,
    registryPrId: account.registry_pr_id,
    wxNickName: account.wx_nick_name,
    wxAvatarUrl: account.wx_avatar_url,
    hasPassword: Boolean(account.password_hash),
    needsPhoneBind: mpAccountNeedsPhoneBind(account),
    prFeatureAccess: extras?.prFeatureAccess,
  }
}

export async function accountPayloadWithMemberExtras(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
) {
  let acc = account
  if (account.active_role === 'pr' || account.lingqi_pr_id || account.login_name) {
    try {
      acc = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, account)
    } catch {
      /* registry optional */
    }
  }
  let extras: {
    lingqiShootTeamId?: string | null
    lingqiEditTeamId?: string | null
    workIdentity?: string | null
    prFeatureAccess?: { addons: boolean; recommendHall: boolean }
  } = {}
  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const memberId = String(acc.registry_member_id || '').trim()
    const phoneKey = accountPhoneKey(acc)
    const member =
      (data.mpTalentMembers ?? []).find((m) => m.id === memberId) ||
      (data.mpTalentMembers ?? []).find(
        (m) => {
          const oid = mpAccountOAuthOpenId(acc)
          return oid && String(m.wxOpenId || '').trim() === oid
        },
      ) ||
      (phoneKey.length >= 8
        ? (data.mpTalentMembers ?? []).find((m) => memberPhoneKey(m) === phoneKey)
        : undefined)
    if (member) {
      extras = {
        lingqiShootTeamId: member.lingqiShootTeamId || null,
        lingqiEditTeamId: member.lingqiEditTeamId || null,
        workIdentity: member.workIdentity || null,
      }
      if (acc.active_role !== 'pr') {
        extras.prFeatureAccess = resolveMpFeatureAccess(member)
      }
    }
    if (acc.active_role === 'pr' || acc.lingqi_pr_id || acc.registry_pr_id) {
      const pr = findRegistryPrForAccount(data, acc)
      extras.prFeatureAccess = resolvePrFeatureAccess(pr)
    }
  } catch {
    /* registry optional */
  }
  return accountToClientPayload(acc, extras)
}

function accountPhoneKey(account: MpAccountRow): string {
  return String(account.login_name || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function memberPhoneKey(m: RegistryMpTalentMember): string {
  return String(m.contact || m.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 微信/手机号登录：分配灵祺 ID 并在注册表占位 */
async function provisionRegistryForAccount(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
  role: MpAccountRole,
  wxNickName: string,
  wxAvatarUrl: string,
): Promise<MpAccountRow> {
  const rest = restClient(supabaseUrl, serviceRole)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const phone = accountPhoneKey(account)
  const loginLabel = String(account.login_name || '').trim()
  const nick = mergeWxNick(
    String(wxNickName || account.wx_nick_name || loginLabel || '').trim(),
    account.wx_nick_name,
  )
  const avatar = mergeWxAvatar(String(wxAvatarUrl || account.wx_avatar_url || '').trim(), account.wx_avatar_url)

  if (role === 'talent') {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const openId = mpAccountOAuthOpenId(account)
    const existing = findRegistryMemberForAccount(data, account)
    const base: RegistryMpTalentMember = existing
      ? { ...existing }
      : {
          id: account.registry_member_id || `MTM-${Date.now()}`,
          memberType: 'douyin',
          lingqiTalentId: account.lingqi_talent_id || '',
          wxNickName: '',
          wxAvatarUrl: '',
          contact: '',
          wechatId: '',
          registeredAt: now,
          updatedAt: now,
        }
    let lingqiTalentId = base.lingqiTalentId || account.lingqi_talent_id || ''
    if (!lingqiTalentId && memberHasResolvablePlatformInfo(base)) {
      lingqiTalentId = allocateLingqiTalentId(data, lingqiTalentId)
    }
    const saved = upsertMpTalentMember(data, {
      ...base,
      id: base.id,
      lingqiTalentId: lingqiTalentId || base.lingqiTalentId,
      wxNickName: mergeWxNick(nick, base.wxNickName),
      wxAvatarUrl: mergeWxAvatar(avatar, base.wxAvatarUrl),
      wxOpenId: openId || base.wxOpenId || '',
      contact: base.contact || loginLabel || phone,
      wechatId: base.wechatId || loginLabel || phone,
      updatedAt: now,
    })
    if (openId) dedupeMpTalentMembersByOpenId(data, openId, saved.id)
    await io.save(data)
    await updateAccount(rest, account.id, {
      lingqi_talent_id: saved.lingqiTalentId || account.lingqi_talent_id || base.lingqiTalentId,
      registry_member_id: saved.id,
      active_role: 'talent',
    })
    return (await findAccountById(rest, account.id))!
  }

  if (role === 'pr' && !account.lingqi_pr_id) {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const openId = mpAccountOAuthOpenId(account)
    let existingPr: RegistryMpPrUser | undefined = openId
      ? (data.mpPrUsers ?? []).find(
          (u) =>
            String(u.wxOpenId || '').trim() === openId ||
            String(u.platformAccount || '').trim() === openId,
        )
      : undefined
    if (!existingPr && phone.length >= 8) {
      existingPr = (data.mpPrUsers ?? []).find((u) => {
        const p = String(u.contactPhone || '')
          .replace(/\D/g, '')
          .slice(-11)
        return p === phone
      })
    }
    if (existingPr?.lingqiPrId) {
      await updateAccount(rest, account.id, {
        lingqi_pr_id: existingPr.lingqiPrId,
        registry_pr_id: existingPr.id,
        active_role: 'pr',
      })
      return (await findAccountById(rest, account.id))!
    }
    const saved = upsertMpPrUser(data, {
      id: account.registry_pr_id || `MPR-${Date.now()}`,
      lingqiPrId: '',
      accountType: 'personal',
      personalName: nick,
      contactName: nick,
      contactPhone: loginLabel || phone || undefined,
      wxOpenId: account.openid || '',
      wxNickName: nick,
      wxAvatarUrl: avatar,
      registeredAt: now,
      updatedAt: now,
    })
    if (openId) dedupeMpPrUsersByOpenId(data, openId, saved.id)
    await io.save(data)
    await updateAccount(rest, account.id, {
      lingqi_pr_id: saved.lingqiPrId,
      registry_pr_id: saved.id,
      active_role: 'pr',
    })
    return (await findAccountById(rest, account.id))!
  }

  if (role === 'pr' && account.lingqi_pr_id && account.registry_pr_id) {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const prId = String(account.registry_pr_id || '').trim()
    const prev = (data.mpPrUsers ?? []).find((u) => u && u.id === prId)
    if (prev) {
      const saved = upsertMpPrUser(data, {
        ...prev,
        wxNickName: mergeWxNick(nick, prev.wxNickName),
        wxAvatarUrl: mergeWxAvatar(avatar, prev.wxAvatarUrl),
        wxOpenId: String(account.openid || prev.wxOpenId || '').trim(),
        updatedAt: now,
      })
      const openId = String(account.openid || saved.wxOpenId || '').trim()
      if (openId) dedupeMpPrUsersByOpenId(data, openId, saved.id)
      await io.save(data)
      if (saved.wxNickName !== account.wx_nick_name || saved.wxAvatarUrl !== account.wx_avatar_url) {
        await updateAccount(rest, account.id, {
          wx_nick_name: saved.wxNickName || account.wx_nick_name,
          wx_avatar_url: saved.wxAvatarUrl || account.wx_avatar_url,
        })
        return (await findAccountById(rest, account.id))!
      }
    }
  }

  return account
}

function supplierTags(workIdentity: 'shoot' | 'edit'): string[] {
  return workIdentity === 'shoot'
    ? ['拍摄团队', '拍摄', '跟拍']
    : ['剪辑团队', '剪辑', '后期']
}

async function syncRegistryMember(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
  member: RegistryMpTalentMember,
): Promise<RegistryMpTalentMember> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  if (account.openid) {
    const dup = (data.mpTalentMembers ?? []).find(
      (m) => m.wxOpenId === account.openid && m.id !== account.registry_member_id,
    )
    if (dup) throw new Error('openid_talent_conflict')
  }
  const saved = upsertMpTalentMember(data, {
    ...member,
    wxOpenId: account.openid || member.wxOpenId,
    id: account.registry_member_id || member.id,
    lingqiTalentId: account.lingqi_talent_id || member.lingqiTalentId,
  })
  const openId = String(account.openid || saved.wxOpenId || '').trim()
  if (openId) dedupeMpTalentMembersByOpenId(data, openId, saved.id)
  await io.save(data)
  return saved
}

/** 小程序保存达人资料：绑定登录账号，复用同一 openid 的灵祺达人 ID */
export async function registerMpTalentMember(
  supabaseUrl: string,
  serviceRole: string,
  member: RegistryMpTalentMember,
  account: MpAccountRow | null,
): Promise<RegistryMpTalentMember> {
  const rest = restClient(supabaseUrl, serviceRole)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const prev = account ? findRegistryMemberForAccount(data, account) : null
  const openId = String(account?.openid || member.wxOpenId || '').trim()
  const payload: RegistryMpTalentMember = {
    ...member,
    wxOpenId: openId || member.wxOpenId,
    id:
      String(account?.registry_member_id || prev?.id || member.id || '').trim() ||
      `MTM-${Date.now()}`,
    lingqiTalentId: String(
      account?.lingqi_talent_id || prev?.lingqiTalentId || member.lingqiTalentId || '',
    ).trim(),
    lingqiShootTeamId: prev?.lingqiShootTeamId || member.lingqiShootTeamId,
    lingqiEditTeamId: prev?.lingqiEditTeamId || member.lingqiEditTeamId,
    registeredAt: prev?.registeredAt || member.registeredAt,
  }
  const saved = upsertMpTalentMember(data, payload)
  if (openId) dedupeMpTalentMembersByOpenId(data, openId, saved.id)
  await io.save(data)
  if (account) {
    await updateAccount(rest, account.id, {
      lingqi_talent_id: saved.lingqiTalentId || account.lingqi_talent_id,
      registry_member_id: saved.id,
      active_role: 'talent',
    })
  }
  return saved
}

/** 小程序保存 PR 资料：写入注册表并绑定 mp_accounts */
export async function registerMpPrUser(
  supabaseUrl: string,
  serviceRole: string,
  prUser: RegistryMpPrUser,
  account: MpAccountRow | null,
): Promise<RegistryMpPrUser> {
  if (!account) {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const saved = upsertMpPrUser(data, prUser)
    await io.save(data)
    return saved
  }
  const saved = await syncRegistryPr(supabaseUrl, serviceRole, account, {
    ...prUser,
    wxOpenId: account.openid || prUser.wxOpenId || '',
    contactPhone:
      String(prUser.contactPhone || account.login_name || '').trim() || prUser.contactPhone,
  })
  const rest = restClient(supabaseUrl, serviceRole)
  await updateAccount(rest, account.id, {
    lingqi_pr_id: saved.lingqiPrId,
    registry_pr_id: saved.id,
    active_role: 'pr',
  })
  return saved
}

/** 密码登录 / 拉会话时：按 openid、手机号修正账号上的 PR ID */
export async function reconcileAccountPrFromRegistry(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
): Promise<MpAccountRow> {
  const rest = restClient(supabaseUrl, serviceRole)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const pr = findRegistryPrForAccount(data, account)
  if (!pr) return account
  const openId = String(account.openid || '').trim()
  if (openId) {
    dedupeMpPrUsersByOpenId(data, openId, pr.id)
    await io.save(data)
  }
  const accLq = String(account.lingqi_pr_id || '').trim()
  const accReg = String(account.registry_pr_id || '').trim()
  if (accLq === String(pr.lingqiPrId || '').trim() && accReg === pr.id) return account
  await updateAccount(rest, account.id, {
    lingqi_pr_id: pr.lingqiPrId,
    registry_pr_id: pr.id,
    active_role: account.active_role === 'talent' ? account.active_role : 'pr',
  })
  return (await findAccountById(rest, account.id)) || account
}

function prUserPhoneKey(u: RegistryMpPrUser): string {
  return String(u.contactPhone || u.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 无微信绑定的旧账号占用了手机号时，释放 login_name 供当前微信账号绑定 */
async function reclaimStaleLoginNameHolder(
  rest: SupabaseRest,
  supabaseUrl: string,
  serviceRole: string,
  holder: MpAccountRow,
  loginPhone: string,
): Promise<boolean> {
  const phone = String(loginPhone || '')
    .replace(/\D/g, '')
    .slice(-11)
  if (phone.length < 11) return false
  if (String(holder.openid || '').trim()) return false
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const prByPhone = (data.mpPrUsers ?? []).find((u) => prUserPhoneKey(u) === phone)
  if (!prByPhone) return false
  const holderLq = String(holder.lingqi_pr_id || '').trim()
  const canonLq = String(prByPhone.lingqiPrId || '').trim()
  if (!holderLq || holderLq !== canonLq) {
    await updateAccount(rest, holder.id, {
      login_name: `released_${holder.id.replace(/-/g, '').slice(0, 12)}`,
    })
    return true
  }
  return false
}

async function syncRegistryPr(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
  pr: RegistryMpPrUser,
): Promise<RegistryMpPrUser> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  if (account.openid) {
    const dup = (data.mpPrUsers ?? []).find(
      (u) =>
        u.id !== account.registry_pr_id &&
        (u.wxOpenId === account.openid || u.platformAccount === account.openid),
    )
    if (dup) throw new Error('openid_pr_conflict')
  }
  const saved = upsertMpPrUser(data, {
    ...pr,
    wxOpenId: account.openid || pr.wxOpenId,
    id: account.registry_pr_id || pr.id,
  })
  const openId = String(account.openid || saved.wxOpenId || '').trim()
  if (openId) dedupeMpPrUsersByOpenId(data, openId, saved.id)
  await io.save(data)
  return saved
}

export type MpAuthWxLoginInput = {
  code: string
  /** 开发者工具：客户端持久化的稳定 openid，避免每次 wx.login code 变化导致新账号 */
  stableDevOpenId?: string
  role?: MpAccountRole
  wxNickName?: string
  wxAvatarUrl?: string
  /** 首次登录可携带注册资料 */
  registerTalent?: RegistryMpTalentMember
  registerPr?: RegistryMpPrUser
}

export async function mpAuthWxLogin(
  supabaseUrl: string,
  serviceRole: string,
  input: MpAuthWxLoginInput,
): Promise<{ token: string; account: MpAccountRow; isNew: boolean }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const { openid } = await wxCodeToOpenId(input.code, input.stableDevOpenId)
  let account = await findAccountByOpenId(rest, openid)
  let isNew = false
  const role: MpAccountRole = input.role === 'pr' ? 'pr' : 'talent'

  if (!account) {
    isNew = true
    account = await insertAccount(rest, {
      openid,
      active_role: role,
      wx_nick_name: input.wxNickName || '',
      wx_avatar_url: input.wxAvatarUrl || '',
    })
  } else if (input.wxNickName || input.wxAvatarUrl) {
    await updateAccount(rest, account.id, {
      wx_nick_name: mergeWxNick(input.wxNickName || '', account.wx_nick_name),
      wx_avatar_url: mergeWxAvatar(input.wxAvatarUrl || '', account.wx_avatar_url),
    })
    account = (await findAccountById(rest, account.id))!
  }

  account = await provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    account,
    role,
    input.wxNickName || '',
    input.wxAvatarUrl || '',
  )

  if (role === 'talent' && input.registerTalent) {
    const saved = await syncRegistryMember(supabaseUrl, serviceRole, account, input.registerTalent)
    await updateAccount(rest, account.id, {
      lingqi_talent_id: saved.lingqiTalentId,
      registry_member_id: saved.id,
      active_role: 'talent',
    })
    account = (await findAccountById(rest, account.id))!
  }
  if (role === 'pr' && input.registerPr) {
    const saved = await syncRegistryPr(supabaseUrl, serviceRole, account, input.registerPr)
    await updateAccount(rest, account.id, {
      lingqi_pr_id: saved.lingqiPrId,
      registry_pr_id: saved.id,
      active_role: 'pr',
    })
    account = (await findAccountById(rest, account.id))!
  }

  const token = await createSession(rest, account.id)
  return { token, account, isNew }
}

/** 抖音小程序 tt.login code 登录（与 wx_login 共用 mp_accounts / 注册表同步） */
export async function mpAuthDyLogin(
  supabaseUrl: string,
  serviceRole: string,
  input: MpAuthWxLoginInput,
): Promise<{ token: string; account: MpAccountRow; isNew: boolean }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const { openid: dyOpenId } = await dyCodeToOpenId(input.code, input.stableDevOpenId)
  let account = await findAccountForDyLogin(rest, dyOpenId)
  let isNew = false
  const role: MpAccountRole = input.role === 'pr' ? 'pr' : 'talent'

  if (!account) {
    isNew = true
    account = await insertAccount(rest, {
      dy_openid: dyOpenId,
      active_role: role,
      wx_nick_name: input.wxNickName || '',
      wx_avatar_url: input.wxAvatarUrl || '',
    })
  } else if (input.wxNickName || input.wxAvatarUrl) {
    await updateAccount(rest, account.id, {
      wx_nick_name: mergeWxNick(input.wxNickName || '', account.wx_nick_name),
      wx_avatar_url: mergeWxAvatar(input.wxAvatarUrl || '', account.wx_avatar_url),
    })
    account = (await findAccountById(rest, account.id))!
  }

  account = await provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    account,
    role,
    input.wxNickName || '',
    input.wxAvatarUrl || '',
  )

  if (role === 'talent' && input.registerTalent) {
    const saved = await syncRegistryMember(supabaseUrl, serviceRole, account, input.registerTalent)
    await updateAccount(rest, account.id, {
      lingqi_talent_id: saved.lingqiTalentId,
      registry_member_id: saved.id,
      active_role: 'talent',
    })
    account = (await findAccountById(rest, account.id))!
  }
  if (role === 'pr' && input.registerPr) {
    const saved = await syncRegistryPr(supabaseUrl, serviceRole, account, input.registerPr)
    await updateAccount(rest, account.id, {
      lingqi_pr_id: saved.lingqiPrId,
      registry_pr_id: saved.id,
      active_role: 'pr',
    })
    account = (await findAccountById(rest, account.id))!
  }

  const token = await createSession(rest, account.id)
  return { token, account, isNew }
}

async function mergeMpAccountIntoPhoneHolder(
  rest: SupabaseRest,
  supabaseUrl: string,
  serviceRole: string,
  source: MpAccountRow,
  target: MpAccountRow,
  platform: 'wx' | 'dy',
): Promise<MpAccountRow> {
  if (source.id === target.id) return target
  const patch: Record<string, unknown> = {}
  const srcWx = String(source.openid || '').trim()
  const srcDy = String(source.dy_openid || '').trim() || (platform === 'dy' ? srcWx : '')
  const tgtWx = String(target.openid || '').trim()
  const tgtDy = String(target.dy_openid || '').trim()

  if (platform === 'wx' && srcWx) {
    if (tgtWx && tgtWx !== srcWx) throw new Error('wx_openid_conflict')
    if (!tgtWx) patch.openid = srcWx
  }
  if (platform === 'dy' && srcDy) {
    if (tgtDy && tgtDy !== srcDy) throw new Error('dy_openid_conflict')
    if (!tgtDy) patch.dy_openid = srcDy
  }
  if (!tgtWx && srcWx && platform === 'dy' && !srcDy) {
    /* legacy dy in openid already on source */
  }
  if (!tgtDy && srcDy && platform === 'wx') {
    if (!patch.dy_openid) patch.dy_openid = srcDy
  }

  const fill = (key: keyof MpAccountRow) => {
    const t = target[key]
    const s = source[key]
    if ((t == null || t === '') && s != null && s !== '') patch[key as string] = s
  }
  fill('lingqi_talent_id')
  fill('lingqi_pr_id')
  fill('registry_member_id')
  fill('registry_pr_id')
  if (!String(target.wx_nick_name || '').trim() && source.wx_nick_name) {
    patch.wx_nick_name = source.wx_nick_name
  }
  if (!String(target.wx_avatar_url || '').trim() && source.wx_avatar_url) {
    patch.wx_avatar_url = source.wx_avatar_url
  }
  if (!target.password_hash && source.password_hash) {
    patch.password_hash = source.password_hash
    patch.password_salt = source.password_salt
  }

  if (Object.keys(patch).length) {
    await updateAccount(rest, target.id, patch)
  }
  await deleteAccountById(rest, source.id)
  let merged = (await findAccountById(rest, target.id))!
  const role: MpAccountRole = merged.active_role === 'pr' ? 'pr' : 'talent'
  merged = await provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    merged,
    role,
    merged.wx_nick_name || '',
    merged.wx_avatar_url || '',
  )
  return merged
}

/** 首次 OAuth 登录后绑定手机号（用户确认）；同号合并微信/抖音为同一 mp_accounts */
export async function mpAuthBindPhoneLogin(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  phone: string,
  platform: 'wx' | 'dy',
): Promise<{ token: string; account: MpAccountRow }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const phoneNorm = normalizeMpLoginPhone(phone)
  if (!phoneNorm) throw new Error('invalid_phone')
  let current = await findAccountById(rest, accountId)
  if (!current) throw new Error('account_not_found')

  const holder = await findAccountByLoginName(rest, phoneNorm)
  if (holder && holder.id !== accountId) {
    current = await mergeMpAccountIntoPhoneHolder(
      rest,
      supabaseUrl,
      serviceRole,
      current,
      holder,
      platform,
    )
  } else if (!isValidMpLoginPhone(String(current.login_name || ''))) {
    await updateAccount(rest, accountId, { login_name: phoneNorm })
    current = (await findAccountById(rest, accountId))!
    const role: MpAccountRole = current.active_role === 'pr' ? 'pr' : 'talent'
    current = await provisionRegistryForAccount(
      supabaseUrl,
      serviceRole,
      current,
      role,
      current.wx_nick_name || '',
      current.wx_avatar_url || '',
    )
  }

  if (mpAccountNeedsPhoneBind(current)) throw new Error('phone_bind_failed')
  const token = await createSession(rest, current.id)
  return { token, account: current }
}

export async function mpAuthPasswordLogin(
  supabaseUrl: string,
  serviceRole: string,
  loginName: string,
  password: string,
): Promise<{ token: string; account: MpAccountRow }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const name = normalizeMpLoginName(loginName)
  if (!name || !password) throw new Error('invalid_credentials')
  let account = await findAccountByLoginName(rest, name)
  if (!account?.password_hash || !account.password_salt) throw new Error('account_no_password')
  if (!verifyPassword(password, account.password_hash, account.password_salt)) {
    throw new Error('invalid_credentials')
  }
  account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, account)
  const token = await createSession(rest, account.id)
  return { token, account }
}

export type MpAuthPhoneRegisterInput = {
  phone: string
  smsCode: string
  password: string
  role?: MpAccountRole
  wxNickName?: string
  wxAvatarUrl?: string
}

/** 手机号 + 验证码注册（无微信 openid，供网页/小程序账号注册） */
export async function mpAuthPhoneRegister(
  supabaseUrl: string,
  serviceRole: string,
  input: MpAuthPhoneRegisterInput,
): Promise<{ token: string; account: MpAccountRow; isNew: true }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const phone = normalizeMpLoginPhone(input.phone)
  if (!phone) throw new Error('invalid_phone')
  const smsCode = String(input.smsCode || '').trim()
  if (!/^\d{6}$/.test(smsCode)) throw new Error('invalid_sms_code')
  const password = String(input.password || '')
  if (password.length < 6) throw new Error('invalid_password')
  if (!(await verifyAuthSmsCode(phone, smsCode))) throw new Error('sms_code_invalid')

  const existing = await findAccountByLoginName(rest, phone)
  if (existing) throw new Error('login_name_taken')

  const role: MpAccountRole = input.role === 'pr' ? 'pr' : 'talent'
  const { hash, salt } = hashPassword(password)
  let account = await insertAccount(rest, {
    openid: null,
    login_name: phone,
    password_hash: hash,
    password_salt: salt,
    active_role: role,
    wx_nick_name: input.wxNickName || '',
    wx_avatar_url: input.wxAvatarUrl || '',
  })

  account = await provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    account,
    role,
    input.wxNickName || '',
    input.wxAvatarUrl || '',
  )

  const token = await createSession(rest, account.id)
  return { token, account, isNew: true }
}

export async function mpAuthSetPassword(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  loginName: string,
  password: string,
): Promise<void> {
  await mpAuthSetLoginCredentials(supabaseUrl, serviceRole, accountId, loginName, password)
}

/** 设置登录名；password 选填，留空则仅更新登录名、保留原密码 */
export async function mpAuthSetLoginCredentials(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  loginName: string,
  password?: string,
): Promise<void> {
  const rest = restClient(supabaseUrl, serviceRole)
  const name = normalizeMpLoginName(loginName)
  if (!name) throw new Error('invalid_login_name')
  const cur = await findAccountById(rest, accountId)
  const curName = String(cur?.login_name || '').trim()
  if (name !== curName && !isValidMpLoginPhone(name)) throw new Error('invalid_login_name')
  let existing = await findAccountByLoginName(rest, name)
  if (existing && existing.id !== accountId) {
    const reclaimed = await reclaimStaleLoginNameHolder(
      rest,
      supabaseUrl,
      serviceRole,
      existing,
      name,
    )
    if (reclaimed) {
      existing = await findAccountByLoginName(rest, name)
    }
    if (existing && existing.id !== accountId) throw new Error('login_name_taken')
  }
  const patch: Record<string, unknown> = { login_name: name }
  const pwd = String(password || '')
  if (pwd.length > 0) {
    if (pwd.length < 6) throw new Error('invalid_password')
    const { hash, salt } = hashPassword(pwd)
    patch.password_hash = hash
    patch.password_salt = salt
  }
  await updateAccount(rest, accountId, patch)
}

export async function mpAuthSwitchRole(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  role: MpAccountRole,
): Promise<MpAccountRow> {
  return mpAuthEnsureIdentity(supabaseUrl, serviceRole, accountId, role)
}

/** 已登录：更新微信昵称头像并同步注册表 */
export async function mpAuthUpdateWxProfile(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  wxNickName: string,
  wxAvatarUrl: string,
): Promise<MpAccountRow> {
  const rest = restClient(supabaseUrl, serviceRole)
  let account = await findAccountById(rest, accountId)
  if (!account) throw new Error('account_not_found')
  const nick = mergeWxNick(wxNickName, account.wx_nick_name)
  const avatar = mergeWxAvatar(wxAvatarUrl, account.wx_avatar_url)
  await updateAccount(rest, accountId, {
    wx_nick_name: nick,
    wx_avatar_url: avatar,
  })
  account = (await findAccountById(rest, account.id))!
  const role: MpAccountRole = account.active_role === 'pr' ? 'pr' : 'talent'
  return provisionRegistryForAccount(supabaseUrl, serviceRole, account, role, nick, avatar)
}

/** 已登录但无 openid（手机号注册等）：用 wx.login code 绑定微信 openid 供 JSAPI 支付 */
export async function mpAuthBindWxOpenId(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  code: string,
  stableDevOpenId?: string,
): Promise<MpAccountRow> {
  const rest = restClient(supabaseUrl, serviceRole)
  let account = await findAccountById(rest, accountId)
  if (!account) throw new Error('account_not_found')
  const existing = String(account.openid || '').trim()
  if (existing) return account

  const { openid } = await wxCodeToOpenId(code, stableDevOpenId)
  const holder = await findAccountByOpenId(rest, openid)
  if (holder && holder.id !== accountId) throw new Error('wx_openid_already_bound')

  await updateAccount(rest, accountId, { openid })
  account = (await findAccountById(rest, accountId))!
  const role: MpAccountRole = account.active_role === 'pr' ? 'pr' : 'talent'
  return provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    account,
    role,
    account.wx_nick_name || '',
    account.wx_avatar_url || '',
  )
}

/** 切换/登录后确保当前身份已在注册表生成 ID 并写回账号 */
export async function mpAuthEnsureIdentity(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  role: MpAccountRole,
  workIdentity?: 'talent' | 'shoot' | 'edit',
): Promise<MpAccountRow> {
  const rest = restClient(supabaseUrl, serviceRole)
  let account = await findAccountById(rest, accountId)
  if (!account) throw new Error('account_not_found')
  const nick = account.wx_nick_name || account.login_name || ''
  account = await provisionRegistryForAccount(
    supabaseUrl,
    serviceRole,
    account,
    role,
    nick,
    account.wx_avatar_url || '',
  )
  const ensuredAccount = account

  if (role === 'talent' && (workIdentity === 'shoot' || workIdentity === 'edit')) {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const phoneKey = accountPhoneKey(ensuredAccount)
    const loginLabel = String(ensuredAccount.login_name || '').trim()
    const contactFallback = loginLabel || phoneKey || String(ensuredAccount.openid || '').trim()
    const memberId = ensuredAccount.registry_member_id || `MTM-${Date.now()}`
    const prev =
      (data.mpTalentMembers ?? []).find((m) => m.id === memberId) ||
      (data.mpTalentMembers ?? []).find(
        (m) =>
          ensuredAccount.openid &&
          String(m.wxOpenId || '').trim() === String(ensuredAccount.openid).trim(),
      ) ||
      (phoneKey.length >= 8
        ? (data.mpTalentMembers ?? []).find((m) => memberPhoneKey(m) === phoneKey)
        : undefined)
    const tagMerge = [
      ...(prev?.accountTags || []),
      ...supplierTags(workIdentity),
    ]
    let saved = upsertMpTalentMember(data, {
      ...(prev || {}),
      id: memberId,
      lingqiTalentId: prev?.lingqiTalentId || ensuredAccount.lingqi_talent_id || '',
      lingqiShootTeamId: prev?.lingqiShootTeamId,
      lingqiEditTeamId: prev?.lingqiEditTeamId,
      memberType: prev?.memberType || 'douyin',
      wxNickName: mergeWxNick(nick, prev?.wxNickName),
      wxAvatarUrl: mergeWxAvatar(ensuredAccount.wx_avatar_url || '', prev?.wxAvatarUrl),
      wxOpenId: prev?.wxOpenId || ensuredAccount.openid || '',
      contact: String(prev?.contact || contactFallback).trim(),
      wechatId: String(prev?.wechatId || contactFallback).trim(),
      workIdentity,
      accountTags: [...new Set(tagMerge)],
      registeredAt: prev?.registeredAt || now,
      updatedAt: now,
    })
    const teamOpenId = String(ensuredAccount.openid || saved.wxOpenId || '').trim()
    if (teamOpenId) dedupeMpTalentMembersByOpenId(data, teamOpenId, saved.id)
    if (workIdentity === 'shoot' && !saved.lingqiShootTeamId) {
      saved = {
        ...saved,
        lingqiShootTeamId: allocateLingqiShootTeamId(data, saved.lingqiShootTeamId),
      }
      const members = [...(data.mpTalentMembers ?? [])]
      const midx = members.findIndex((m) => m.id === saved.id)
      if (midx >= 0) members[midx] = saved
      else members.unshift(saved)
      data.mpTalentMembers = members
      saved = upsertSupplierTeamLibraryFromMember(data, saved)
    }
    if (workIdentity === 'edit' && !saved.lingqiEditTeamId) {
      saved = {
        ...saved,
        lingqiEditTeamId: allocateLingqiEditTeamId(data, saved.lingqiEditTeamId),
      }
      const members = [...(data.mpTalentMembers ?? [])]
      const midx = members.findIndex((m) => m.id === saved.id)
      if (midx >= 0) members[midx] = saved
      else members.unshift(saved)
      data.mpTalentMembers = members
      saved = upsertSupplierTeamLibraryFromMember(data, saved)
    }
    await io.save(data)
    await updateAccount(rest, ensuredAccount.id, {
      lingqi_talent_id: saved.lingqiTalentId || ensuredAccount.lingqi_talent_id,
      registry_member_id: saved.id,
      active_role: 'talent',
    })
    account = (await findAccountById(rest, ensuredAccount.id))!
  }

  await updateAccount(rest, accountId, { active_role: role })
  return (await findAccountById(rest, accountId))!
}

export async function mpAuthScanCreate(
  supabaseUrl: string,
  serviceRole: string,
): Promise<{ ticket: string; expiresAt: string; qrPayload: string; pollUrl: string }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const ticket = newScanTicket()
  const expiresAt = new Date(Date.now() + SCAN_TTL_SEC * 1000).toISOString()
  const res = await rest.post('/mp_wx_scan_tickets', {
    ticket,
    status: 'pending',
    expires_at: expiresAt,
  })
  if (!res.ok) throw new Error('scan_ticket_create_failed')
  const appId = process.env.MP_WECHAT_APPID || 'wx_APPID_PENDING'
  const qrPayload = `lingqi://wx-scan-login?ticket=${ticket}&appid=${appId}`
  return {
    ticket,
    expiresAt,
    qrPayload,
    pollUrl: `/api/meoo-ops-mp-auth?action=scan_poll&ticket=${ticket}`,
  }
}

export async function mpAuthScanPoll(
  supabaseUrl: string,
  serviceRole: string,
  ticket: string,
): Promise<{
  status: string
  token?: string
  account?: ReturnType<typeof accountToClientPayload>
  message?: string
}> {
  const rest = restClient(supabaseUrl, serviceRole)
  const res = await rest.get(
    `/mp_wx_scan_tickets?ticket=eq.${encodeURIComponent(ticket)}&limit=1`,
  )
  if (!res.ok) return { status: 'error', message: 'ticket_lookup_failed' }
  const rows = (await res.json()) as {
    status: string
    expires_at: string
    session_token: string | null
    account_id: string | null
  }[]
  const row = rows[0]
  if (!row) return { status: 'expired' }
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: 'expired' }
  if (row.status === 'confirmed' && row.session_token && row.account_id) {
    const account = await findAccountById(rest, row.account_id)
    if (account) {
      return {
        status: 'confirmed',
        token: row.session_token,
        account: accountToClientPayload(account),
      }
    }
  }
  if (row.status === 'pending') {
    return {
      status: 'pending',
      message:
        process.env.MP_WECHAT_APPID
          ? '请使用微信扫描二维码'
          : '扫码登录接口已就绪；开放平台资质配置后可完成确认（当前为 pending）',
    }
  }
  return { status: row.status }
}

/** 开发/联调：模拟小程序扫码确认（生产由微信回调替换） */
export async function mpAuthScanConfirmDev(
  supabaseUrl: string,
  serviceRole: string,
  ticket: string,
  code: string,
): Promise<{ token: string; account: MpAccountRow }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const { token, account } = await mpAuthWxLogin(supabaseUrl, serviceRole, { code })
  await rest.patch(`/mp_wx_scan_tickets?ticket=eq.${encodeURIComponent(ticket)}`, {
    status: 'confirmed',
    openid: account.openid,
    account_id: account.id,
    session_token: token,
  })
  return { token, account }
}

function normalizeDyOAuthWorkIdentity(raw: string): 'talent' | 'shoot' | 'edit' | 'pr' {
  const v = String(raw || '').trim()
  if (v === 'pr') return 'pr'
  if (v === 'shoot' || v === 'edit') return v
  return 'talent'
}

/** 抖音网站应用扫码登录：生成授权 URL（PC 端 iframe / 二维码） */
export async function mpAuthDyOAuthBegin(
  supabaseUrl: string,
  serviceRole: string,
  workIdentity: string,
  opts?: { portal?: DyOAuthPortal; redirectUri?: string },
): Promise<{ authorizeUrl: string; ticket: string; expiresAt: string; redirectUri: string }> {
  if (!isDouyinWebOAuthConfigured()) throw new Error('dy_web_not_configured')
  const rest = restClient(supabaseUrl, serviceRole)
  const ticket = `dyoauth_${newScanTicket()}`
  const expiresAt = new Date(Date.now() + SCAN_TTL_SEC * 1000).toISOString()
  const res = await rest.post('/mp_wx_scan_tickets', {
    ticket,
    status: 'pending',
    expires_at: expiresAt,
  })
  if (!res.ok) throw new Error('scan_ticket_create_failed')
  const portal: DyOAuthPortal =
    opts?.portal === 'merchant' || opts?.portal === 'partner' ? opts.portal : 'xingxuan'
  const redirectUri = pickDouyinWebRedirectUri(opts?.redirectUri, portal)
  const state = encodeDyOAuthState({
    ticket,
    workIdentity:
      portal === 'xingxuan' ? normalizeDyOAuthWorkIdentity(workIdentity) : portal,
    portal,
  })
  const authorizeUrl = buildDouyinWebAuthorizeUrl(state, redirectUri)
  return { authorizeUrl, ticket, expiresAt, redirectUri }
}

export type MpAuthDyOAuthCompleteResult = {
  token: string
  account: MpAccountRow
  workIdentity: string
  isNew: boolean
  portal: DyOAuthPortal
  erpSession?: { access_token: string; refresh_token: string; loginName: string }
}

async function tryErpSessionFromMpAccount(
  account: MpAccountRow,
): Promise<{ access_token: string; refresh_token: string; loginName: string }> {
  const phone = normalizeMpLoginPhone(String(account.login_name || ''))
  if (!phone || !isValidMpLoginPhone(phone)) throw new Error('erp_dy_phone_not_bound')
  const user = await findAuthUserByPhone(phone)
  if (!user) throw new Error('erp_dy_phone_not_registered')
  const sess = await createAdminSessionForUserId(user.userId, user.email)
  if (!sess.ok) throw new Error(sess.error)
  return {
    access_token: sess.access_token,
    refresh_token: sess.refresh_token,
    loginName: user.loginName,
  }
}

/** 抖音 OAuth 回调：code + state → 会话 token（ERP 门户额外返回 Supabase 会话） */
export async function mpAuthDyOAuthComplete(
  supabaseUrl: string,
  serviceRole: string,
  code: string,
  state: string,
): Promise<MpAuthDyOAuthCompleteResult> {
  if (!isDouyinWebOAuthConfigured()) throw new Error('dy_web_not_configured')
  const parsed = decodeDyOAuthState(state)
  if (!parsed?.ticket) throw new Error('dy_oauth_state_invalid')

  const rest = restClient(supabaseUrl, serviceRole)
  const ticketRes = await rest.get(
    `/mp_wx_scan_tickets?ticket=eq.${encodeURIComponent(parsed.ticket)}&limit=1`,
  )
  if (!ticketRes.ok) throw new Error('dy_oauth_ticket_lookup_failed')
  const ticketRows = (await ticketRes.json()) as { status: string; expires_at: string }[]
  const ticketRow = ticketRows[0]
  if (!ticketRow) throw new Error('dy_oauth_ticket_expired')
  if (new Date(ticketRow.expires_at).getTime() < Date.now()) throw new Error('dy_oauth_ticket_expired')
  if (ticketRow.status === 'confirmed') throw new Error('dy_oauth_ticket_used')

  const oauth = await exchangeDouyinWebOAuthCode(code)
  const openid = douyinWebOpenIdStorageKey(oauth.openId)
  const portal: DyOAuthPortal = parsed.portal || 'xingxuan'
  const isErpPortal = portal === 'merchant' || portal === 'partner'
  const workIdentity = isErpPortal
    ? portal
    : normalizeDyOAuthWorkIdentity(parsed.workIdentity)
  const role: MpAccountRole = workIdentity === 'pr' ? 'pr' : 'talent'

  let account = await findAccountByOpenId(rest, openid)
  let isNew = false
  if (!account) {
    isNew = true
    account = await insertAccount(rest, {
      openid,
      active_role: role,
      wx_nick_name: oauth.nickname || '',
      wx_avatar_url: oauth.avatarUrl || '',
    })
  } else if (oauth.nickname || oauth.avatarUrl) {
    await updateAccount(rest, account.id, {
      wx_nick_name: mergeWxNick(oauth.nickname, account.wx_nick_name),
      wx_avatar_url: mergeWxAvatar(oauth.avatarUrl, account.wx_avatar_url),
    })
    account = (await findAccountById(rest, account.id))!
  }

  if (!isErpPortal) {
    account = await provisionRegistryForAccount(
      supabaseUrl,
      serviceRole,
      account,
      role,
      oauth.nickname || account.wx_nick_name || '',
      oauth.avatarUrl || account.wx_avatar_url || '',
    )

    if (role === 'talent' && (workIdentity === 'shoot' || workIdentity === 'edit')) {
      account = await mpAuthEnsureIdentity(supabaseUrl, serviceRole, account.id, role, workIdentity)
    }
  }

  let erpSession: MpAuthDyOAuthCompleteResult['erpSession']
  if (isErpPortal) {
    erpSession = await tryErpSessionFromMpAccount(account)
  }

  const token = await createSession(rest, account.id)
  await rest.patch(`/mp_wx_scan_tickets?ticket=eq.${encodeURIComponent(parsed.ticket)}`, {
    status: 'confirmed',
    openid,
    account_id: account.id,
    session_token: token,
  })

  return { token, account, workIdentity, isNew, portal, erpSession }
}

export async function assertOpenIdNotRegistered(
  supabaseUrl: string,
  serviceRole: string,
  openid: string,
  exceptAccountId?: string,
): Promise<void> {
  if (!openid) return
  const rest = restClient(supabaseUrl, serviceRole)
  const acc = await findAccountByOpenId(rest, openid)
  if (acc && acc.id !== exceptAccountId) throw new Error('wx_already_registered')
}

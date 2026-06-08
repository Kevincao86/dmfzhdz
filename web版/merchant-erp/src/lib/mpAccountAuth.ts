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
import { findRegistryMemberForAccount } from './mpRegistryProfileGet.js'
import { memberHasResolvablePlatformInfo } from './mpTalentPlatformProfileResolve.js'
import { upsertSupplierTeamLibraryFromMember } from './supplierTeamLibrarySync.js'
import { upsertMpPrUser } from './mpPrUserUpsert.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { normalizeMpLoginName, normalizeMpLoginPhone, isValidMpLoginPhone } from './mpPhoneAuth.js'
import { verifyAuthSmsCode } from '../../vite-plugins/authSmsAuthShared.js'

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
  }
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

async function findAccountByOpenId(rest: SupabaseRest, openid: string): Promise<MpAccountRow | null> {
  const q = `/mp_accounts?openid=eq.${encodeURIComponent(openid)}&limit=1`
  const res = await rest.get(q)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function findAccountByLoginName(rest: SupabaseRest, loginName: string): Promise<MpAccountRow | null> {
  const q = `/mp_accounts?login_name=eq.${encodeURIComponent(loginName)}&limit=1`
  const res = await rest.get(q)
  if (!res.ok) return null
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
  }
}

export async function accountPayloadWithMemberExtras(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
) {
  let extras: { lingqiShootTeamId?: string | null; lingqiEditTeamId?: string | null; workIdentity?: string | null } =
    {}
  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const memberId = String(account.registry_member_id || '').trim()
    const phoneKey = accountPhoneKey(account)
    const member =
      (data.mpTalentMembers ?? []).find((m) => m.id === memberId) ||
      (data.mpTalentMembers ?? []).find(
        (m) => account.openid && String(m.wxOpenId || '').trim() === String(account.openid).trim(),
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
    }
  } catch {
    /* registry optional */
  }
  return accountToClientPayload(account, extras)
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
    const openId = String(account.openid || '').trim()
    const existing = findRegistryMemberForAccount(data, account) ?? undefined
    const base = existing
      ? { ...existing }
      : {
          id: account.registry_member_id || `MTM-${Date.now()}`,
          memberType: 'douyin' as const,
          lingqiTalentId: account.lingqi_talent_id || '',
          registeredAt: now,
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
    const openId = String(account.openid || '').trim()
    let existingPr: RegistryMpPrUser | undefined = openId
      ? (data.mpPrUsers ?? []).find((u) => String(u.wxOpenId || '').trim() === openId)
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
      (u) => u.wxOpenId === account.openid && u.id !== account.registry_pr_id,
    )
    if (dup) throw new Error('openid_pr_conflict')
  }
  const saved = upsertMpPrUser(data, {
    ...pr,
    wxOpenId: account.openid || pr.wxOpenId,
    id: account.registry_pr_id || pr.id,
    lingqiPrId: account.lingqi_pr_id || pr.lingqiPrId,
  })
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

export async function mpAuthPasswordLogin(
  supabaseUrl: string,
  serviceRole: string,
  loginName: string,
  password: string,
): Promise<{ token: string; account: MpAccountRow }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const name = normalizeMpLoginName(loginName)
  if (!name || !password) throw new Error('invalid_credentials')
  const account = await findAccountByLoginName(rest, name)
  if (!account?.password_hash || !account.password_salt) throw new Error('invalid_credentials')
  if (!verifyPassword(password, account.password_hash, account.password_salt)) {
    throw new Error('invalid_credentials')
  }
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
  const existing = await findAccountByLoginName(rest, name)
  if (existing && existing.id !== accountId) throw new Error('login_name_taken')
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

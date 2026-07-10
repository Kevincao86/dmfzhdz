/**
 * 服务商版（fws）：为 ERP 租户自动开通星选 PR 账号与会话（不改动星选 Web 源码）。
 */
import type { RegistryMpPrUser } from './opsRegistryTypes.js'
import {
  accountToClientPayload,
  createMpAuthRest,
  newSessionToken,
  reconcileAccountPrFromRegistry,
  registerMpPrUser,
  type MpAccountRow,
} from './mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { supabaseAdminFetch } from './supabaseAdminFetch.js'

export type PartnerXingxuanBootstrapResult =
  | {
      ok: true
      mpSessionToken: string
      accountId: string
      lingqiPrId: string | null
      registryPrId: string | null
      created: boolean
      account: ReturnType<typeof accountToClientPayload>
    }
  | { ok: false; error: string; message: string }

function normalizeCnPhone(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2)
  return ''
}

function partnerSyntheticOpenId(tenantId: string): string {
  return `erp_partner_${String(tenantId || '').trim()}`
}

async function fetchTenantPartnerRow(
  base: string,
  headers: Record<string, string>,
  tenantId: string,
): Promise<{ id: string; edition: string; name: string | null } | null> {
  const url = `${base}/rest/v1/tenants?select=id,edition,name&id=eq.${encodeURIComponent(tenantId)}&limit=1`
  const res = await supabaseAdminFetch(url, { headers })
  if (!res.ok) return null
  const rows = (await res.json()) as { id?: string; edition?: string; name?: string | null }[]
  const row = rows[0]
  if (!row?.id) return null
  return { id: row.id, edition: String(row.edition || 'merchant'), name: row.name ?? null }
}

/** fws bootstrap：legacy merchant 租户自动升级为 partner，避免误注册商家版导致无法关联星选 */
export async function ensureTenantPartnerEdition(
  base: string,
  headers: Record<string, string>,
  tenantId: string,
  currentEdition: string | null | undefined,
): Promise<
  | { ok: true; edition: 'partner' | 'partner_agent' }
  | { ok: false; error: string; message: string }
> {
  const ed = String(currentEdition || 'merchant').trim()
  if (ed === 'partner' || ed === 'partner_agent') {
    return { ok: true, edition: ed }
  }
  if (ed === 'merchant' || ed === '' || ed === 'free') {
    const url = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
    const res = await supabaseAdminFetch(url, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ edition: 'partner' }),
    })
    if (!res.ok) {
      return {
        ok: false,
        error: 'edition_upgrade_failed',
        message: '租户升级为服务商版失败，请联系运营处理',
      }
    }
    return { ok: true, edition: 'partner' }
  }
  return {
    ok: false,
    error: 'not_partner',
    message: `当前租户类型（${ed}）不支持开通星选 PR 账号`,
  }
}

async function findMpAccountByOpenId(
  rest: ReturnType<typeof createMpAuthRest>,
  openid: string,
): Promise<MpAccountRow | null> {
  const res = await rest.get(`/mp_accounts?openid=eq.${encodeURIComponent(openid)}&limit=1`)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function findMpAccountByLoginName(
  rest: ReturnType<typeof createMpAuthRest>,
  loginName: string,
): Promise<MpAccountRow | null> {
  const res = await rest.get(`/mp_accounts?login_name=eq.${encodeURIComponent(loginName)}&limit=1`)
  if (!res.ok) return null
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0] ?? null
}

async function insertMpAccount(
  rest: ReturnType<typeof createMpAuthRest>,
  row: Record<string, unknown>,
): Promise<MpAccountRow> {
  const res = await rest.post('/mp_accounts', row)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`mp_account_insert_failed:${res.status}:${t.slice(0, 160)}`)
  }
  const rows = (await res.json()) as MpAccountRow[]
  return rows[0]!
}

async function patchMpAccount(
  rest: ReturnType<typeof createMpAuthRest>,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await rest.patch(`/mp_accounts?id=eq.${encodeURIComponent(id)}`, {
    ...patch,
    updated_at: new Date().toISOString(),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`mp_account_patch_failed:${res.status}:${t.slice(0, 160)}`)
  }
}

async function createMpSession(
  rest: ReturnType<typeof createMpAuthRest>,
  accountId: string,
): Promise<string> {
  const token = newSessionToken()
  const expires = new Date(Date.now() + 30 * 86400_000).toISOString()
  const res = await rest.post('/mp_auth_sessions', {
    token,
    account_id: accountId,
    expires_at: expires,
  })
  if (!res.ok) throw new Error('mp_session_create_failed')
  return token
}

function buildDefaultPrUser(input: {
  companyName: string
  phone: string
  openid: string
  nickName: string
}): RegistryMpPrUser {
  const now = new Date().toISOString()
  return {
    id: `MPR-PARTNER-${Date.now()}`,
    lingqiPrId: '',
    accountType: 'company',
    companyName: input.companyName,
    contactName: input.companyName,
    contactPhone: input.phone,
    wxOpenId: input.openid,
    wxNickName: input.nickName,
    registeredAt: now,
    updatedAt: now,
  }
}

/**
 * 为服务商 ERP 租户确保星选 PR 账号存在，并签发 mp 会话（供 fws 内嵌星选使用）。
 */
export async function ensurePartnerXingxuanMpSession(input: {
  supabaseUrl: string
  serviceRole: string
  tenantId: string
  phone: string
  companyName: string
}): Promise<PartnerXingxuanBootstrapResult> {
  const base = input.supabaseUrl.replace(/\/$/, '')
  const headers = {
    apikey: input.serviceRole,
    Authorization: `Bearer ${input.serviceRole}`,
    'Content-Type': 'application/json',
  }
  const tenant = await fetchTenantPartnerRow(base, headers, input.tenantId)
  if (!tenant) {
    return { ok: false, error: 'tenant_not_found', message: '未找到服务商租户' }
  }
  const editionOk = await ensureTenantPartnerEdition(base, headers, tenant.id, tenant.edition)
  if (!editionOk.ok) {
    return { ok: false, error: editionOk.error, message: editionOk.message }
  }

  const phone = normalizeCnPhone(input.phone)
  if (!phone) {
    return { ok: false, error: 'invalid_phone', message: '请先在 ERP 账号中绑定大陆手机号' }
  }

  const companyName = String(input.companyName || tenant.name || '服务商').trim() || '服务商'
  const openid = partnerSyntheticOpenId(tenant.id)
  const rest = createMpAuthRest(input.supabaseUrl, input.serviceRole)

  let account =
    (await findMpAccountByOpenId(rest, openid)) ?? (await findMpAccountByLoginName(rest, phone))
  let created = false

  if (!account) {
    account = await insertMpAccount(rest, {
      openid,
      login_name: phone,
      active_role: 'pr',
      wx_nick_name: companyName,
      wx_avatar_url: '',
    })
    created = true
  } else {
    const patch: Record<string, unknown> = {}
    if (!account.openid) patch.openid = openid
    if (!account.login_name) patch.login_name = phone
    if (account.active_role !== 'pr') patch.active_role = 'pr'
    if (!account.wx_nick_name) patch.wx_nick_name = companyName
    if (Object.keys(patch).length) {
      await patchMpAccount(rest, account.id, patch)
      account = (await findMpAccountByOpenId(rest, openid)) ?? account
    }
  }

  if (!account.lingqi_pr_id || !account.registry_pr_id) {
    const prUser = buildDefaultPrUser({ companyName, phone, openid, nickName: companyName })
    await registerMpPrUser(input.supabaseUrl, input.serviceRole, prUser, account)
    account = (await findMpAccountByOpenId(rest, openid)) ?? account
  }

  account = await reconcileAccountPrFromRegistry(input.supabaseUrl, input.serviceRole, account)

  const mpSessionToken = await createMpSession(rest, account.id)

  // 标记 ERP 租户已桥接星选（仅审计，供运营排查）
  try {
    const io = createRegistrySnapshotIoFetch(input.supabaseUrl, input.serviceRole)
    const data = await io.load()
    const pr = (data.mpPrUsers ?? []).find(
      (u) => u && (u.id === account.registry_pr_id || u.lingqiPrId === account.lingqi_pr_id),
    )
    if (pr) {
      pr.updatedAt = new Date().toISOString()
      await io.save(data)
    }
  } catch {
    /* 非阻断 */
  }

  return {
    ok: true,
    mpSessionToken,
    accountId: account.id,
    lingqiPrId: account.lingqi_pr_id,
    registryPrId: account.registry_pr_id,
    created,
    account: accountToClientPayload(account),
  }
}

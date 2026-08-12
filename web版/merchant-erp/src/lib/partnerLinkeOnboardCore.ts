/**
 * fws：林客客户商家「能力授权 + 代运营合作」编排
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/life.capacity.shop/auth_with_bind
 * @see https://partner.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/paterner/create
 */
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  douyinOpenApiUrl,
  douyinServerFetch,
  exchangeDouyinClientToken,
  parseDouyinOpenApiEnvelope,
} from '../../api/douyinOpenApiBase.js'
import {
  merchantDouyinSessionSecret,
  openDouyinSessionCredentials,
  sealDouyinSessionCredentials,
} from '../../api/douyin-bind.js'
import { partnerClientsDataTenantId } from './partnerTenantProfile.js'
import type { PartnerTenantProfile } from './partnerTenantProfile.js'
import { normalizeLinkeAuthSolutionKey } from './partnerLinkeSolutionOptions.js'

export const DOUYIN_AUTH_WITH_BIND_BASE = 'https://auth.dylk.com/auth-isv/'

export {
  DEFAULT_LINKE_AUTH_SOLUTION_KEY,
  LINKE_AUTH_SOLUTION_OPTIONS,
  normalizeLinkeAuthSolutionKey,
} from './partnerLinkeSolutionOptions.js'

export type PartnerLinkeOnboardRow = {
  id: string
  tenantId: string
  clientLabel: string | null
  outShopId: string
  merchantAccountId: string | null
  poiId: string | null
  authStatus: 'pending' | 'authorized' | 'failed'
  cooperationStatus: 'pending' | 'created' | 'confirmed' | 'failed' | 'skipped'
  cooperationOrderId: string | null
  cooperationError: string | null
  authUrl: string | null
  partnerClientId: string | null
  ownerAgentTenantId: string | null
  solutionKey: string
  createdAt: string
  updatedAt: string
}

export type PartnerDouyinSpCredentials = {
  clientKey: string
  clientSecret: string
  spAccountId: string
  sealedToken: string
}

function parseOnboardRow(raw: Record<string, unknown>): PartnerLinkeOnboardRow | null {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const tenantId = typeof raw.tenant_id === 'string' ? raw.tenant_id : ''
  if (!id || !tenantId) return null
  const authStatus = String(raw.auth_status || 'pending')
  const coopStatus = String(raw.cooperation_status || 'pending')
  return {
    id,
    tenantId,
    clientLabel: typeof raw.client_label === 'string' ? raw.client_label : null,
    outShopId: typeof raw.out_shop_id === 'string' ? raw.out_shop_id : '',
    merchantAccountId:
      typeof raw.merchant_account_id === 'string' ? raw.merchant_account_id : null,
    poiId: typeof raw.poi_id === 'string' ? raw.poi_id : null,
    authStatus:
      authStatus === 'authorized' || authStatus === 'failed' ? authStatus : 'pending',
    cooperationStatus:
      coopStatus === 'created' ||
      coopStatus === 'confirmed' ||
      coopStatus === 'failed' ||
      coopStatus === 'skipped'
        ? coopStatus
        : 'pending',
    cooperationOrderId:
      typeof raw.cooperation_order_id === 'string' ? raw.cooperation_order_id : null,
    cooperationError: typeof raw.cooperation_error === 'string' ? raw.cooperation_error : null,
    authUrl: typeof raw.auth_url === 'string' ? raw.auth_url : null,
    partnerClientId: typeof raw.partner_client_id === 'string' ? raw.partner_client_id : null,
    ownerAgentTenantId:
      typeof raw.owner_agent_tenant_id === 'string' ? raw.owner_agent_tenant_id : null,
    solutionKey: normalizeLinkeAuthSolutionKey(raw.solution_key),
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

/** 生活服务 SignV2（auth_with_bind URL） */
export function douyinLifeSignV2(
  clientSecret: string,
  body: string,
  query: Record<string, string>,
): string {
  const keys = Object.keys(query)
    .filter((k) => k !== 'sign')
    .sort()
  let str = clientSecret
  for (const k of keys) {
    str += `&${k}=${query[k]}`
  }
  if (body) str += `&http_body=${body}`
  return createHash('sha256').update(str, 'utf8').digest('hex')
}

/**
 * 拼装 auth_with_bind URL。
 * 单方案统一走官方「solution_key + permission_keys」格式。
 * 勿对 21 等新方案误用 multi_solution_data：抖音侧常报「URL校验不通过：获取解决方案信息失败」。
 */
export function buildDouyinAuthWithBindUrl(input: {
  clientKey: string
  clientSecret: string
  solutionKey: string
  permissionKeys: string[]
  outShopId: string
  extra: string
}): string {
  const solutionKey = input.solutionKey.trim()
  const permissionKeys = input.permissionKeys.map((x) => String(x).trim()).filter(Boolean)
  const query: Record<string, string> = {
    client_key: input.clientKey.trim(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    charset: 'UTF-8',
    solution_key: solutionKey,
    permission_keys: permissionKeys.join(','),
    out_shop_id: input.outShopId.trim(),
    extra: input.extra.trim(),
  }
  const sign = douyinLifeSignV2(input.clientSecret.trim(), '', query)
  const u = new URL(DOUYIN_AUTH_WITH_BIND_BASE)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
  u.searchParams.set('sign', sign)
  /** 微信内打开时降低链接被拦截概率（不参与签名） */
  u.searchParams.set('new_host', '1')
  return u.toString()
}

export async function loadPartnerDouyinSpCredentials(
  admin: SupabaseClient,
  dataTenantId: string,
): Promise<PartnerDouyinSpCredentials | { ok: false; message: string }> {
  const { data, error } = await admin
    .from('tenant_merchant_bindings')
    .select('merchant_account_id, client_key, sealed_credentials')
    .eq('tenant_id', dataTenantId)
    .eq('provider', 'douyin')
    .eq('binding_role', 'service_provider')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data?.sealed_credentials) {
    return { ok: false, message: '请先在「服务商平台」完成抖音林客 SP 应用绑定' }
  }
  const opened = openDouyinSessionCredentials(String(data.sealed_credentials))
  if (!opened?.clientKey || !opened.clientSecret) {
    return { ok: false, message: '林客 SP 凭证无法解析，请重新绑定服务商应用' }
  }
  return {
    clientKey: opened.clientKey,
    clientSecret: opened.clientSecret,
    spAccountId: String(data.merchant_account_id || opened.merchantId || '').trim(),
    sealedToken: String(data.sealed_credentials),
  }
}

async function fetchDouyinClientToken(creds: PartnerDouyinSpCredentials): Promise<string> {
  const { token } = await exchangeDouyinClientToken(
    creds.clientKey,
    creds.clientSecret,
    (input, init) => douyinServerFetch(input, init),
  )
  return token
}

function coopWindowSec(): { start: number; end: number } {
  const now = Math.floor(Date.now() / 1000)
  const start = now + 86_400
  const end = start + 365 * 86_400
  return { start, end }
}

export async function createDouyinPartnerCooperation(input: {
  creds: PartnerDouyinSpCredentials
  merchantAccountId: string
  chargeType?: 1 | 2
  commissionRatio?: string
}): Promise<
  | { ok: true; orderId: string }
  | { ok: false; message: string; detail?: string }
> {
  const accountId = String(input.merchantAccountId || '').trim()
  if (!accountId) return { ok: false, message: '缺少商家 account_id' }
  const { start, end } = coopWindowSec()
  const body = {
    account_id: accountId,
    cooperation_content: 5,
    start_time: start,
    end_time: end,
    charge_type: input.chargeType ?? 2,
    ...(input.chargeType === 1 && input.commissionRatio
      ? { commission_ratio: input.commissionRatio }
      : {}),
  }
  try {
    const token = await fetchDouyinClientToken(input.creds)
    const res = await douyinServerFetch(douyinOpenApiUrl('/goodlife/v1/partner/order/create/'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'access-token': token,
      },
      body: JSON.stringify(body),
    })
    const raw = await res.text()
    const j = parseDouyinOpenApiEnvelope(raw, 'partner/order/create')
    const data =
      j.data && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : undefined
    const code = Number(data?.error_code ?? j.error_code ?? 0)
    if (!res.ok || code !== 0) {
      return {
        ok: false,
        message: String(data?.description ?? j.description ?? `HTTP ${res.status}`),
        detail: raw.slice(0, 600),
      }
    }
    const orderId = String(data?.order_id ?? '').trim()
    if (!orderId) return { ok: false, message: '代运营合作已提交但未返回 order_id', detail: raw.slice(0, 400) }
    return { ok: true, orderId }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 抖音文档：extra 为普通 string，多方案链路不支持含引号的 JSON。
 * 格式：v1.<onboardingId>.<tenantId>.<ownerAgentTenantId?>
 */
export function buildOnboardInviteExtra(input: {
  onboardingId: string
  dataTenantId: string
  ownerAgentTenantId?: string | null
}): string {
  const oid = String(input.onboardingId || '').trim()
  const tid = String(input.dataTenantId || '').trim()
  const aid = String(input.ownerAgentTenantId || '').trim()
  return aid ? `v1.${oid}.${tid}.${aid}` : `v1.${oid}.${tid}`
}

export function parseOnboardInviteExtra(
  extra: unknown,
): { onboardingId?: string; tenantId?: string; ownerAgentTenantId?: string | null } | null {
  if (extra == null || extra === '') return null
  const text = typeof extra === 'string' ? extra.trim() : ''
  if (text.startsWith('v1.')) {
    const m = /^v1\.([0-9a-f-]{36})\.([0-9a-f-]{36})(?:\.([0-9a-f-]{36}))?$/i.exec(text)
    if (m) {
      return {
        onboardingId: m[1],
        tenantId: m[2],
        ownerAgentTenantId: m[3] || null,
      }
    }
  }
  try {
    const raw = typeof extra === 'string' ? JSON.parse(extra) : extra
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    return {
      onboardingId: typeof o.onboardingId === 'string' ? o.onboardingId : undefined,
      tenantId: typeof o.tenantId === 'string' ? o.tenantId : undefined,
      ownerAgentTenantId:
        typeof o.ownerAgentTenantId === 'string' ? o.ownerAgentTenantId : null,
    }
  } catch {
    return null
  }
}

export async function deletePartnerLinkeOnboarding(input: {
  admin: SupabaseClient
  dataTenantId: string
  onboardingId: string
  ownerAgentTenantId?: string | null
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = String(input.onboardingId || '').trim()
  if (!id) return { ok: false, message: '缺少 onboardingId' }
  let q = input.admin
    .from('tenant_partner_linke_onboarding')
    .delete()
    .eq('tenant_id', input.dataTenantId)
    .eq('id', id)
  if (input.ownerAgentTenantId) {
    q = q.eq('owner_agent_tenant_id', input.ownerAgentTenantId)
  }
  const { data, error } = await q.select('id')
  if (error) return { ok: false, message: error.message.slice(0, 200) }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, message: '开通任务不存在或无权删除' }
  }
  return { ok: true }
}

export async function listPartnerLinkeOnboarding(
  admin: SupabaseClient,
  dataTenantId: string,
  opts?: { ownerAgentTenantId?: string | null },
): Promise<PartnerLinkeOnboardRow[]> {
  let q = admin
    .from('tenant_partner_linke_onboarding')
    .select('*')
    .eq('tenant_id', dataTenantId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (opts?.ownerAgentTenantId) {
    q = q.eq('owner_agent_tenant_id', opts.ownerAgentTenantId)
  }
  const { data, error } = await q
  if (error || !data) return []
  return data
    .map((r) => parseOnboardRow(r as Record<string, unknown>))
    .filter((x): x is PartnerLinkeOnboardRow => x != null)
}

export async function startPartnerLinkeOnboardInvite(input: {
  admin: SupabaseClient
  profile: PartnerTenantProfile
  clientLabel?: string
  solutionKey?: string
  permissionKeys?: string[]
}): Promise<
  | { ok: true; row: PartnerLinkeOnboardRow; authUrl: string }
  | { ok: false; error: string; message: string }
> {
  const dataTenantId = partnerClientsDataTenantId(input.profile)
  const sp = await loadPartnerDouyinSpCredentials(input.admin, dataTenantId)
  if ('ok' in sp && sp.ok === false) {
    return { ok: false, error: 'sp_not_bound', message: sp.message }
  }
  const creds = sp as PartnerDouyinSpCredentials

  const onboardingId = randomUUID()
  const outShopId = `fws_${onboardingId.replace(/-/g, '').slice(0, 24)}`
  const inviteExtra = buildOnboardInviteExtra({
    onboardingId,
    dataTenantId,
    ownerAgentTenantId: input.profile.isAgent ? input.profile.tenantId : null,
  })
  const solutionKey = normalizeLinkeAuthSolutionKey(input.solutionKey)
  const permissionKeys =
    input.permissionKeys && input.permissionKeys.length
      ? input.permissionKeys
      : ['1', '16']

  const authUrl = buildDouyinAuthWithBindUrl({
    clientKey: creds.clientKey,
    clientSecret: creds.clientSecret,
    solutionKey,
    permissionKeys,
    outShopId,
    extra: inviteExtra,
  })

  const now = new Date().toISOString()
  const { data, error } = await input.admin
    .from('tenant_partner_linke_onboarding')
    .insert({
      id: onboardingId,
      tenant_id: dataTenantId,
      provider: 'douyin',
      client_label: input.clientLabel?.trim() || null,
      out_shop_id: outShopId,
      invite_extra: inviteExtra,
      solution_key: solutionKey,
      permission_keys: permissionKeys,
      auth_status: 'pending',
      cooperation_status: 'pending',
      owner_agent_tenant_id: input.profile.isAgent ? input.profile.tenantId : null,
      created_by_tenant_id: input.profile.tenantId,
      auth_url: authUrl,
      updated_at: now,
    })
    .select('*')
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false,
      error: 'db_insert_failed',
      message: error?.message ?? '创建开通任务失败',
    }
  }
  const row = parseOnboardRow(data as Record<string, unknown>)
  if (!row) return { ok: false, error: 'parse_failed', message: '写入结果异常' }
  return { ok: true, row, authUrl }
}

async function upsertPartnerClientFromAuth(input: {
  admin: SupabaseClient
  dataTenantId: string
  merchantAccountId: string
  creds: PartnerDouyinSpCredentials
  clientLabel?: string | null
  ownerAgentTenantId?: string | null
  createdByTenantId?: string | null
}): Promise<{ clientId: string; sealed: string } | null> {
  const secret = merchantDouyinSessionSecret()
  if (!secret) return null
  const sealed = sealDouyinSessionCredentials(
    {
      clientKey: input.creds.clientKey,
      clientSecret: input.creds.clientSecret,
      merchantId: input.merchantAccountId,
    },
    secret,
  )
  const now = new Date().toISOString()
  const { data, error } = await input.admin
    .from('tenant_partner_clients')
    .upsert(
      {
        tenant_id: input.dataTenantId,
        provider: 'douyin',
        merchant_account_id: input.merchantAccountId,
        sealed_credentials: sealed,
        client_key: input.creds.clientKey,
        client_label: input.clientLabel ?? null,
        account_display_name: input.clientLabel ?? input.merchantAccountId,
        owner_agent_tenant_id: input.ownerAgentTenantId ?? null,
        created_by_tenant_id: input.createdByTenantId ?? null,
        updated_at: now,
      },
      { onConflict: 'tenant_id,provider,merchant_account_id' },
    )
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return null
  return { clientId: String(data.id), sealed }
}

export async function finalizePartnerLinkeAuthWebhook(input: {
  admin: SupabaseClient
  msgId?: string | null
  accountId: string
  extra?: unknown
  outShopId?: string | null
  poiId?: string | null
  autoCooperation?: boolean
  chargeType?: 1 | 2
}): Promise<
  | { ok: true; onboardingId: string; partnerClientId: string | null; cooperationOrderId?: string }
  | { ok: false; message: string }
> {
  const accountId = String(input.accountId || '').trim()
  if (!accountId) return { ok: false, message: '缺少 account_id' }

  let onboardingRow: Record<string, unknown> | null = null
  const parsedExtra = parseOnboardInviteExtra(input.extra)
  if (parsedExtra?.onboardingId) {
    const { data } = await input.admin
      .from('tenant_partner_linke_onboarding')
      .select('*')
      .eq('id', parsedExtra.onboardingId)
      .maybeSingle()
    onboardingRow = (data as Record<string, unknown>) ?? null
  }
  if (!onboardingRow && input.outShopId) {
    const { data } = await input.admin
      .from('tenant_partner_linke_onboarding')
      .select('*')
      .eq('out_shop_id', String(input.outShopId).trim())
      .maybeSingle()
    onboardingRow = (data as Record<string, unknown>) ?? null
  }
  if (!onboardingRow?.id) {
    return { ok: false, message: '未找到匹配的开通任务（extra / out_shop_id）' }
  }

  const dataTenantId = String(onboardingRow.tenant_id || '')
  const sp = await loadPartnerDouyinSpCredentials(input.admin, dataTenantId)
  if ('ok' in sp && sp.ok === false) {
    return { ok: false, message: sp.message }
  }
  const creds = sp as PartnerDouyinSpCredentials

  const clientUpsert = await upsertPartnerClientFromAuth({
    admin: input.admin,
    dataTenantId,
    merchantAccountId: accountId,
    creds,
    clientLabel:
      typeof onboardingRow.client_label === 'string' ? onboardingRow.client_label : null,
    ownerAgentTenantId:
      typeof onboardingRow.owner_agent_tenant_id === 'string'
        ? onboardingRow.owner_agent_tenant_id
        : null,
    createdByTenantId:
      typeof onboardingRow.created_by_tenant_id === 'string'
        ? onboardingRow.created_by_tenant_id
        : null,
  })

  let cooperationOrderId: string | undefined
  let cooperationStatus: PartnerLinkeOnboardRow['cooperationStatus'] = 'pending'
  let cooperationError: string | null = null

  if (input.autoCooperation !== false) {
    const coop = await createDouyinPartnerCooperation({
      creds,
      merchantAccountId: accountId,
      chargeType: input.chargeType,
    })
    if (coop.ok) {
      cooperationOrderId = coop.orderId
      cooperationStatus = 'created'
    } else {
      cooperationStatus = 'failed'
      cooperationError = coop.message
    }
  } else {
    cooperationStatus = 'skipped'
  }

  const now = new Date().toISOString()
  await input.admin
    .from('tenant_partner_linke_onboarding')
    .update({
      merchant_account_id: accountId,
      poi_id: input.poiId ?? null,
      auth_status: 'authorized',
      cooperation_status: cooperationStatus,
      cooperation_order_id: cooperationOrderId ?? null,
      cooperation_error: cooperationError,
      partner_client_id: clientUpsert?.clientId ?? null,
      auth_webhook_msg_id: input.msgId ?? null,
      updated_at: now,
    })
    .eq('id', String(onboardingRow.id))

  return {
    ok: true,
    onboardingId: String(onboardingRow.id),
    partnerClientId: clientUpsert?.clientId ?? null,
    cooperationOrderId,
  }
}

export async function retryPartnerLinkeCooperation(input: {
  admin: SupabaseClient
  dataTenantId: string
  onboardingId: string
  chargeType?: 1 | 2
}): Promise<
  | { ok: true; orderId: string }
  | { ok: false; message: string }
> {
  const { data, error } = await input.admin
    .from('tenant_partner_linke_onboarding')
    .select('*')
    .eq('tenant_id', input.dataTenantId)
    .eq('id', input.onboardingId)
    .maybeSingle()
  if (error || !data) return { ok: false, message: '开通任务不存在' }
  const accountId = String(data.merchant_account_id || '').trim()
  if (!accountId) return { ok: false, message: '商家尚未完成授权，无法发起代运营合作' }
  if (String(data.auth_status) !== 'authorized') {
    return { ok: false, message: '请先完成林客应用授权' }
  }

  const sp = await loadPartnerDouyinSpCredentials(input.admin, input.dataTenantId)
  if ('ok' in sp && sp.ok === false) return { ok: false, message: sp.message }
  const coop = await createDouyinPartnerCooperation({
    creds: sp as PartnerDouyinSpCredentials,
    merchantAccountId: accountId,
    chargeType: input.chargeType,
  })
  if (!coop.ok) {
    await input.admin
      .from('tenant_partner_linke_onboarding')
      .update({
        cooperation_status: 'failed',
        cooperation_error: coop.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.onboardingId)
    return { ok: false, message: coop.message }
  }
  await input.admin
    .from('tenant_partner_linke_onboarding')
    .update({
      cooperation_status: 'created',
      cooperation_order_id: coop.orderId,
      cooperation_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.onboardingId)
  return { ok: true, orderId: coop.orderId }
}

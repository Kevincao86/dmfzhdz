import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST / PG：列或表尚未迁移时的报错文案 */
function isMissingDbObjectError(message: string): boolean {
  return /does not exist|Could not find|schema cache/i.test(message)
}

/** 将 tenants.service_expire_at 的各类 JSON 形态规范为 ISO 字符串，便于 Date 解析 */
function parseServiceExpireAtRaw(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString()
  return null
}

function readOfficialDays(raw: unknown): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

/** tenants.name，用于在线客服等展示「企业名称」 */
export async function fetchTenantEnterpriseName(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  if (error || !data) return null
  const n = typeof data.name === 'string' ? data.name.trim() : ''
  return n || null
}

export async function fetchPrimaryTenantId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id) return null
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.tenant_id) return null
  return data.tenant_id as string
}

export type TenantSubscriptionSnapshot = {
  tenantId: string | null
  /** 运营确认订阅后写入的会员服务截止时刻（ISO） */
  serviceExpireAt: string | null
  /** 累计已确认的正式版权益天数（与运营端订单确认逻辑一致） */
  officialDays: number | null
}

/** 会员剩余使用时间（以 service_expire_at 为准） */
export type MemberUsageRemaining = {
  expireAtIso: string | null
  expireDate: Date | null
  /** 距截止日的剩余日历天（可为负表示已过期） */
  remainDays: number | null
}

export function computeMemberUsageRemaining(serviceExpireAtIso: string | null): MemberUsageRemaining {
  const expireAtIso = parseServiceExpireAtRaw(serviceExpireAtIso)
  if (!expireAtIso) {
    return { expireAtIso: null, expireDate: null, remainDays: null }
  }
  const expireDate = new Date(expireAtIso)
  if (Number.isNaN(expireDate.getTime())) {
    return { expireAtIso: null, expireDate: null, remainDays: null }
  }
  const remainDays = Math.ceil((expireDate.getTime() - Date.now()) / 86400000)
  return { expireAtIso, expireDate, remainDays }
}

export type TenantTrialSnapshot = {
  tenantId: string
  trialDays: number
  trialStartAt: string
  trialEndAt: string
}

function readTrialDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 14
  return Math.max(0, Math.min(3650, Math.floor(n)))
}

/** 试用起止：以 tenants.created_at 为开始，trial_days 为时长（与注册开通一致） */
export async function fetchTenantTrialSnapshot(
  supabase: SupabaseClient,
): Promise<TenantTrialSnapshot | null> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return null

  const { data, error } = await supabase
    .from('tenants')
    .select('created_at, trial_days')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !data) return null

  const createdRaw = typeof data.created_at === 'string' ? data.created_at : ''
  const start = createdRaw ? new Date(createdRaw) : new Date()
  if (Number.isNaN(start.getTime())) return null

  const trialDays = readTrialDays(data.trial_days)
  const end = new Date(start)
  end.setDate(end.getDate() + trialDays)

  return {
    tenantId,
    trialDays,
    trialStartAt: start.toISOString(),
    trialEndAt: end.toISOString(),
  }
}

/** 正式版订阅展示：到期日 + 累计权益天数（同一查询，避免字段类型或会话时机导致漏显） */
export async function fetchTenantSubscriptionSnapshot(
  supabase: SupabaseClient,
): Promise<TenantSubscriptionSnapshot> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { tenantId: null, serviceExpireAt: null, officialDays: null }

  const { data, error } = await supabase
    .from('tenants')
    .select('service_expire_at, official_days')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) {
    if (isMissingDbObjectError(error.message)) {
      return { tenantId, serviceExpireAt: null, officialDays: null }
    }
    throw error
  }

  return {
    tenantId,
    serviceExpireAt: parseServiceExpireAtRaw(data?.service_expire_at),
    officialDays: readOfficialDays(data?.official_days),
  }
}

/** @deprecated 请使用 fetchTenantSubscriptionSnapshot */
export async function fetchTenantServiceExpireAt(
  supabase: SupabaseClient,
): Promise<{ tenantId: string | null; serviceExpireAt: string | null }> {
  const s = await fetchTenantSubscriptionSnapshot(supabase)
  return { tenantId: s.tenantId, serviceExpireAt: s.serviceExpireAt }
}

export async function fetchTenantWalletSummary(supabase: SupabaseClient, tenantId: string) {
  let balance = 0
  let expire: string | null = null

  const walletSelect = await supabase
    .from('tenants')
    .select('wallet_balance_cents, service_expire_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (walletSelect.error) {
    if (!isMissingDbObjectError(walletSelect.error.message)) throw walletSelect.error
    const legacy = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle()
    if (legacy.error) throw legacy.error
  } else {
    const t = walletSelect.data
    balance = typeof t?.wallet_balance_cents === 'number' ? t.wallet_balance_cents : 0
    expire = typeof t?.service_expire_at === 'string' ? t.service_expire_at : null
  }

  const ledgerRes = await supabase
    .from('tenant_wallet_ledger')
    .select('id, delta_cents, balance_after_cents, reason, created_at, ref_order_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(80)

  if (ledgerRes.error) {
    if (!isMissingDbObjectError(ledgerRes.error.message)) throw ledgerRes.error
    return { balanceCents: balance, serviceExpireAt: expire, ledger: [] }
  }

  return { balanceCents: balance, serviceExpireAt: expire, ledger: ledgerRes.data ?? [] }
}

export async function insertMerchantPaymentOrder(
  supabase: SupabaseClient,
  payload: {
    tenantId: string
    orderKind: 'subscription' | 'recharge' | 'refund'
    amountCents: number
    payChannel?: 'wechat' | 'alipay' | null
    clientNote?: string
  },
) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const uid = session?.user?.id ?? null
  const row: Record<string, unknown> = {
    tenant_id: payload.tenantId,
    created_by_user_id: uid,
    order_kind: payload.orderKind,
    amount_cents: payload.amountCents,
    client_note: payload.clientNote ?? null,
    status: 'pending',
  }
  if (payload.orderKind === 'refund') {
    row.pay_channel = null
  } else {
    row.pay_channel = payload.payChannel ?? 'wechat'
  }
  const { error } = await supabase.from('merchant_payment_orders').insert(row)
  if (error) throw error
}

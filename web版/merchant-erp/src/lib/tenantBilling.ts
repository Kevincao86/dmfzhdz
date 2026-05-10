import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST / PG：列或表尚未迁移时的报错文案 */
function isMissingDbObjectError(message: string): boolean {
  return /does not exist|Could not find|schema cache/i.test(message)
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

/**
 * fws 总代/子代：开通子代、权益池、结算汇总
 */
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ensurePartnerXingxuanMpSession } from './partnerXingxuanBootstrapCore.js'
import { supabaseAdminFetch } from './supabaseAdminFetch.js'
import { nodeSupabaseClientOptions } from './nodeSupabaseClientOptions.js'
import type { ErpAiUsageKind } from './erpAiPointsSpendCore.js'
import { computeErpAiPointsCharge } from './erpAiPointsSpendCore.js'

export type PartnerAgentRow = {
  tenantId: string
  name: string
  createdAt: string
  contactPhone: string | null
  loginName: string | null
  clientCount: number
}

export type PartnerAgentEntitlementRow = {
  id: string
  parentTenantId: string
  agentTenantId: string
  agentName: string
  seatLimit: number
  packagePointsQuota: number
  rechargePointsQuota: number
  packagePointsUsed: number
  rechargePointsUsed: number
  packagePointsRemain: number
  rechargePointsRemain: number
  totalRemain: number
  serviceExpireAt: string | null
  note: string | null
  updatedAt: string
}

export type PartnerAgentSettlementRow = {
  agentTenantId: string
  agentName: string
  contactPhone: string | null
  clientCount: number
  packagePointsQuota: number
  packagePointsUsed: number
  rechargePointsQuota: number
  rechargePointsUsed: number
  totalPointsUsed: number
  totalPointsRemain: number
}

function normalizeCnPhone(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2)
  return ''
}

function tenantEmailDomain(): string {
  return (
    process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
    process.env.TENANT_EMAIL_DOMAIN ??
    'users.meoo.test'
  )
    .trim()
    .replace(/^@/, '') || 'users.meoo.test'
}

function loginNameToEmail(loginName: string): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${tenantEmailDomain()}`
}

function randomPassword(): string {
  return `${randomBytes(4).toString('hex')}A1`
}

export async function assertParentPartnerTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const { data, error } = await admin
    .from('tenants')
    .select('id, edition, parent_tenant_id')
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !data?.id) {
    return { ok: false, error: 'tenant_not_found', message: '租户不存在' }
  }
  if (String(data.edition) !== 'partner' || data.parent_tenant_id) {
    return { ok: false, error: 'not_parent_partner', message: '仅总代服务商可执行此操作' }
  }
  return { ok: true }
}

export async function listPartnerAgents(
  admin: SupabaseClient,
  parentTenantId: string,
): Promise<PartnerAgentRow[]> {
  const { data: agents, error } = await admin
    .from('tenants')
    .select('id, name, created_at')
    .eq('parent_tenant_id', parentTenantId)
    .eq('edition', 'partner_agent')
    .order('created_at', { ascending: false })
  if (error || !agents?.length) return []

  const agentIds = agents.map((a) => a.id as string)
  const { data: clients } = await admin
    .from('tenant_partner_clients')
    .select('owner_agent_tenant_id')
    .eq('tenant_id', parentTenantId)
    .in('owner_agent_tenant_id', agentIds)

  const countMap = new Map<string, number>()
  for (const c of clients ?? []) {
    const aid = String(c.owner_agent_tenant_id || '')
    if (!aid) continue
    countMap.set(aid, (countMap.get(aid) ?? 0) + 1)
  }

  const rows: PartnerAgentRow[] = []
  for (const a of agents) {
    const tenantId = a.id as string
    let contactPhone: string | null = null
    let loginName: string | null = null
    const { data: mem } = await admin
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()
    if (mem?.user_id) {
      const { data: userData } = await admin.auth.admin.getUserById(mem.user_id as string)
      const meta = (userData?.user?.user_metadata ?? {}) as { phone?: string; login_name?: string }
      contactPhone = normalizeCnPhone(userData?.user?.phone || meta.phone) || null
      loginName = typeof meta.login_name === 'string' ? meta.login_name : null
    }
    rows.push({
      tenantId,
      name: String(a.name || ''),
      createdAt: String(a.created_at || ''),
      contactPhone,
      loginName,
      clientCount: countMap.get(tenantId) ?? 0,
    })
  }
  return rows
}

export async function provisionPartnerAgentTenant(input: {
  supabaseUrl: string
  serviceRole: string
  parentTenantId: string
  companyName: string
  contactPhone: string
  password?: string
}): Promise<
  | {
      ok: true
      tenantId: string
      userId: string
      loginName: string
      email: string
      tempPassword: string
    }
  | { ok: false; error: string; message: string; detail?: string }
> {
  const phone = normalizeCnPhone(input.contactPhone)
  const companyName = String(input.companyName || '').trim()
  if (!phone) return { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' }
  if (companyName.length < 2) return { ok: false, error: 'invalid_name', message: '代理公司名称至少 2 字' }

  const admin = createClient(input.supabaseUrl, input.serviceRole, nodeSupabaseClientOptions())
  const parentCheck = await assertParentPartnerTenant(admin, input.parentTenantId)
  if (!parentCheck.ok) return parentCheck

  const loginName = `ag${phone}`
  const password = String(input.password || '').trim() || randomPassword()
  const email = loginNameToEmail(loginName)
  const base = input.supabaseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    apikey: input.serviceRole,
    Authorization: `Bearer ${input.serviceRole}`,
    'Content-Type': 'application/json',
  }

  let userId: string | undefined
  const createRes = await supabaseAdminFetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      phone: `+86${phone}`,
      user_metadata: {
        login_name: loginName,
        merchant_name: companyName,
        phone,
        partner_agent: true,
        parent_tenant_id: input.parentTenantId,
      },
    }),
  })
  const createText = await createRes.text()
  let createJson: { id?: string; msg?: string; message?: string } = {}
  try {
    createJson = JSON.parse(createText) as typeof createJson
  } catch {
    /* ignore */
  }
  if (!createRes.ok) {
    const msg = String(createJson.msg ?? createJson.message ?? createText).toLowerCase()
    if (msg.includes('already') || msg.includes('registered')) {
      return { ok: false, error: 'phone_exists', message: '该手机号已注册，请更换负责人手机号' }
    }
    return { ok: false, error: 'auth_create_failed', message: '创建子代账号失败', detail: createText.slice(0, 200) }
  }
  userId = createJson.id
  if (!userId) return { ok: false, error: 'auth_create_failed', message: '创建子代账号失败' }

  const tenantRes = await supabaseAdminFetch(`${base}/rest/v1/tenants`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: companyName,
      trial_days: 0,
      official_days: 0,
      account_status: 'normal',
      membership_plan: 'free',
      edition: 'partner_agent',
      parent_tenant_id: input.parentTenantId,
    }),
  })
  const tenantText = await tenantRes.text()
  let tenantRows: { id: string }[] = []
  try {
    tenantRows = JSON.parse(tenantText) as { id: string }[]
  } catch {
    tenantRows = []
  }
  const tenantId = tenantRows[0]?.id
  if (!tenantRes.ok || !tenantId) {
    await supabaseAdminFetch(`${base}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers })
    return { ok: false, error: 'tenant_insert_failed', message: '创建子代租户失败', detail: tenantText.slice(0, 200) }
  }

  const memRes = await supabaseAdminFetch(`${base}/rest/v1/tenant_members`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role: 'owner' }),
  })
  if (!memRes.ok) {
    await supabaseAdminFetch(`${base}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers })
    await supabaseAdminFetch(`${base}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers })
    return { ok: false, error: 'member_insert_failed', message: '关联子代成员失败' }
  }

  await admin.from('tenant_agent_entitlements').upsert(
    {
      parent_tenant_id: input.parentTenantId,
      agent_tenant_id: tenantId,
      seat_limit: 1,
      package_points_quota: 0,
      recharge_points_quota: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'parent_tenant_id,agent_tenant_id' },
  )

  void ensurePartnerXingxuanMpSession({
    supabaseUrl: input.supabaseUrl,
    serviceRole: input.serviceRole,
    tenantId,
    phone,
    companyName,
  })

  return { ok: true, tenantId, userId, loginName, email, tempPassword: password }
}

function parseEntitlementRow(
  raw: Record<string, unknown>,
  agentName: string,
): PartnerAgentEntitlementRow {
  const pkgQ = Number(raw.package_points_quota) || 0
  const recQ = Number(raw.recharge_points_quota) || 0
  const pkgU = Number(raw.package_points_used) || 0
  const recU = Number(raw.recharge_points_used) || 0
  const pkgR = Math.max(0, pkgQ - pkgU)
  const recR = Math.max(0, recQ - recU)
  return {
    id: String(raw.id || ''),
    parentTenantId: String(raw.parent_tenant_id || ''),
    agentTenantId: String(raw.agent_tenant_id || ''),
    agentName,
    seatLimit: Number(raw.seat_limit) || 0,
    packagePointsQuota: pkgQ,
    rechargePointsQuota: recQ,
    packagePointsUsed: pkgU,
    rechargePointsUsed: recU,
    packagePointsRemain: pkgR,
    rechargePointsRemain: recR,
    totalRemain: pkgR + recR,
    serviceExpireAt:
      typeof raw.service_expire_at === 'string' ? raw.service_expire_at : null,
    note: typeof raw.note === 'string' ? raw.note : null,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

export async function listPartnerAgentEntitlements(
  admin: SupabaseClient,
  tenantId: string,
  profile: { isParent: boolean; isAgent: boolean; parentTenantId: string | null },
): Promise<PartnerAgentEntitlementRow[]> {
  const parentId = profile.isAgent && profile.parentTenantId ? profile.parentTenantId : tenantId
  let q = admin
    .from('tenant_agent_entitlements')
    .select(
      'id, parent_tenant_id, agent_tenant_id, seat_limit, package_points_quota, recharge_points_quota, package_points_used, recharge_points_used, service_expire_at, note, updated_at',
    )
    .eq('parent_tenant_id', parentId)
  if (profile.isAgent) q = q.eq('agent_tenant_id', tenantId)

  const { data, error } = await q.order('updated_at', { ascending: false })
  if (error || !data?.length) return []

  const agentIds = data.map((r) => String(r.agent_tenant_id))
  const { data: agents } = await admin.from('tenants').select('id, name').in('id', agentIds)
  const nameMap = new Map((agents ?? []).map((a) => [String(a.id), String(a.name || '')]))

  return data.map((r) =>
    parseEntitlementRow(r as Record<string, unknown>, nameMap.get(String(r.agent_tenant_id)) ?? '子代理'),
  )
}

export async function upsertPartnerAgentEntitlement(
  admin: SupabaseClient,
  parentTenantId: string,
  input: {
    agentTenantId: string
    seatLimit?: number
    packagePointsQuota?: number
    rechargePointsQuota?: number
    serviceExpireAt?: string | null
    note?: string | null
  },
): Promise<PartnerAgentEntitlementRow | null> {
  const parentCheck = await assertParentPartnerTenant(admin, parentTenantId)
  if (!parentCheck.ok) return null

  const { data: agent } = await admin
    .from('tenants')
    .select('id, name, parent_tenant_id, edition')
    .eq('id', input.agentTenantId)
    .maybeSingle()
  if (!agent?.id || String(agent.edition) !== 'partner_agent') return null
  if (String(agent.parent_tenant_id) !== parentTenantId) return null

  const patch: Record<string, unknown> = {
    parent_tenant_id: parentTenantId,
    agent_tenant_id: input.agentTenantId,
    updated_at: new Date().toISOString(),
  }
  if (input.seatLimit != null) patch.seat_limit = Math.max(0, Math.floor(input.seatLimit))
  if (input.packagePointsQuota != null) {
    patch.package_points_quota = Math.max(0, Math.floor(input.packagePointsQuota))
  }
  if (input.rechargePointsQuota != null) {
    patch.recharge_points_quota = Math.max(0, Math.floor(input.rechargePointsQuota))
  }
  if (input.serviceExpireAt !== undefined) patch.service_expire_at = input.serviceExpireAt
  if (input.note !== undefined) patch.note = input.note

  const { data, error } = await admin
    .from('tenant_agent_entitlements')
    .upsert(patch, { onConflict: 'parent_tenant_id,agent_tenant_id' })
    .select(
      'id, parent_tenant_id, agent_tenant_id, seat_limit, package_points_quota, recharge_points_quota, package_points_used, recharge_points_used, service_expire_at, note, updated_at',
    )
    .maybeSingle()
  if (error || !data) return null
  return parseEntitlementRow(data as Record<string, unknown>, String(agent.name || '子代理'))
}

export async function buildPartnerAgentSettlement(
  admin: SupabaseClient,
  parentTenantId: string,
): Promise<PartnerAgentSettlementRow[]> {
  const agents = await listPartnerAgents(admin, parentTenantId)
  const entitlements = await listPartnerAgentEntitlements(admin, parentTenantId, {
    isParent: true,
    isAgent: false,
    parentTenantId: null,
  })
  const entMap = new Map(entitlements.map((e) => [e.agentTenantId, e]))

  return agents.map((a) => {
    const ent = entMap.get(a.tenantId)
    const pkgQ = ent?.packagePointsQuota ?? 0
    const pkgU = ent?.packagePointsUsed ?? 0
    const recQ = ent?.rechargePointsQuota ?? 0
    const recU = ent?.rechargePointsUsed ?? 0
    return {
      agentTenantId: a.tenantId,
      agentName: a.name,
      contactPhone: a.contactPhone,
      clientCount: a.clientCount,
      packagePointsQuota: pkgQ,
      packagePointsUsed: pkgU,
      rechargePointsQuota: recQ,
      rechargePointsUsed: recU,
      totalPointsUsed: pkgU + recU,
      totalPointsRemain: Math.max(0, pkgQ - pkgU) + Math.max(0, recQ - recU),
    }
  })
}

export type AgentEntitlementSpendResult =
  | { ok: true; pointsCharged: number; balance: number; already?: boolean }
  | { ok: false; error: string; message: string; required?: number; balance?: number }

export async function assertAgentEntitlementAffordable(
  admin: SupabaseClient,
  agentTenantId: string,
  kind: ErpAiUsageKind,
  opts?: { durationSec?: number },
): Promise<AgentEntitlementSpendResult> {
  const { data: agent } = await admin
    .from('tenants')
    .select('id, parent_tenant_id, edition')
    .eq('id', agentTenantId)
    .maybeSingle()
  if (!agent?.id || String(agent.edition) !== 'partner_agent' || !agent.parent_tenant_id) {
    return { ok: false, error: 'not_agent', message: '非子代租户' }
  }

  const cost = computeErpAiPointsCharge(kind, { durationSec: opts?.durationSec })
  if (cost <= 0) return { ok: false, error: 'invalid_amount', message: '无效扣费类型' }

  const { data: ent, error } = await admin
    .from('tenant_agent_entitlements')
    .select(
      'id, package_points_quota, recharge_points_quota, package_points_used, recharge_points_used',
    )
    .eq('agent_tenant_id', agentTenantId)
    .eq('parent_tenant_id', agent.parent_tenant_id)
    .maybeSingle()
  if (error || !ent?.id) {
    return { ok: false, error: 'no_entitlement', message: '总代尚未分配权益额度' }
  }

  const pkgRemain = Math.max(
    0,
    Number(ent.package_points_quota) - Number(ent.package_points_used),
  )
  const recRemain = Math.max(
    0,
    Number(ent.recharge_points_quota) - Number(ent.recharge_points_used),
  )
  const balance = pkgRemain + recRemain
  if (balance < cost) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: '子代分配额度不足，请联系总代追加权益',
      required: cost,
      balance,
    }
  }
  return { ok: true, pointsCharged: 0, balance }
}

export async function spendAgentEntitlementPoints(
  admin: SupabaseClient,
  agentTenantId: string,
  kind: ErpAiUsageKind,
  opts?: { durationSec?: number; idempotencyKey?: string },
): Promise<AgentEntitlementSpendResult> {
  const { data: agent } = await admin
    .from('tenants')
    .select('id, parent_tenant_id, edition')
    .eq('id', agentTenantId)
    .maybeSingle()
  if (!agent?.id || String(agent.edition) !== 'partner_agent' || !agent.parent_tenant_id) {
    return { ok: false, error: 'not_agent', message: '非子代租户' }
  }

  const cost = computeErpAiPointsCharge(kind, { durationSec: opts?.durationSec })
  if (cost <= 0) return { ok: false, error: 'invalid_amount', message: '无效扣费类型' }

  const { data: ent, error } = await admin
    .from('tenant_agent_entitlements')
    .select(
      'id, package_points_quota, recharge_points_quota, package_points_used, recharge_points_used',
    )
    .eq('agent_tenant_id', agentTenantId)
    .eq('parent_tenant_id', agent.parent_tenant_id)
    .maybeSingle()
  if (error || !ent?.id) {
    return { ok: false, error: 'no_entitlement', message: '总代尚未分配权益额度' }
  }

  const pkgRemain = Math.max(
    0,
    Number(ent.package_points_quota) - Number(ent.package_points_used),
  )
  const recRemain = Math.max(
    0,
    Number(ent.recharge_points_quota) - Number(ent.recharge_points_used),
  )
  const balance = pkgRemain + recRemain
  if (balance < cost) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: '子代分配额度不足，请联系总代追加权益',
      required: cost,
      balance,
    }
  }

  let pkgCharge = Math.min(pkgRemain, cost)
  let recCharge = cost - pkgCharge
  const patch = {
    package_points_used: Number(ent.package_points_used) + pkgCharge,
    recharge_points_used: Number(ent.recharge_points_used) + recCharge,
    updated_at: new Date().toISOString(),
  }
  const { error: upErr } = await admin
    .from('tenant_agent_entitlements')
    .update(patch)
    .eq('id', ent.id)
  if (upErr) {
    return { ok: false, error: 'update_failed', message: '扣减子代额度失败' }
  }

  return {
    ok: true,
    pointsCharged: cost,
    balance: balance - cost,
  }
}

export async function resolvePartnerBillingContext(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{
  billingTenantId: string
  edition: string
  isAgent: boolean
  parentTenantId: string | null
} | null> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, edition, parent_tenant_id')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant?.id) return null
  const edition = String(tenant.edition || '')
  if (edition !== 'partner' && edition !== 'partner_agent') return null
  return {
    billingTenantId: tenant.id as string,
    edition,
    isAgent: edition === 'partner_agent',
    parentTenantId:
      typeof tenant.parent_tenant_id === 'string' ? tenant.parent_tenant_id : null,
  }
}

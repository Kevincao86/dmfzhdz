import type { OpsCustomer } from './mockData'
import type { RegistryTenant } from './opsRegistryApi'
import { computeTenantUsageMetrics, type TenantUsageMetrics } from './opsTenantUsageStats'

const PLAN_ZH: Record<string, string> = {
  free: '免费版',
  member: '会员版',
  member_plus: '会员 Plus',
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function planExpireLine(t: RegistryTenant): string {
  const parts: string[] = []
  if (t.serviceExpireAt) parts.push(`服务至 ${fmt(t.serviceExpireAt)}`)
  if (t.officialEndsAt) parts.push(`正式至 ${fmt(t.officialEndsAt)}`)
  return parts.join('；') || '—'
}

export function registryTenantToOpsCustomer(
  t: RegistryTenant,
  opts?: {
    usage?: TenantUsageMetrics
    talentRecruitCount?: number
    talentOrderCount?: number
    storeCount?: number
    storeStatusSummary?: string
  },
): OpsCustomer {
  const tag =
    t.source === 'erp' ? 'ERP 同步' : t.source === 'supabase' ? 'Supabase' : '运营创建'
  const loginLabel = String(t.loginName ?? '—').trim() || '—'
  const merchantLabel = String(t.merchantName ?? '—').trim() || '—'
  const usage =
    opts?.usage ??
    computeTenantUsageMetrics({
      createdAt: t.registeredAt,
      updatedAt: t.updatedAt,
    })
  return {
    id: t.id,
    companyName: merchantLabel,
    contactName: `${loginLabel}（${tag}）`,
    phone:
      typeof t.phone === 'string' && t.phone.trim()
        ? t.phone.trim()
        : t.source === 'erp'
          ? '同步'
          : t.source === 'supabase'
            ? '—'
            : '—',
    industry: t.industry || '—',
    registeredAt: fmt(t.registeredAt),
    accountStatus: t.accountStatus,
    planName: (() => {
      const base = PLAN_ZH[t.membershipPlan ?? 'free'] ?? '免费版'
      const sub = t.subscriptionDays ?? t.officialDays
      const gift = t.opsGiftDays ?? 0
      const total = (sub > 0 || gift > 0 ? sub + gift : t.officialDays) || 0
      if (total <= 0) return base
      if (gift > 0) return `${base} · 权益 ${total} 天（订${sub}+赠${gift}）`
      return `${base} · 权益 ${total} 天`
    })(),
    planExpireAt: planExpireLine(t),
    payStatus: t.accountStatus === 'normal' ? 'paid' : t.accountStatus === 'frozen' ? 'overdue' : 'unpaid',
    firstLoginAt: usage.firstLoginAt,
    lastLoginAt: usage.lastLoginAt,
    activeDays: usage.activeDays,
    dau: usage.dau,
    wau: usage.wau,
    mau: usage.mau,
    storeCount: opts?.storeCount ?? 0,
    storeStatusSummary: opts?.storeStatusSummary ?? '—',
    talentRecruitCount: opts?.talentRecruitCount ?? 0,
    talentOrderCount: opts?.talentOrderCount ?? 0,
    walletBalanceYuan:
      typeof t.walletBalanceCents === 'number' && Number.isFinite(t.walletBalanceCents)
        ? Math.round((t.walletBalanceCents / 100) * 100) / 100
        : undefined,
  }
}

export function tenantsToCustomers(tenants: RegistryTenant[]): OpsCustomer[] {
  return tenants.map(registryTenantToOpsCustomer)
}

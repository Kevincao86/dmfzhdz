import type { OpsCustomer } from './mockData'
import type { RegistryTenant } from './opsRegistryApi'

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
  if (t.trialEndsAt) parts.push(`试用至 ${fmt(t.trialEndsAt)}`)
  if (t.officialEndsAt) parts.push(`正式至 ${fmt(t.officialEndsAt)}`)
  return parts.join('；') || '—'
}

export function registryTenantToOpsCustomer(t: RegistryTenant): OpsCustomer {
  const tag =
    t.source === 'erp' ? 'ERP 同步' : t.source === 'supabase' ? 'Supabase' : '运营创建'
  return {
    id: t.id,
    companyName: t.merchantName,
    contactName: `${t.loginName}（${tag}）`,
    phone: t.source === 'erp' ? '同步' : t.source === 'supabase' ? 'Auth' : '—',
    industry: t.industry || '—',
    registeredAt: fmt(t.registeredAt),
    accountStatus: t.accountStatus,
    planName: `试用 ${t.trialDays} 天 / 正式 ${t.officialDays} 天`,
    planExpireAt: planExpireLine(t),
    payStatus: t.accountStatus === 'normal' ? 'paid' : t.accountStatus === 'frozen' ? 'overdue' : 'unpaid',
    firstLoginAt: '—',
    lastLoginAt: fmt(t.updatedAt),
    activeDays: 0,
    dau: 0,
    wau: 0,
    mau: 0,
    storeCount: 0,
    storeStatusSummary: '—',
    talentRecruitCount: 0,
    talentOrderCount: 0,
    walletBalanceYuan:
      typeof t.walletBalanceCents === 'number' && Number.isFinite(t.walletBalanceCents)
        ? Math.round((t.walletBalanceCents / 100) * 100) / 100
        : undefined,
  }
}

export function tenantsToCustomers(tenants: RegistryTenant[]): OpsCustomer[] {
  return tenants.map(registryTenantToOpsCustomer)
}

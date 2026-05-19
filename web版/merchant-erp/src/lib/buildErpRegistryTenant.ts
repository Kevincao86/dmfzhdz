import type { RegistryTenant } from './opsRegistryTypes'
import {
  ERP_REGISTRY_TENANT_ID,
  MEOO_MERCHANT_DISPLAY_NAME_KEY,
  MEOO_OFFICIAL_REMAINING_DAYS_KEY,
  MEOO_TRIAL_SNAPSHOT_KEY,
} from './opsRegistryConstants'
import { readSubAccounts } from './subAccountsStorage'

function readTrialSnapshot(): { trialStart: string; trialEnd: string } | null {
  try {
    const raw = window.localStorage.getItem(MEOO_TRIAL_SNAPSHOT_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as { trialStart?: string; trialEnd?: string }
    if (typeof j.trialStart === 'string' && typeof j.trialEnd === 'string') return { trialStart: j.trialStart, trialEnd: j.trialEnd }
  } catch {
    /* ignore */
  }
  return null
}

function readOfficialRemainingDays(): number {
  try {
    const raw = window.localStorage.getItem(MEOO_OFFICIAL_REMAINING_DAYS_KEY)?.trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= 0) return Math.min(36500, Math.floor(n))
  } catch {
    /* ignore */
  }
  return 365
}

function diffDays(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86400000))
}

/**
 * 从当前浏览器 ERP 状态构造一条同步到运营管控台的租户记录（dev 注册表）。
 * 无子账号时返回 null（不同步占位行）。
 */
export function buildErpRegistryTenant(): RegistryTenant | null {
  const subs = readSubAccounts()
  if (subs.length === 0) return null

  const sorted = [...subs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const primary = sorted.find((s) => s.jobRoleId === 'job_builtin_admin') ?? sorted[0]

  const merchantName =
    window.localStorage.getItem(MEOO_MERCHANT_DISPLAY_NAME_KEY)?.trim() || '墨典 ERP 商户'

  const trialSnap = readTrialSnapshot()
  const now = new Date()
  let trialDays = 0
  let trialEndsAt: string | undefined
  if (trialSnap) {
    const ts = new Date(trialSnap.trialStart)
    const te = new Date(trialSnap.trialEnd)
    trialDays = diffDays(ts, te)
    trialEndsAt = te.toISOString()
  }

  const officialDays = readOfficialRemainingDays()
  const officialEndsAt = (() => {
    const d = trialEndsAt ? new Date(trialEndsAt) : new Date(now)
    d.setDate(d.getDate() + officialDays)
    return d.toISOString()
  })()

  const active = subs.filter((s) => s.status === 'active')
  const accountStatus = active.length === 0 ? 'disabled' : 'normal'

  return {
    id: ERP_REGISTRY_TENANT_ID,
    source: 'erp',
    loginName: primary.loginName,
    merchantName,
    industry: '综合服务',
    registeredAt: sorted[0]?.createdAt ?? now.toISOString(),
    accountStatus,
    trialDays,
    officialDays,
    trialEndsAt,
    officialEndsAt,
    updatedAt: now.toISOString(),
  }
}

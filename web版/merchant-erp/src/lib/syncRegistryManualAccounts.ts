import type { RegistryFile, RegistryTenant } from './opsRegistryTypes'
import { readSubAccounts, writeSubAccounts } from './subAccountsStorage'

const ADMIN_JOB = 'job_builtin_admin'

function safeSyncId(tenantId: string): string {
  const s = tenantId.replace(/\W/g, '_').slice(0, 40)
  return `ops_reg_${s || 'row'}`
}

/**
 * 将运营端「手动创建」的租户写入 ERP 子账号表（同 login + SHA-256 密码摘要），以便在 ERP 用该账号登录。
 */
export function syncManualTenantsFromRegistry(reg: RegistryFile): void {
  const manual = reg.tenants.filter(
    (t): t is RegistryTenant & { passwordHash: string } =>
      t.source === 'ops_manual' && Boolean(t.loginName?.trim()) && Boolean(t.passwordHash),
  )
  if (manual.length === 0) return

  const next = [...readSubAccounts()]
  let changed = false

  for (const t of manual) {
    const i = next.findIndex((a) => a.loginName === t.loginName)
    const status = t.accountStatus === 'disabled' ? 'disabled' : 'active'
    if (i < 0) {
      next.push({
        id: safeSyncId(t.id),
        loginName: t.loginName.trim(),
        passwordHash: t.passwordHash,
        jobRoleId: ADMIN_JOB,
        status,
        createdAt: t.registeredAt || new Date().toISOString(),
      })
      changed = true
      continue
    }
    const cur = next[i]!
    if (cur.passwordHash !== t.passwordHash || cur.status !== status) {
      next[i] = { ...cur, passwordHash: t.passwordHash, status }
      changed = true
    }
  }

  if (changed) writeSubAccounts(next)
}

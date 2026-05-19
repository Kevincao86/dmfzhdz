/**
 * 子账号与岗位（RBAC）：按 Supabase 租户隔离 localStorage。
 * 子账号仅支持账号 + 密码；密码仅存 SHA-256 摘要。
 * 权限挂在「岗位」上，子账号通过 jobRoleId 绑定岗位。
 */

import { tenantLocalKey } from './tenantLocalState'

export const SUB_ACCOUNTS_STORAGE_KEY = 'meoo_sub_accounts_v1'
export const JOB_ROLES_STORAGE_KEY = 'meoo_job_roles_v1'

function subAccountsKey(): string {
  return tenantLocalKey(SUB_ACCOUNTS_STORAGE_KEY)
}

function jobRolesKey(): string {
  return tenantLocalKey(JOB_ROLES_STORAGE_KEY)
}

export const PERMISSION_MODULES = [
  { key: 'store', label: '门店管理' },
  { key: 'products', label: '商品管理' },
  { key: 'talent', label: '达人招募管理' },
  { key: 'ads', label: '投流管理' },
  { key: 'finance', label: '财务管理' },
  { key: 'reviews', label: '评论管理' },
  { key: 'leads', label: '线索管理' },
  { key: 'settings', label: '系统设置' },
] as const

export type PermissionKey = (typeof PERMISSION_MODULES)[number]['key']

/** 兼容旧版子账号上的 role 枚举 */
export type LegacySubAccountRole = 'admin' | 'ops' | 'service' | 'finance'

export type JobRoleRecord = {
  id: string
  name: string
  /** 系统预置岗位不可删除 */
  builtIn: boolean
  permissions: PermissionKey[]
  createdAt: string
}

export type SubAccountRecord = {
  id: string
  loginName: string
  passwordHash: string
  jobRoleId: string
  status: 'active' | 'disabled'
  createdAt: string
  /** 与 Supabase auth.users.id 对应，便于云端重置/删除 */
  cloudUserId?: string
}


const BUILTIN_IDS: Record<LegacySubAccountRole, string> = {
  admin: 'job_builtin_admin',
  ops: 'job_builtin_ops',
  service: 'job_builtin_service',
  finance: 'job_builtin_finance',
}

function allPermissionKeys(): PermissionKey[] {
  return PERMISSION_MODULES.map((m) => m.key)
}

function defaultPermissionsForLegacyRole(role: LegacySubAccountRole): PermissionKey[] {
  switch (role) {
    case 'admin':
      return allPermissionKeys()
    case 'ops':
      return ['store', 'products', 'talent', 'ads', 'reviews', 'leads']
    case 'service':
      return ['reviews', 'leads']
    case 'finance':
      return ['finance']
  }
}

function seedBuiltInJobRoles(): JobRoleRecord[] {
  const now = new Date().toISOString()
  return [
    {
      id: BUILTIN_IDS.admin,
      name: '管理员',
      builtIn: true,
      permissions: defaultPermissionsForLegacyRole('admin'),
      createdAt: now,
    },
    {
      id: BUILTIN_IDS.ops,
      name: '运营',
      builtIn: true,
      permissions: defaultPermissionsForLegacyRole('ops'),
      createdAt: now,
    },
    {
      id: BUILTIN_IDS.service,
      name: '客服',
      builtIn: true,
      permissions: defaultPermissionsForLegacyRole('service'),
      createdAt: now,
    },
    {
      id: BUILTIN_IDS.finance,
      name: '财务',
      builtIn: true,
      permissions: defaultPermissionsForLegacyRole('finance'),
      createdAt: now,
    },
  ]
}

function isPermissionKey(x: string): x is PermissionKey {
  return PERMISSION_MODULES.some((m) => m.key === x)
}

function parsePermissions(raw: unknown): PermissionKey[] {
  const permissions: PermissionKey[] = []
  if (!Array.isArray(raw)) return permissions
  for (const p of raw) {
    if (typeof p === 'string' && isPermissionKey(p)) permissions.push(p)
  }
  return permissions
}

function parseJobRole(raw: unknown): JobRoleRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  const builtIn = o.builtIn === true
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : ''
  const permissions = parsePermissions(o.permissions)
  if (!id || !name || !createdAt) return null
  return { id, name, builtIn, permissions, createdAt }
}

export function readJobRoles(): JobRoleRecord[] {
  try {
    const raw = window.localStorage.getItem(jobRolesKey())
    if (!raw) {
      const seeded = seedBuiltInJobRoles()
      window.localStorage.setItem(jobRolesKey(), JSON.stringify(seeded))
      return seeded
    }
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return seedBuiltInJobRoles()
    const out: JobRoleRecord[] = []
    for (const row of j) {
      const r = parseJobRole(row)
      if (r) out.push(r)
    }
    const ids = new Set(out.map((x) => x.id))
    let changed = false
    for (const b of seedBuiltInJobRoles()) {
      if (!ids.has(b.id)) {
        out.unshift(b)
        changed = true
      }
    }
    if (changed) writeJobRoles(out)
    return out
  } catch {
    const seeded = seedBuiltInJobRoles()
    window.localStorage.setItem(jobRolesKey(), JSON.stringify(seeded))
    return seeded
  }
}

export function writeJobRoles(list: JobRoleRecord[]): void {
  window.localStorage.setItem(jobRolesKey(), JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('meoo-job-roles-changed'))
  window.dispatchEvent(new CustomEvent('meoo-subaccounts-changed'))
}

export function upsertJobRole(next: JobRoleRecord): void {
  const list = readJobRoles()
  const i = list.findIndex((x) => x.id === next.id)
  if (i >= 0) list[i] = next
  else list.push(next)
  writeJobRoles(list)
}

/** 删除自定义岗位；若仍有子账号引用则返回 false */
export function removeJobRoleIfUnused(id: string): boolean {
  const list = readJobRoles()
  const role = list.find((r) => r.id === id)
  if (!role || role.builtIn) return false
  if (readSubAccounts().some((a) => a.jobRoleId === id)) return false
  writeJobRoles(list.filter((r) => r.id !== id))
  return true
}

export function getJobRoleById(id: string): JobRoleRecord | undefined {
  return readJobRoles().find((r) => r.id === id)
}

export function resolveJobRoleLabel(jobRoleId: string): string {
  return getJobRoleById(jobRoleId)?.name ?? '未知岗位'
}

export function countSubAccountsForJobRole(jobRoleId: string): number {
  return readSubAccounts().filter((a) => a.jobRoleId === jobRoleId).length
}

export async function hashPassword(plain: string): Promise<string> {
  const enc = new TextEncoder().encode(plain)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseAccount(raw: unknown): SubAccountRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : ''
  const loginName = typeof o.loginName === 'string' ? o.loginName.trim() : ''
  const passwordHash = typeof o.passwordHash === 'string' ? o.passwordHash : ''
  const status = o.status === 'disabled' ? 'disabled' : 'active'
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : ''

  let jobRoleId = typeof o.jobRoleId === 'string' ? o.jobRoleId.trim() : ''
  if (!jobRoleId) {
    const legacy =
      o.role === 'admin' || o.role === 'ops' || o.role === 'service' || o.role === 'finance' ? o.role : null
    if (legacy) jobRoleId = BUILTIN_IDS[legacy]
  }
  if (!id || !loginName || !passwordHash || !jobRoleId || !createdAt) return null
  const cloudUserId = typeof o.cloudUserId === 'string' && o.cloudUserId.trim() ? o.cloudUserId.trim() : undefined
  return { id, loginName, passwordHash, jobRoleId, status, createdAt, cloudUserId }
}

export function readSubAccounts(): SubAccountRecord[] {
  readJobRoles()
  try {
    const raw = window.localStorage.getItem(subAccountsKey())
    if (!raw) return []
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    let needMigrate = false
    const out: SubAccountRecord[] = []
    for (const row of j) {
      if (row && typeof row === 'object') {
        const o = row as Record<string, unknown>
        const hasJob = typeof o.jobRoleId === 'string' && o.jobRoleId.trim().length > 0
        const legacy =
          o.role === 'admin' || o.role === 'ops' || o.role === 'service' || o.role === 'finance' ? o.role : null
        if (!hasJob && legacy) needMigrate = true
      }
      const r = parseAccount(row)
      if (r) out.push(r)
    }
    if (needMigrate) writeSubAccounts(out)
    return out
  } catch {
    return []
  }
}

export function writeSubAccounts(list: SubAccountRecord[]): void {
  window.localStorage.setItem(subAccountsKey(), JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('meoo-subaccounts-changed'))
}

export function upsertSubAccount(next: SubAccountRecord): void {
  const list = readSubAccounts()
  const i = list.findIndex((x) => x.id === next.id)
  if (i >= 0) list[i] = next
  else list.push(next)
  writeSubAccounts(list)
}

export function removeSubAccount(id: string): void {
  writeSubAccounts(readSubAccounts().filter((x) => x.id !== id))
}

export function newJobRoleId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 运营管控台登录账号（主账号 + 子账号），浏览器 localStorage 持久化。
 * 密码仅存 SHA-256 摘要。
 */

export const OPS_SESSION_KEY = 'meoo_ops_login_v2'

export const OPS_MASTER_PHONE = '18768501283'
export const OPS_MASTER_DEFAULT_PASSWORD = 'kaiyedaji888'

const OPS_STAFF_STORAGE_KEY = 'meoo_ops_staff_accounts_v1'

export const OPS_PERMISSION_MODULES = [
  { key: 'customers', label: '客户管理', pathPrefix: '/customers' },
  { key: 'announcements', label: '公告栏推送', pathPrefix: '/announcements' },
  { key: 'payment_orders', label: '订单管理', pathPrefix: '/payment-orders' },
  { key: 'recruitment_orders', label: '商家达人招募订单', pathPrefix: '/recruitment-orders' },
  { key: 'mp_recruitment_orders', label: '小程序达人招募订单', pathPrefix: '/mp-recruitment-orders' },
  { key: 'talent_library', label: '墨典达人库', pathPrefix: '/talent-library' },
  { key: 'ai_models', label: 'AI 模型', pathPrefix: '/ai-models' },
  { key: 'support', label: '在线客服', pathPrefix: '/support' },
] as const

export type OpsPermissionKey = (typeof OPS_PERMISSION_MODULES)[number]['key']

export type OpsStaffRole = 'super_admin' | 'sub_admin'

export type OpsStaffAccount = {
  id: string
  phone: string
  displayName: string
  role: OpsStaffRole
  passwordHash: string
  permissions: OpsPermissionKey[]
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

export type OpsSession = {
  accountId: string
  phone: string
  displayName: string
  role: OpsStaffRole
  permissions: OpsPermissionKey[]
  loginAt: string
}

export async function hashOpsPassword(plain: string): Promise<string> {
  const enc = new TextEncoder().encode(plain)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function allPermissionKeys(): OpsPermissionKey[] {
  return OPS_PERMISSION_MODULES.map((m) => m.key)
}

function uid(): string {
  return `ops_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function parseAccount(raw: unknown): OpsStaffAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : ''
  const phone = typeof o.phone === 'string' ? o.phone.replace(/\D/g, '').slice(0, 11) : ''
  const displayName = typeof o.displayName === 'string' ? o.displayName.trim() : ''
  const role: OpsStaffRole = o.role === 'super_admin' ? 'super_admin' : 'sub_admin'
  const passwordHash = typeof o.passwordHash === 'string' ? o.passwordHash : ''
  const status = o.status === 'disabled' ? 'disabled' : 'active'
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : ''
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : createdAt
  const permissions = Array.isArray(o.permissions)
    ? o.permissions.filter((p): p is OpsPermissionKey =>
        OPS_PERMISSION_MODULES.some((m) => m.key === p),
      )
    : []
  if (!id || phone.length !== 11 || !passwordHash || !createdAt) return null
  return {
    id,
    phone,
    displayName: displayName || phone,
    role,
    passwordHash,
    permissions: role === 'super_admin' ? allPermissionKeys() : permissions,
    status,
    createdAt,
    updatedAt,
  }
}

export function readOpsStaffAccounts(): OpsStaffAccount[] {
  try {
    const raw = localStorage.getItem(OPS_STAFF_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseAccount).filter((x): x is OpsStaffAccount => x != null)
  } catch {
    return []
  }
}

function writeOpsStaffAccounts(accounts: OpsStaffAccount[]): void {
  const serialized = JSON.stringify(accounts)
  if (localStorage.getItem(OPS_STAFF_STORAGE_KEY) === serialized) return
  localStorage.setItem(OPS_STAFF_STORAGE_KEY, serialized)
  window.dispatchEvent(new CustomEvent('meoo-ops-staff-changed'))
}

/** 确保主账号存在且密码为当前默认（无变更时不写入，避免触发 storage 事件死循环） */
export async function ensureOpsMasterAccount(): Promise<void> {
  const list = readOpsStaffAccounts()
  const hash = await hashOpsPassword(OPS_MASTER_DEFAULT_PASSWORD)
  const perms = allPermissionKeys()
  const now = new Date().toISOString()
  const idx = list.findIndex((a) => a.phone === OPS_MASTER_PHONE)
  const hasExtraSuperAdmin = list.some((a) => a.role === 'super_admin' && a.phone !== OPS_MASTER_PHONE)

  if (idx >= 0) {
    const cur = list[idx]!
    const displayName = cur.displayName || '超级管理员'
    const masterChanged =
      cur.role !== 'super_admin' ||
      cur.passwordHash !== hash ||
      cur.status !== 'active' ||
      cur.displayName !== displayName ||
      JSON.stringify(cur.permissions) !== JSON.stringify(perms)

    const nextMaster: OpsStaffAccount = {
      ...cur,
      role: 'super_admin',
      passwordHash: hash,
      permissions: perms,
      status: 'active',
      displayName,
      updatedAt: masterChanged ? now : cur.updatedAt,
    }

    const nextList = list
      .filter((a) => a.role !== 'super_admin' || a.phone === OPS_MASTER_PHONE)
      .map((a) => (a.phone === OPS_MASTER_PHONE ? nextMaster : a))

    if (masterChanged || hasExtraSuperAdmin || nextList.length !== list.length) {
      writeOpsStaffAccounts(nextList)
    }
    return
  }

  writeOpsStaffAccounts([
    ...list.filter((a) => a.phone !== OPS_MASTER_PHONE && a.role !== 'super_admin'),
    {
      id: 'ops_master',
      phone: OPS_MASTER_PHONE,
      displayName: '超级管理员',
      role: 'super_admin',
      passwordHash: hash,
      permissions: perms,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export function getOpsAccountById(id: string): OpsStaffAccount | null {
  return readOpsStaffAccounts().find((a) => a.id === id) ?? null
}

export function getOpsAccountByPhone(phone: string): OpsStaffAccount | null {
  const p = phone.replace(/\D/g, '').slice(0, 11)
  return readOpsStaffAccounts().find((a) => a.phone === p) ?? null
}

export async function verifyOpsLogin(
  phone: string,
  password: string,
): Promise<{ ok: true; account: OpsStaffAccount } | { ok: false; error: string }> {
  await ensureOpsMasterAccount()
  const p = phone.replace(/\D/g, '').slice(0, 11)
  if (p.length !== 11) return { ok: false, error: 'invalid_phone' }
  const account = getOpsAccountByPhone(p)
  if (!account) return { ok: false, error: 'not_found' }
  if (account.status === 'disabled') return { ok: false, error: 'disabled' }
  const hash = await hashOpsPassword(password)
  if (hash !== account.passwordHash) return { ok: false, error: 'bad_password' }
  return { ok: true, account }
}

export function buildOpsSession(account: OpsStaffAccount): OpsSession {
  return {
    accountId: account.id,
    phone: account.phone,
    displayName: account.displayName,
    role: account.role,
    permissions: account.role === 'super_admin' ? allPermissionKeys() : [...account.permissions],
    loginAt: new Date().toISOString(),
  }
}

export function readOpsSession(): OpsSession | null {
  try {
    const raw = sessionStorage.getItem(OPS_SESSION_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, unknown>
    const accountId = typeof o.accountId === 'string' ? o.accountId : ''
    const phone = typeof o.phone === 'string' ? o.phone : ''
    if (!accountId || !phone) return null
    const role: OpsStaffRole = o.role === 'super_admin' ? 'super_admin' : 'sub_admin'
    const permissions = Array.isArray(o.permissions)
      ? o.permissions.filter((p): p is OpsPermissionKey =>
          OPS_PERMISSION_MODULES.some((m) => m.key === p),
        )
      : []
    return {
      accountId,
      phone,
      displayName: typeof o.displayName === 'string' ? o.displayName : phone,
      role,
      permissions: role === 'super_admin' ? allPermissionKeys() : permissions,
      loginAt: typeof o.loginAt === 'string' ? o.loginAt : '',
    }
  } catch {
    return null
  }
}

export function writeOpsSession(session: OpsSession): void {
  sessionStorage.setItem(OPS_SESSION_KEY, JSON.stringify(session))
}

export function clearOpsSession(): void {
  sessionStorage.removeItem(OPS_SESSION_KEY)
}

export function isSuperAdmin(session: OpsSession | null): boolean {
  return session?.role === 'super_admin'
}

export function sessionHasPermission(session: OpsSession | null, key: OpsPermissionKey): boolean {
  if (!session) return false
  if (session.role === 'super_admin') return true
  return session.permissions.includes(key)
}

export function canAccessOpsPath(session: OpsSession | null, pathname: string): boolean {
  if (!session) return false
  if (pathname === '/' || pathname === '') return true
  if (pathname.startsWith('/accounts')) {
    return session.role === 'super_admin'
  }
  for (const m of OPS_PERMISSION_MODULES) {
    if (pathname === m.pathPrefix || pathname.startsWith(`${m.pathPrefix}/`)) {
      return sessionHasPermission(session, m.key)
    }
  }
  return session.role === 'super_admin'
}

export function firstAllowedOpsPath(session: OpsSession): string {
  if (session.role === 'super_admin') return '/customers'
  for (const m of OPS_PERMISSION_MODULES) {
    if (session.permissions.includes(m.key)) return m.pathPrefix
  }
  return '/login'
}

export async function createOpsSubAccount(input: {
  phone: string
  displayName: string
  password: string
  permissions: OpsPermissionKey[]
}): Promise<{ ok: true; account: OpsStaffAccount } | { ok: false; error: string }> {
  await ensureOpsMasterAccount()
  const phone = input.phone.replace(/\D/g, '').slice(0, 11)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  if (phone === OPS_MASTER_PHONE) return { ok: false, error: 'reserved_phone' }
  if (input.password.length < 6) return { ok: false, error: 'password_too_short' }
  const perms = [...new Set(input.permissions)]
  if (perms.length === 0) return { ok: false, error: 'permissions_required' }

  const list = readOpsStaffAccounts()
  if (list.some((a) => a.phone === phone)) return { ok: false, error: 'phone_exists' }

  const now = new Date().toISOString()
  const account: OpsStaffAccount = {
    id: uid(),
    phone,
    displayName: input.displayName.trim() || phone,
    role: 'sub_admin',
    passwordHash: await hashOpsPassword(input.password),
    permissions: perms,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  writeOpsStaffAccounts([...list, account])
  return { ok: true, account }
}

export async function updateOpsSubAccount(
  id: string,
  patch: {
    displayName?: string
    permissions?: OpsPermissionKey[]
    status?: 'active' | 'disabled'
    password?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = readOpsStaffAccounts()
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0) return { ok: false, error: 'not_found' }
  const cur = list[idx]!
  if (cur.role === 'super_admin') return { ok: false, error: 'cannot_edit_master' }

  const now = new Date().toISOString()
  let permissions = cur.permissions
  if (patch.permissions) {
    permissions = [...new Set(patch.permissions)]
    if (permissions.length === 0) return { ok: false, error: 'permissions_required' }
  }
  let passwordHash = cur.passwordHash
  if (patch.password != null && patch.password.length > 0) {
    if (patch.password.length < 6) return { ok: false, error: 'password_too_short' }
    passwordHash = await hashOpsPassword(patch.password)
  }

  list[idx] = {
    ...cur,
    displayName: patch.displayName?.trim() ? patch.displayName.trim() : cur.displayName,
    permissions,
    status: patch.status ?? cur.status,
    passwordHash,
    updatedAt: now,
  }
  writeOpsStaffAccounts(list)
  return { ok: true }
}

export async function deleteOpsSubAccount(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = readOpsStaffAccounts()
  const target = list.find((a) => a.id === id)
  if (!target) return { ok: false, error: 'not_found' }
  if (target.role === 'super_admin') return { ok: false, error: 'cannot_delete_master' }
  writeOpsStaffAccounts(list.filter((a) => a.id !== id))
  return { ok: true }
}

export function refreshOpsSessionFromStorage(): OpsSession | null {
  const cur = readOpsSession()
  if (!cur) return null
  const account = getOpsAccountById(cur.accountId)
  if (!account || account.status === 'disabled') {
    clearOpsSession()
    return null
  }
  const next = buildOpsSession(account)
  writeOpsSession(next)
  return next
}

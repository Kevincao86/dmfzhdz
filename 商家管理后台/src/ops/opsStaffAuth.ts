/**
 * 运营管控台登录账号（主账号 + 子账号）。
 * 线上优先读写 Supabase（/api/meoo-ops-staff-*）；未配置 Supabase 时回退浏览器 localStorage。
 * 密码仅存 SHA-256 摘要（本地回退路径）。
 */

import {
  apiMigrateLocalStaff,
  apiOpsStaffList,
  apiOpsStaffLogin,
  apiOpsStaffMutate,
} from './opsStaffApiClient'

export const OPS_SESSION_KEY = 'meoo_ops_login_v2'

export const OPS_MASTER_PHONE = '18768501283'
/** 历史误写主号，登录时按 01283 处理 */
export const OPS_MASTER_PHONE_LEGACY_WRONG = '18768581283'
export const OPS_MASTER_DEFAULT_PASSWORD = 'kaiyedaji888'

export function isOpsMasterPhone(phone: string): boolean {
  const p = phone.replace(/\D/g, '').slice(0, 11)
  return p === OPS_MASTER_PHONE || p === OPS_MASTER_PHONE_LEGACY_WRONG
}

const OPS_STAFF_STORAGE_KEY = 'meoo_ops_staff_accounts_v1'

export const OPS_PERMISSION_MODULES = [
  { key: 'customers', label: '客户管理', pathPrefix: '/customers' },
  { key: 'announcements', label: '公告栏推送', pathPrefix: '/announcements' },
  { key: 'payment_orders', label: '订单管理', pathPrefix: '/payment-orders' },
  { key: 'recruitment_orders', label: '商家达人招募订单', pathPrefix: '/recruitment-orders' },
  { key: 'mp_recruitment_orders', label: '小程序达人招募订单', pathPrefix: '/mp-recruitment-orders' },
  { key: 'talent_library', label: '灵祺达人库', pathPrefix: '/talent-library' },
  { key: 'shoot_team_library', label: '拍摄团队库', pathPrefix: '/shoot-team-library' },
  { key: 'edit_team_library', label: '剪辑团队库', pathPrefix: '/edit-team-library' },
  { key: 'pr_library', label: 'PR 用户库', pathPrefix: '/pr-library' },
  { key: 'ai_models', label: 'AI 模型', pathPrefix: '/ai-models' },
  { key: 'support', label: '在线客服（ERP处理中心）', pathPrefix: '/support' },
  {
    key: 'support_mp',
    label: '在线客服（小程序达人、PR处理中心）',
    pathPrefix: '/support-mp',
  },
  { key: 'help_manual', label: '帮助手册管理', pathPrefix: '/help-manual' },
  { key: 'team_intro', label: '团队介绍', pathPrefix: '/team-intro' },
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
  /** 云端登录会话令牌（Bearer） */
  sessionToken?: string
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
  if (!id || phone.length !== 11 || !createdAt) return null
  if (role === 'sub_admin' && !passwordHash) return null
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

function readOpsStaffAccountsLocal(): OpsStaffAccount[] {
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

function writeOpsStaffAccountsLocal(accounts: OpsStaffAccount[]): void {
  const serialized = JSON.stringify(accounts)
  if (localStorage.getItem(OPS_STAFF_STORAGE_KEY) === serialized) return
  localStorage.setItem(OPS_STAFF_STORAGE_KEY, serialized)
  window.dispatchEvent(new CustomEvent('meoo-ops-staff-changed'))
}

function sessionTokenFromStorage(): string | undefined {
  return readOpsSession()?.sessionToken
}

export function hasOpsCloudSession(): boolean {
  return !!sessionTokenFromStorage()
}

function isOpsProductionHost(): boolean {
  try {
    return /mofangdianai\.com$/i.test(window.location.hostname)
  } catch {
    return false
  }
}

/** 确保主账号存在（本地回退路径） */
export async function ensureOpsMasterAccountLocal(): Promise<void> {
  const list = readOpsStaffAccountsLocal()
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
      writeOpsStaffAccountsLocal(nextList)
    }
    return
  }

  writeOpsStaffAccountsLocal([
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

/** 兼容旧调用：云端模式下为 no-op */
export async function ensureOpsMasterAccount(): Promise<void> {
  await ensureOpsMasterAccountLocal()
}

export function readOpsStaffAccounts(): OpsStaffAccount[] {
  return readOpsStaffAccountsLocal()
}

export async function fetchOpsStaffAccountsRemote(): Promise<OpsStaffAccount[]> {
  const token = sessionTokenFromStorage()
  if (!token) {
    await ensureOpsMasterAccountLocal()
    if (isOpsProductionHost()) return []
    return readOpsStaffAccountsLocal()
  }
  const r = await apiOpsStaffList(token)
  if (r.ok) return r.accounts
  if (r.unauthorized) {
    clearOpsSession()
    return []
  }
  await ensureOpsMasterAccountLocal()
  return readOpsStaffAccountsLocal()
}

/** 主账号登录后，将本机 localStorage 子账号一次性导入云端（仅导入云端尚不存在的手机号） */
export async function migrateLocalOpsStaffToRemoteIfNeeded(): Promise<number> {
  const session = readOpsSession()
  if (!session?.sessionToken || session.role !== 'super_admin') return 0
  const local = readOpsStaffAccountsLocal().filter((a) => a.role === 'sub_admin')
  if (local.length === 0) return 0
  const r = await apiMigrateLocalStaff(session.sessionToken, local)
  return r.ok ? r.imported : 0
}

/** 手动将本机子账号同步到云端（主账号须已云端登录） */
export async function syncLocalOpsStaffToCloud(): Promise<
  { ok: true; imported: number } | { ok: false; error: string }
> {
  const session = readOpsSession()
  if (!session?.sessionToken) {
    return { ok: false, error: 'cloud_session_required' }
  }
  if (session.role !== 'super_admin') {
    return { ok: false, error: 'super_admin_required' }
  }
  const local = readOpsStaffAccountsLocal().filter((a) => a.role === 'sub_admin')
  if (local.length === 0) {
    return { ok: true, imported: 0 }
  }
  const r = await apiMigrateLocalStaff(session.sessionToken, local)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, imported: r.imported }
}

export function getOpsAccountById(id: string): OpsStaffAccount | null {
  return readOpsStaffAccountsLocal().find((a) => a.id === id) ?? null
}

export function getOpsAccountByPhone(phone: string): OpsStaffAccount | null {
  const p = phone.replace(/\D/g, '').slice(0, 11)
  return readOpsStaffAccountsLocal().find((a) => a.phone === p) ?? null
}

async function verifyOpsLoginLocal(
  phone: string,
  password: string,
): Promise<{ ok: true; account: OpsStaffAccount } | { ok: false; error: string }> {
  await ensureOpsMasterAccountLocal()
  const p = phone.replace(/\D/g, '').slice(0, 11)
  if (p.length !== 11) return { ok: false, error: 'invalid_phone' }
  const lookupPhone = p === OPS_MASTER_PHONE_LEGACY_WRONG ? OPS_MASTER_PHONE : p
  const account = getOpsAccountByPhone(lookupPhone)
  if (!account) return { ok: false, error: 'not_found' }
  if (account.status === 'disabled') return { ok: false, error: 'disabled' }
  const hash = await hashOpsPassword(password)
  if (hash !== account.passwordHash) return { ok: false, error: 'bad_password' }
  return { ok: true, account }
}

export async function verifyOpsLogin(
  phone: string,
  password: string,
): Promise<
  | { ok: true; account: OpsStaffAccount; session: OpsSession }
  | { ok: false; error: string }
> {
  const remote = await apiOpsStaffLogin(phone, password)
  if (remote.ok) {
    return { ok: true, account: remote.account, session: remote.session }
  }

  /** 主账号：云端未就绪或未建表时仍可用本机校验，避免运营台被锁死 */
  if (isOpsMasterPhone(phone)) {
    const localMaster = await verifyOpsLoginLocal(phone, password)
    if (localMaster.ok) {
      return {
        ok: true,
        account: localMaster.account,
        session: buildOpsSession(localMaster.account),
      }
    }
    if (remote.error === 'bad_password' || remote.error === 'bad_credentials') {
      return { ok: false, error: 'bad_password' }
    }
  }

  const allowLocalFallback = remote.useLocalFallback && !isOpsProductionHost()
  if (!allowLocalFallback) {
    return { ok: false, error: remote.error ?? 'bad_password' }
  }

  const local = await verifyOpsLoginLocal(phone, password)
  if (!local.ok) return local
  return { ok: true, account: local.account, session: buildOpsSession(local.account) }
}

export function buildOpsSession(account: OpsStaffAccount, sessionToken?: string): OpsSession {
  return {
    accountId: account.id,
    phone: account.phone,
    displayName: account.displayName,
    role: account.role,
    permissions: account.role === 'super_admin' ? allPermissionKeys() : [...account.permissions],
    loginAt: new Date().toISOString(),
    ...(sessionToken ? { sessionToken } : {}),
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
      sessionToken: typeof o.sessionToken === 'string' ? o.sessionToken : undefined,
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

/** 仅主账号 18768501283 可永久删除客户 */
export function canOpsMasterDeleteCustomer(session: OpsSession | null): boolean {
  if (!session) return false
  return session.phone.replace(/\D/g, '').slice(0, 11) === OPS_MASTER_PHONE
}

export function sessionHasPermission(session: OpsSession | null, key: OpsPermissionKey): boolean {
  if (!session) return false
  if (session.role === 'super_admin') return true
  return session.permissions.includes(key)
}

export function canAccessOpsPath(session: OpsSession | null, pathname: string): boolean {
  if (!session) return false
  if (pathname === '/' || pathname === '' || pathname === '/home') return true
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
  if (!session) return '/login'
  return '/'
}

export async function createOpsSubAccount(input: {
  phone: string
  displayName: string
  password: string
  permissions: OpsPermissionKey[]
}): Promise<{ ok: true; account: OpsStaffAccount; cloudSynced: boolean } | { ok: false; error: string }> {
  const token = sessionTokenFromStorage()
  if (isOpsProductionHost() || token) {
    if (!token) return { ok: false, error: 'cloud_session_required' }
    const r = await apiOpsStaffMutate(token, {
      action: 'create',
      phone: input.phone,
      displayName: input.displayName,
      password: input.password,
      permissions: input.permissions,
    })
    if (r.ok && r.account) return { ok: true, account: r.account, cloudSynced: true }
    if (r.ok) return { ok: false, error: 'invalid_response' }
    return { ok: false, error: r.error }
  }

  await ensureOpsMasterAccountLocal()
  const phone = input.phone.replace(/\D/g, '').slice(0, 11)
  if (phone.length !== 11) return { ok: false, error: 'invalid_phone' }
  if (phone === OPS_MASTER_PHONE) return { ok: false, error: 'reserved_phone' }
  if (input.password.length < 6) return { ok: false, error: 'password_too_short' }
  const perms = [...new Set(input.permissions)]
  if (perms.length === 0) return { ok: false, error: 'permissions_required' }

  const list = readOpsStaffAccountsLocal()
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
  writeOpsStaffAccountsLocal([...list, account])
  return { ok: true, account, cloudSynced: false }
}

export async function updateOpsSubAccount(
  id: string,
  patch: {
    displayName?: string
    permissions?: OpsPermissionKey[]
    status?: 'active' | 'disabled'
    password?: string
  },
): Promise<{ ok: true; cloudSynced: boolean } | { ok: false; error: string }> {
  const token = sessionTokenFromStorage()
  if (isOpsProductionHost() || token) {
    if (!token) return { ok: false, error: 'cloud_session_required' }
    const r = await apiOpsStaffMutate(token, { action: 'update', id, ...patch })
    if (r.ok) return { ok: true, cloudSynced: true }
    return { ok: false, error: r.error }
  }

  const list = readOpsStaffAccountsLocal()
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
  writeOpsStaffAccountsLocal(list)
  return { ok: true, cloudSynced: false }
}

export async function deleteOpsSubAccount(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = sessionTokenFromStorage()
  if (isOpsProductionHost() || token) {
    if (!token) return { ok: false, error: 'cloud_session_required' }
    const r = await apiOpsStaffMutate(token, { action: 'delete', id })
    if (r.ok) return { ok: true }
    return { ok: false, error: r.error }
  }

  const list = readOpsStaffAccountsLocal()
  const target = list.find((a) => a.id === id)
  if (!target) return { ok: false, error: 'not_found' }
  if (target.role === 'super_admin') return { ok: false, error: 'cannot_delete_master' }
  writeOpsStaffAccountsLocal(list.filter((a) => a.id !== id))
  return { ok: true }
}

/** 主账号已登录但缺 sessionToken 时，用密码重新向 ECS 申请云端会话（无需退出） */
export async function reconnectOpsCloudSession(
  phone: string,
  password: string,
): Promise<{ ok: true; session: OpsSession } | { ok: false; error: string }> {
  const remote = await apiOpsStaffLogin(phone, password)
  if (!remote.ok) {
    return { ok: false, error: remote.error ?? 'cloud_login_failed' }
  }
  const session: OpsSession = { ...remote.session, sessionToken: remote.sessionToken }
  writeOpsSession(session)
  if (session.role === 'super_admin') {
    await migrateLocalOpsStaffToRemoteIfNeeded()
  }
  return { ok: true, session }
}

export function refreshOpsSessionFromStorage(): OpsSession | null {
  const cur = readOpsSession()
  if (!cur) return null
  if (cur.sessionToken) return cur
  const account = getOpsAccountById(cur.accountId)
  if (!account || account.status === 'disabled') {
    clearOpsSession()
    return null
  }
  const next = buildOpsSession(account, cur.sessionToken)
  writeOpsSession(next)
  return next
}

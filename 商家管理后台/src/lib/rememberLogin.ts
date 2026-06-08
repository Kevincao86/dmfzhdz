const PREFIX = 'meoo_remember_login_v1_'

export type RememberedLogin = {
  loginName: string
  password: string
}

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`
}

export function readRememberedLogin(scope: string): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return null
    const j = JSON.parse(raw) as RememberedLogin
    if (!j || typeof j.loginName !== 'string' || typeof j.password !== 'string') return null
    return { loginName: j.loginName, password: j.password }
  } catch {
    return null
  }
}

export function writeRememberedLogin(scope: string, data: RememberedLogin | null): void {
  try {
    if (!data) {
      localStorage.removeItem(storageKey(scope))
      return
    }
    localStorage.setItem(storageKey(scope), JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

export function isRememberLoginEnabled(scope: string): boolean {
  return readRememberedLogin(scope) !== null
}

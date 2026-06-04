/**
 * 按灵祺账号隔离本机「我的报名 / 发单」等，避免同浏览器换号串数据。
 */
import { getAccount, type MpAccount } from './mpSession'

const LAST_ACCOUNT_SCOPE_KEY = 'meoo_last_account_scope_v1'

const TRANSACTIONAL_PREFIXES = [
  'meoo_my_applications_v',
  'meoo_my_published_orders_v',
]

export function scopeIdFromAccount(account: MpAccount | null | undefined): string {
  if (!account) return ''
  return String(
    account.accountId || account.openid || account.lingqiTalentId || account.lingqiPrId || '',
  ).trim()
}

export function scopedStorageKey(baseKey: string, accountOrScope?: MpAccount | string | null): string {
  const scope =
    typeof accountOrScope === 'string'
      ? accountOrScope.trim()
      : scopeIdFromAccount(accountOrScope ?? getAccount())
  if (!scope) return baseKey
  return `${baseKey}:${scope}`
}

function readLastScopeId(): string {
  try {
    return String(localStorage.getItem(LAST_ACCOUNT_SCOPE_KEY) || '').trim()
  } catch {
    return ''
  }
}

function writeLastScopeId(scopeId: string) {
  try {
    if (scopeId) localStorage.setItem(LAST_ACCOUNT_SCOPE_KEY, scopeId)
    else localStorage.removeItem(LAST_ACCOUNT_SCOPE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearTransactionalLocalData() {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }
  } catch {
    return
  }
  for (const k of keys) {
    let hit = false
    for (const prefix of TRANSACTIONAL_PREFIXES) {
      if (k.startsWith(prefix)) {
        hit = true
        break
      }
    }
    if (hit) {
      try {
        localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
}

export function onAccountLogin(account: MpAccount) {
  const next = scopeIdFromAccount(account)
  if (!next) return
  const prev = readLastScopeId()
  if (prev && prev !== next) {
    clearTransactionalLocalData()
  }
  writeLastScopeId(next)
}

export function onAccountLogout() {
  clearTransactionalLocalData()
  writeLastScopeId('')
}

export function currentScopeId(): string {
  return scopeIdFromAccount(getAccount())
}

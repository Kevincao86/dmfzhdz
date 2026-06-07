/**
 * 按灵祺账号隔离本机「我的报名 / 发单」等，避免同浏览器换号串数据。
 */
import { getAccount, type MpAccount } from './mpSession'

const LAST_ACCOUNT_SCOPE_KEY = 'meoo_last_account_scope_v1'

const TRANSACTIONAL_PREFIXES = [
  'meoo_my_applications_v',
  'meoo_my_published_orders_v',
  'meoo_talent_messages_v1',
  'meoo_talent_notifications_v1',
  'meoo_talent_inbox_seen_v1',
]

/** 换号时必须清除的全局 key（未带账号 scope，会导致串号） */
const LEGACY_GLOBAL_PROFILE_KEYS = [
  'meoo_talent_member_v1',
  'meoo_pr_profile_v1',
  'meoo_publish_wizard_drafts_v1',
  'meoo_publish_wizard_draft_v1',
  'meoo_apply_form_templates_v1',
  'meoo_active_apply_template_v1',
  'meoo_active_shoot_apply_template_v1',
  'meoo_active_edit_apply_template_v1',
  'meoo_talent_identity_v1',
  'meoo_wx_account_v1',
  'meoo_talent_messages_v1',
  'meoo_talent_notifications_v1',
  'meoo_talent_inbox_seen_v1',
]

const LEGACY_UNSCOPED_PREFIXES = ['meoo_mp_apply_form_']

/** 首次写入 scope 时允许从全局迁入当前账号（仅 scoped 为空时） */
const MIGRATE_ON_FIRST_SCOPE_KEYS = [
  'meoo_talent_member_v1',
  'meoo_pr_profile_v1',
  'meoo_publish_wizard_drafts_v1',
  'meoo_publish_wizard_draft_v1',
  'meoo_apply_form_templates_v1',
  'meoo_active_apply_template_v1',
  'meoo_active_shoot_apply_template_v1',
  'meoo_active_edit_apply_template_v1',
  'meoo_wx_account_v1',
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

function removeUnscopedPrefixedKeys() {
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
    if (k.includes(':')) continue
    for (const prefix of LEGACY_UNSCOPED_PREFIXES) {
      if (k.startsWith(prefix)) {
        try {
          localStorage.removeItem(k)
        } catch {
          /* ignore */
        }
        break
      }
    }
  }
}

export function clearLegacyGlobalProfileKeys() {
  for (const k of LEGACY_GLOBAL_PROFILE_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  removeUnscopedPrefixedKeys()
}

/** 同账号首次升级：将旧全局 key 迁入当前账号 scope（换号前须先 clearLegacyGlobalProfileKeys） */
export function migrateLegacyKeyToScoped(baseKey: string, accountOrScope?: MpAccount | string | null) {
  const scoped = scopedStorageKey(baseKey, accountOrScope)
  try {
    if (localStorage.getItem(scoped)) return
    const legacy = localStorage.getItem(baseKey)
    if (!legacy) return
    localStorage.setItem(scoped, legacy)
    localStorage.removeItem(baseKey)
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

function migrateAllLegacyProfileKeysToScope(scopeId: string) {
  if (!scopeId) return
  for (const base of MIGRATE_ON_FIRST_SCOPE_KEYS) {
    const scoped = `${base}:${scopeId}`
    try {
      if (localStorage.getItem(scoped)) continue
      const legacy = localStorage.getItem(base)
      if (!legacy) continue
      localStorage.setItem(scoped, legacy)
      localStorage.removeItem(base)
    } catch {
      /* ignore */
    }
  }
  removeUnscopedPrefixedKeys()
}

export function onAccountLogin(account: MpAccount) {
  const next = scopeIdFromAccount(account)
  if (!next) return
  const prev = readLastScopeId()
  if (!prev) {
    migrateAllLegacyProfileKeysToScope(next)
    try {
      for (const k of ['meoo_talent_messages_v1', 'meoo_talent_notifications_v1', 'meoo_talent_inbox_seen_v1']) {
        localStorage.removeItem(k)
      }
    } catch {
      /* ignore */
    }
  } else if (prev !== next) {
    clearTransactionalLocalData()
    clearLegacyGlobalProfileKeys()
  }
  writeLastScopeId(next)
}

/** 退出登录：清除本域所有灵祺小程序/履约 Web 本地缓存（含 scoped 资料与报名草稿） */
export function clearAllMpBrowserCache() {
  const prefixes = ['meoo_', 'lingqi_mp_']
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
    if (prefixes.some((p) => k.startsWith(p))) {
      try {
        localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
}

export function onAccountLogout() {
  clearAllMpBrowserCache()
}

export function currentScopeId(): string {
  return scopeIdFromAccount(getAccount())
}

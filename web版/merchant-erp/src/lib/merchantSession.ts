/**
 * 商家绑定态读写。
 *
 * 抖音来客 `meoo_douyin_*` 使用 **localStorage**：`sessionStorage` 按标签页隔离，新开标签/部分场景会读不到
 * token，界面误判「掉绑定」；除用户点击「断开连接」外不应丢失绑定态。
 * 已登录 Supabase 商户账号时，设置页会将绑定同步到 `tenant_merchant_bindings`，换设备可从云端恢复。
 *
 * 其它商家键仍走 sessionStorage（保持原行为）。
 */

/** 登出或切换账号时清空，避免下一账号误用上一账号的本地抖音凭证 */
const DOUYIN_LOCAL_KEYS = [
  'meoo_douyin_merchant_token',
  'meoo_douyin_auto_refresh',
  'meoo_douyin_app_id',
  'meoo_douyin_merchant_id',
  'meoo_douyin_account_name',
] as const

const KUAISHOU_LOCAL_KEYS = [
  'meoo_kuaishou_merchant_token',
  'meoo_kuaishou_auto_refresh',
  'meoo_kuaishou_app_id',
  'meoo_kuaishou_merchant_id',
  'meoo_kuaishou_account_name',
] as const

function isDouyinBindingKey(key: string): boolean {
  return key.startsWith('meoo_douyin_')
}

function isKuaishouBindingKey(key: string): boolean {
  return key.startsWith('meoo_kuaishou_')
}

function isPersistentMerchantBindingKey(key: string): boolean {
  return isDouyinBindingKey(key) || isKuaishouBindingKey(key)
}

export function readMerchantSession(key: string): string | null {
  try {
    if (isPersistentMerchantBindingKey(key)) {
      const loc = localStorage.getItem(key)
      if (typeof loc === 'string' && loc.trim() !== '') return loc.trim()
      const sess = sessionStorage.getItem(key)
      if (typeof sess === 'string' && sess.trim() !== '') {
        try {
          localStorage.setItem(key, sess)
          sessionStorage.removeItem(key)
        } catch {
          /* 私密模式等可能写 localStorage 失败，仍返回 session 值 */
        }
        return sess.trim()
      }
      return null
    }
    const v = sessionStorage.getItem(key)
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  } catch {
    return null
  }
}

/** 写入商家会话；`value === null` 表示清除（抖音键会同时清 local + session 副本） */
export function writeMerchantSession(key: string, value: string | null): void {
  try {
    if (isPersistentMerchantBindingKey(key)) {
      if (value == null) {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      } else {
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      }
      return
    }
    if (value == null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function clearDouyinMerchantBindingLocal(): void {
  for (const k of DOUYIN_LOCAL_KEYS) {
    writeMerchantSession(k, null)
  }
}

export function clearKuaishouMerchantBindingLocal(): void {
  for (const k of KUAISHOU_LOCAL_KEYS) {
    writeMerchantSession(k, null)
  }
}

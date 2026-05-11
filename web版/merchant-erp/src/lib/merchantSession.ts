/**
 * 商家绑定态读写。
 *
 * 抖音来客 `meoo_douyin_*` 使用 **localStorage**：`sessionStorage` 按标签页隔离，新开标签/部分场景会读不到
 * token，界面误判「掉绑定」；除用户点击「断开连接」外不应丢失绑定态。
 *
 * 其它商家键仍走 sessionStorage（保持原行为）。
 */

function isDouyinBindingKey(key: string): boolean {
  return key.startsWith('meoo_douyin_')
}

export function readMerchantSession(key: string): string | null {
  try {
    if (isDouyinBindingKey(key)) {
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
    if (isDouyinBindingKey(key)) {
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

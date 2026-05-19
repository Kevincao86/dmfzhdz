import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import {
  readActiveBindingId,
  writeActiveBindingId,
} from './merchantPlatformBindings'
import { clearDouyinMerchantBindingLocal, writeMerchantSession } from './merchantSession'

const TOKEN_KEY = 'meoo_douyin_merchant_token'
const META_APP_ID = 'meoo_douyin_app_id'
const META_MERCHANT_ID = 'meoo_douyin_merchant_id'
const META_ACCOUNT_NAME = 'meoo_douyin_account_name'

/** 将指定绑定设为当前抖音来客会话（兼容现有 readMerchantSession 读 token） */
export function applyActiveDouyinBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    clearDouyinMerchantBindingLocal()
    writeActiveBindingId('douyin', null)
    return
  }
  writeMerchantSession(TOKEN_KEY, row.sealedCredentials)
  writeMerchantSession(META_APP_ID, row.clientKey ?? '')
  writeMerchantSession(META_MERCHANT_ID, row.merchantAccountId)
  writeMerchantSession(
    META_ACCOUNT_NAME,
    row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
  )
  writeActiveBindingId('douyin', row.id)
}

export function pickActiveDouyinBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('douyin')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

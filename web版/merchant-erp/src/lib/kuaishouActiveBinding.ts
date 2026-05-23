import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import {
  readActiveBindingId,
  writeActiveBindingId,
} from './merchantPlatformBindings'
import { clearKuaishouMerchantBindingLocal, writeMerchantSession } from './merchantSession'

const TOKEN_KEY = 'meoo_kuaishou_merchant_token'
const META_APP_ID = 'meoo_kuaishou_app_id'
const META_MERCHANT_ID = 'meoo_kuaishou_merchant_id'
const META_ACCOUNT_NAME = 'meoo_kuaishou_account_name'

/** 将指定绑定设为当前快手团购会话（兼容现有 readMerchantSession 读 token） */
export function applyActiveKuaishouBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    clearKuaishouMerchantBindingLocal()
    writeActiveBindingId('kuaishou', null)
    return
  }
  writeMerchantSession(TOKEN_KEY, row.sealedCredentials)
  writeMerchantSession(META_APP_ID, row.clientKey ?? '')
  writeMerchantSession(META_MERCHANT_ID, row.merchantAccountId)
  writeMerchantSession(
    META_ACCOUNT_NAME,
    row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
  )
  writeActiveBindingId('kuaishou', row.id)
}

export function pickActiveKuaishouBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('kuaishou')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

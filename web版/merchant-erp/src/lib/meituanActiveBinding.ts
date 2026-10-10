import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import { readActiveBindingId, writeActiveBindingId } from './merchantPlatformBindings'
import { clearMeituanMerchantBindingLocal, writeMerchantSession } from './merchantSession'

const TOKEN_KEY = 'meoo_meituan_merchant_token'
const META_APP_ID = 'meoo_meituan_app_id'
const META_MERCHANT_ID = 'meoo_meituan_merchant_id'
const META_ACCOUNT_NAME = 'meoo_meituan_account_name'
const DEMO_KEY = 'meoo_meituan_bind_demo'

/** 将云端美团团购绑定写入本机，供门店/商品/评价读取。 */
export function applyActiveMeituanBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    clearMeituanMerchantBindingLocal()
    writeActiveBindingId('meituan', null)
    return
  }
  writeMerchantSession(TOKEN_KEY, row.sealedCredentials)
  writeMerchantSession(META_APP_ID, row.clientKey ?? '')
  writeMerchantSession(META_MERCHANT_ID, row.merchantAccountId)
  writeMerchantSession(
    META_ACCOUNT_NAME,
    row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
  )
  writeMerchantSession(DEMO_KEY, row.demoMode ? '1' : '0')
  writeActiveBindingId('meituan', row.id)
}

export function pickActiveMeituanBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('meituan')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

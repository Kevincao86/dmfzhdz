import type { XhsCommercialBindState } from './xhsCommercialTypes'
import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import {
  packXhsCommercialCredentials,
  readActiveBindingId,
  unpackXhsCommercialCredentials,
  writeActiveBindingId,
} from './merchantPlatformBindings'
import { readMerchantSession, writeMerchantSession } from './merchantSession'

const LEGACY_BIND_KEY = 'meoo_xhs_commercial_bind'

export function xhsCommercialRowToBindState(
  row: MerchantPlatformBindingRow,
): XhsCommercialBindState | null {
  const creds = unpackXhsCommercialCredentials(row.sealedCredentials)
  if (!creds) return null
  return {
    bindingId: row.id,
    appId: creds.appId,
    accessToken: creds.accessToken,
    advertiserId: row.merchantAccountId,
    accountName: row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
    boundAt: row.updatedAt,
    demoMode: row.demoMode,
  }
}

export function syncLegacyXhsCommercialKey(state: XhsCommercialBindState | null): void {
  if (!state) writeMerchantSession(LEGACY_BIND_KEY, null)
  else writeMerchantSession(LEGACY_BIND_KEY, JSON.stringify(state))
}

export function applyActiveXhsCommercialBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    writeActiveBindingId('xhs_commercial', null)
    syncLegacyXhsCommercialKey(null)
    return
  }
  const state = xhsCommercialRowToBindState(row)
  if (!state) {
    writeActiveBindingId('xhs_commercial', null)
    syncLegacyXhsCommercialKey(null)
    return
  }
  writeActiveBindingId('xhs_commercial', row.id)
  syncLegacyXhsCommercialKey(state)
}

export function pickActiveXhsCommercialBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('xhs_commercial')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

export function readXhsCommercialBinding(): XhsCommercialBindState | null {
  try {
    const raw = readMerchantSession(LEGACY_BIND_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as XhsCommercialBindState
    if (!o.accessToken?.trim() || !o.advertiserId?.trim()) return null
    return o
  } catch {
    return null
  }
}

export function isXhsCommercialBound(): boolean {
  return readXhsCommercialBinding() != null
}

export function packXhsCommercialForCloud(input: {
  accessToken: string
  appId?: string
}): string {
  return packXhsCommercialCredentials(input)
}

export function writeXhsCommercialBinding(state: XhsCommercialBindState | null): void {
  if (!state) {
    applyActiveXhsCommercialBinding(null)
    return
  }
  syncLegacyXhsCommercialKey(state)
  if (state.bindingId) writeActiveBindingId('xhs_commercial', state.bindingId)
}

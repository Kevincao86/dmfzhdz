import type { LocalPromotionBindState as QianchuanBindState } from './localPromotionTypes'
import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import {
  packLocalPromotionCredentials,
  readActiveBindingId,
  unpackLocalPromotionCredentials,
  writeActiveBindingId,
} from './merchantPlatformBindings'
import { readMerchantSession, writeMerchantSession } from './merchantSession'

const LEGACY_BIND_KEY = 'meoo_qianchuan_bind'

export function qianchuanRowToBindState(row: MerchantPlatformBindingRow): QianchuanBindState | null {
  const creds = unpackLocalPromotionCredentials(row.sealedCredentials)
  if (!creds) return null
  return {
    bindingId: row.id,
    appId: creds.appId,
    appSecret: creds.appSecret,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    tokenExpiresAt: creds.tokenExpiresAt,
    localAccountId: row.merchantAccountId,
    accountName: row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
    boundAt: row.updatedAt,
    demoMode: row.demoMode,
  }
}

function syncLegacyQianchuanKey(state: QianchuanBindState | null): void {
  if (!state) {
    writeMerchantSession(LEGACY_BIND_KEY, null)
    return
  }
  writeMerchantSession(LEGACY_BIND_KEY, JSON.stringify(state))
}

export type QianchuanConnectionStatus = 'connected' | 'demo' | 'degraded' | 'disconnected'

export function resolveQianchuanConnectionStatus(
  active: QianchuanBindState | null,
  activeRow: MerchantPlatformBindingRow | null | undefined,
): QianchuanConnectionStatus {
  if (active?.accessToken?.trim() && active.localAccountId?.trim()) {
    return active.demoMode ? 'demo' : 'connected'
  }
  if (activeRow) {
    if (unpackLocalPromotionCredentials(activeRow.sealedCredentials)) {
      return activeRow.demoMode ? 'demo' : 'connected'
    }
    return 'degraded'
  }
  return 'disconnected'
}

export function applyActiveQianchuanBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    writeActiveBindingId('qianchuan', null)
    syncLegacyQianchuanKey(null)
    return
  }
  const legacy = readQianchuanBinding()
  writeActiveBindingId('qianchuan', row.id)
  const state = qianchuanRowToBindState(row)
  if (state) {
    syncLegacyQianchuanKey(state)
    return
  }
  if (legacy && (legacy.bindingId === row.id || legacy.localAccountId === row.merchantAccountId)) {
    syncLegacyQianchuanKey({
      ...legacy,
      bindingId: row.id,
      localAccountId: row.merchantAccountId,
      accountName: row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
      demoMode: row.demoMode,
    })
    return
  }
  syncLegacyQianchuanKey(null)
}

export function pickActiveQianchuanBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('qianchuan')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

export function readQianchuanBinding(): QianchuanBindState | null {
  try {
    const raw = readMerchantSession(LEGACY_BIND_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as QianchuanBindState
    if (!o.accessToken?.trim() || !o.localAccountId?.trim()) return null
    return o
  } catch {
    return null
  }
}

export function isQianchuanBound(): boolean {
  return readQianchuanBinding() != null
}

export function packQianchuanForCloud(input: {
  accessToken: string
  appId?: string
  appSecret?: string
  refreshToken?: string
  tokenExpiresAt?: string
}): string {
  return packLocalPromotionCredentials(input)
}

export function writeQianchuanBinding(state: QianchuanBindState | null): void {
  if (!state) {
    applyActiveQianchuanBinding(null)
    return
  }
  syncLegacyQianchuanKey(state)
  if (state.bindingId) writeActiveBindingId('qianchuan', state.bindingId)
}

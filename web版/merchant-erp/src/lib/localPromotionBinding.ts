import type { LocalPromotionBindState } from './localPromotionTypes'
import type { MerchantPlatformBindingRow } from './merchantPlatformBindings'
import {
  packLocalPromotionCredentials,
  readActiveBindingId,
  unpackLocalPromotionCredentials,
  writeActiveBindingId,
} from './merchantPlatformBindings'
import { readMerchantSession, writeMerchantSession } from './merchantSession'

/** 兼容旧版单账号 key（由当前激活账号同步写入） */
const LEGACY_BIND_KEY = 'meoo_local_promotion_bind'

export function localPromotionRowToBindState(
  row: MerchantPlatformBindingRow,
): LocalPromotionBindState | null {
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

export function syncLegacyLocalPromotionKey(state: LocalPromotionBindState | null): void {
  if (!state) {
    writeMerchantSession(LEGACY_BIND_KEY, null)
    return
  }
  writeMerchantSession(LEGACY_BIND_KEY, JSON.stringify(state))
}

export function applyActiveLocalPromotionBinding(row: MerchantPlatformBindingRow | null): void {
  if (!row) {
    writeActiveBindingId('local_promotion', null)
    syncLegacyLocalPromotionKey(null)
    return
  }
  const state = localPromotionRowToBindState(row)
  if (!state) {
    writeActiveBindingId('local_promotion', null)
    syncLegacyLocalPromotionKey(null)
    return
  }
  writeActiveBindingId('local_promotion', row.id)
  syncLegacyLocalPromotionKey(state)
}

export function pickActiveLocalPromotionBinding(
  rows: MerchantPlatformBindingRow[],
): MerchantPlatformBindingRow | null {
  if (rows.length === 0) return null
  const activeId = readActiveBindingId('local_promotion')
  if (activeId) {
    const found = rows.find((r) => r.id === activeId)
    if (found) return found
  }
  return rows[0] ?? null
}

/** 读取当前激活的本地推绑定（投流/线索 API 使用） */
export function readLocalPromotionBinding(): LocalPromotionBindState | null {
  try {
    const raw = readMerchantSession(LEGACY_BIND_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as LocalPromotionBindState
    if (!o.accessToken?.trim() || !o.localAccountId?.trim()) return null
    return o
  } catch {
    return null
  }
}

export function isLocalPromotionBound(): boolean {
  return readLocalPromotionBinding() != null
}

export function packLocalPromotionForCloud(input: {
  accessToken: string
  appId?: string
  appSecret?: string
  refreshToken?: string
  tokenExpiresAt?: string
}): string {
  return packLocalPromotionCredentials(input)
}

/** 写入当前激活账号（投流/线索页读取 LEGACY_BIND_KEY） */
export function writeLocalPromotionBinding(state: LocalPromotionBindState | null): void {
  if (!state) {
    applyActiveLocalPromotionBinding(null)
    return
  }
  syncLegacyLocalPromotionKey(state)
  if (state.bindingId) writeActiveBindingId('local_promotion', state.bindingId)
}

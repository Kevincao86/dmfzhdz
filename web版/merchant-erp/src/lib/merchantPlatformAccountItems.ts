import type { PlatformAccountListItem } from '../components/settings/MerchantPlatformAccountsPanel'

/** 仅本机会话、尚未写入 Supabase 的占位 id */
export const LOCAL_SESSION_BINDING_ID = '__local_session__'

type CloudBindingLike = {
  id: string
  merchant_account_id: string | null
  binding_label: string | null
  account_display_name: string | null
  client_key?: string | null
}

/** 云端列表 + 本机 session 去重后的有效绑定数（用于「已绑定 n / 上限」） */
export function countEffectivePlatformBindings(
  cloudBindings: CloudBindingLike[],
  local: { accessToken: string | null; merchantId: string },
): number {
  const mid = local.merchantId.trim()
  if (local.accessToken && mid && !cloudBindings.some((b) => b.merchant_account_id === mid)) {
    return cloudBindings.length + 1
  }
  return cloudBindings.length
}

export function buildPlatformAccountItems(
  cloudBindings: CloudBindingLike[],
  opts: {
    activeBindingId: string | null
    accessToken: string | null
    merchantId: string
    accountName: string
    clientKey?: string
    defaultDisplayName?: string
    localOnlySubLabel?: string
  },
): PlatformAccountListItem[] {
  const items: PlatformAccountListItem[] = cloudBindings.map((b) => ({
    id: b.id,
    accountId: b.merchant_account_id ?? '—',
    displayName:
      b.binding_label ||
      b.account_display_name ||
      b.merchant_account_id ||
      opts.defaultDisplayName ||
      '账号',
    subLabel: b.client_key ? `AppID ${b.client_key}` : undefined,
    isActive: b.id === opts.activeBindingId,
  }))

  const mid = opts.merchantId.trim()
  const hasLocalOnly =
    !!opts.accessToken && !!mid && !cloudBindings.some((b) => b.merchant_account_id === mid)

  if (!hasLocalOnly) return items

  const cloudActive = cloudBindings.some((b) => b.id === opts.activeBindingId)
  items.unshift({
    id: LOCAL_SESSION_BINDING_ID,
    accountId: mid,
    displayName: opts.accountName.trim() || mid || opts.defaultDisplayName || '账号',
    subLabel: opts.clientKey?.trim()
      ? `AppID ${opts.clientKey.trim()}`
      : opts.localOnlySubLabel,
    isActive: !cloudActive,
  })

  return items
}

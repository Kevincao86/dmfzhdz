import { getAccount, isDevPreviewSession, type MpAccount } from './mpSession'
import { readAccountPrFeatureAccess } from './prFeatureAccess'

function truthyEnv(v: string | undefined): boolean {
  const s = String(v || '')
    .trim()
    .toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function parseAllowlist(): Set<string> {
  const raw = import.meta.env.VITE_MP_ADDON_BETA_ALLOWLIST as string | undefined
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** 正式全量开放（收费开通后可将此设为 true） */
export function isAddonOpenForAll(): boolean {
  return truthyEnv(import.meta.env.VITE_MP_ADDON_OPEN_ALL)
}

/** 当前账号可用于灰测匹配的标识（账号 ID / 灵祺 ID / 登录名等） */
export function accountAddonBetaKeys(account: MpAccount | null): string[] {
  if (!account) return []
  return [
    account.accountId,
    account.openid,
    account.loginName,
    account.lingqiTalentId,
    account.lingqiPrId,
    account.registryMemberId,
    account.registryPrId,
    account.lingqiShootTeamId,
    account.lingqiEditTeamId,
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
}

/** 灰测用户、运营台已开通或已全量开放时可用增值服务 */
export function canUsePaidAddons(account?: MpAccount | null): boolean {
  if (isAddonOpenForAll()) return true
  if (import.meta.env.DEV && isDevPreviewSession()) return true

  const acc = account ?? getAccount()
  if (acc?.activeRole === 'pr' || acc?.lingqiPrId) {
    if (readAccountPrFeatureAccess(acc).addons) return true
  }

  const allow = parseAllowlist()
  if (!allow.size) return false
  return accountAddonBetaKeys(acc).some((k) => allow.has(k))
}

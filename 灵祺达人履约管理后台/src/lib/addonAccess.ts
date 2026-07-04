import { getAccount, isDevPreviewSession, type MpAccount } from './mpSession'
import { readAccountPrFeatureAccess, type MpAddonAccess } from './prFeatureAccess'

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

export function readAccountAddonAccess(account?: MpAccount | null): MpAddonAccess {
  if (import.meta.env.DEV && isDevPreviewSession()) {
    return {
      shortvideo: true,
      cloudEdit: true,
      digitalHuman: true,
      brief: true,
      aiVideoReview: true,
      aiReview: true,
      any: true,
    }
  }
  if (isAddonOpenForAll()) {
    return {
      shortvideo: true,
      cloudEdit: true,
      digitalHuman: true,
      brief: true,
      aiVideoReview: true,
      aiReview: true,
      any: true,
    }
  }
  const acc = account ?? getAccount()
  const allow = parseAllowlist()
  if (allow.size && accountAddonBetaKeys(acc).some((k) => allow.has(k))) {
    return {
      shortvideo: true,
      cloudEdit: true,
      digitalHuman: true,
      brief: true,
      aiVideoReview: true,
      aiReview: true,
      any: true,
    }
  }
  const raw = readAccountPrFeatureAccess(acc)
  return {
    shortvideo: raw.shortvideo === true,
    cloudEdit: raw.cloudEdit === true,
    digitalHuman: raw.digitalHuman === true,
    brief: raw.brief === true,
    aiVideoReview: raw.aiVideoReview === true,
    aiReview: raw.aiReview === true,
    any: raw.any === true || raw.addons === true,
  }
}

/** 侧栏是否展示增值服务（任一子板块开通 / 灰测名单 / 全量开放） */
export function shouldShowAddonsNav(account?: MpAccount | null): boolean {
  return readAccountAddonAccess(account).any
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

/** @deprecated 使用 readAccountAddonAccess */
export function canUsePaidAddons(account?: MpAccount | null): boolean {
  return shouldShowAddonsNav(account)
}

export type AddonNavPerm = 'shortvideo' | 'brief' | 'digitalHuman' | 'aiVideoReview' | 'aiReview'

export function isAddonNavPermEnabled(access: MpAddonAccess, perm: AddonNavPerm): boolean {
  if (perm === 'shortvideo') return access.shortvideo || access.cloudEdit
  if (perm === 'brief') return access.brief
  if (perm === 'aiVideoReview') return access.aiVideoReview
  if (perm === 'aiReview') return access.aiReview
  return access.digitalHuman
}

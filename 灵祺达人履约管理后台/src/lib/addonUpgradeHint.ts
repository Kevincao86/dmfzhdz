import type { AddonNavPerm } from './addonAccess'

const TIER_ORDER = ['pro', 'flagship', 'enterprise'] as const
const TIER_LABELS: Record<string, string> = {
  pro: '专业版',
  flagship: '旗舰版',
  enterprise: '企业版',
}

/** 与小程序 / 运营台矩阵默认一致：付费档默认开通下列增值 */
const DEFAULT_PAID_UNLOCK: Record<AddonNavPerm, boolean> = {
  shortvideo: true,
  brief: true,
  digitalHuman: true,
  visualStudio: true,
  aiVideoReview: true,
  aiReview: true,
}

export function suggestUpgradePlanLabel(_perm: AddonNavPerm): string {
  // 矩阵运营可改；默认最低付费档为专业版
  void _perm
  return TIER_LABELS.pro
}

export function upgradePromptMessage(featureLabel: string, perm: AddonNavPerm): string {
  const plan = suggestUpgradePlanLabel(perm)
  return `${featureLabel}需更高会员档位，请升级至${plan}后使用。`
}

export function membershipUpgradePath(): string {
  return '/profile/membership'
}

export { TIER_ORDER, DEFAULT_PAID_UNLOCK }

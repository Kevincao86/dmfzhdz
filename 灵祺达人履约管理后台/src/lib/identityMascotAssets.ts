import type { MpWorkIdentity } from './mpWorkIdentity'
import { drStaticUrl } from '@merchant/lib/webStaticOssAssets'

/** 切换身份弹窗 · AI 卡通抠图（scripts/process-identity-mascots.mjs） */
const IDENTITY_MASCOT_LOCAL: Record<MpWorkIdentity, string> = {
  talent: '/identity-mascots/talent.png',
  shoot: '/identity-mascots/shoot.png',
  edit: '/identity-mascots/edit.png',
  pr: '/identity-mascots/pr.png',
}

/** 左侧菜单底栏 · 与弹窗区分姿态的侧边栏专用形象 */
const IDENTITY_SIDEBAR_MASCOT_LOCAL: Record<MpWorkIdentity, string> = {
  talent: '/identity-mascots/talent.png',
  shoot: '/identity-mascots/shoot-sidebar.png',
  edit: '/identity-mascots/edit-sidebar.png',
  pr: '/identity-mascots/pr.png',
}

export const IDENTITY_MASCOT_SRC: Record<MpWorkIdentity, string> = {
  talent: drStaticUrl(IDENTITY_MASCOT_LOCAL.talent),
  shoot: drStaticUrl(IDENTITY_MASCOT_LOCAL.shoot),
  edit: drStaticUrl(IDENTITY_MASCOT_LOCAL.edit),
  pr: drStaticUrl(IDENTITY_MASCOT_LOCAL.pr),
}

export const IDENTITY_SIDEBAR_MASCOT_SRC: Record<MpWorkIdentity, string> = {
  talent: drStaticUrl(IDENTITY_SIDEBAR_MASCOT_LOCAL.talent),
  shoot: drStaticUrl(IDENTITY_SIDEBAR_MASCOT_LOCAL.shoot),
  edit: drStaticUrl(IDENTITY_SIDEBAR_MASCOT_LOCAL.edit),
  pr: drStaticUrl(IDENTITY_SIDEBAR_MASCOT_LOCAL.pr),
}

export function identityMascotSrc(workId: MpWorkIdentity): string {
  return IDENTITY_MASCOT_SRC[workId]
}

export function identitySidebarMascotSrc(workId: MpWorkIdentity): string {
  return IDENTITY_SIDEBAR_MASCOT_SRC[workId]
}

import type { MpWorkIdentity } from './mpWorkIdentity'

/** 各工作台身份对应的 AI 卡通形象（透明底抠图，public/identity-mascots） */
export const IDENTITY_MASCOT_SRC: Record<MpWorkIdentity, string> = {
  talent: '/identity-mascots/talent.png',
  shoot: '/identity-mascots/shoot.png',
  edit: '/identity-mascots/edit.png',
  pr: '/identity-mascots/pr.png',
}

export function identityMascotSrc(workId: MpWorkIdentity): string {
  return IDENTITY_MASCOT_SRC[workId]
}

import type { MpWorkIdentity } from './mpWorkIdentity'

/** 各工作台身份对应的 AI 卡通形象（经 scripts/process-identity-mascots.mjs 生成透明底） */
export const IDENTITY_MASCOT_SRC: Record<MpWorkIdentity, string> = {
  talent: '/identity-mascots/talent.png',
  shoot: '/identity-mascots/shoot.png',
  edit: '/identity-mascots/edit.png',
  pr: '/identity-mascots/pr.png',
}

export function identityMascotSrc(workId: MpWorkIdentity): string {
  return IDENTITY_MASCOT_SRC[workId]
}

/** 达人招募小程序分享路径（与「墨典达人招募小程序」pages/detail 一致） */
export function mpRecruitmentSharePath(mpOrderId: string): string {
  return `pages/detail/detail?id=${encodeURIComponent(mpOrderId)}`
}

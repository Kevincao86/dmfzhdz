import type { MpWorkIdentity } from './mpWorkIdentity'

/** 侧栏 / 顶栏身份徽章共用 class 前缀（与 index.css 中 app-sidebar--* / app-topbar__role-badge--* 对应） */
export function identityShellClass(workId: MpWorkIdentity): string {
  return `app-sidebar--${workId}`
}

export function identityBadgeClass(workId: MpWorkIdentity): string {
  return `app-topbar__role-badge--${workId}`
}

/** 挂载在 .app-frame，驱动全站主色 / 渐变 / 按钮（见 index.css --identity-*） */
export function identityWorkAttr(workId: MpWorkIdentity): MpWorkIdentity {
  return workId
}

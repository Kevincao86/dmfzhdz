/** 转发代收·二维码加群（临时关闭，明日恢复） */
export const FORM_RELAY_GROUP_QR_ENABLED = false

export const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '即将开放'

export const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '二维码加群功能正在升级，预计明日开放，请稍后再试。'

export function isFormRelayGroupQrFeatureEnabled(): boolean {
  return FORM_RELAY_GROUP_QR_ENABLED
}

export function assertFormRelayGroupQrEnabled(): void {
  if (!FORM_RELAY_GROUP_QR_ENABLED) {
    throw new Error(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
  }
}

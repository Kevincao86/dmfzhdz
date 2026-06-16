/** 转发代收·二维码加群（转单工具专用，临时关闭；PR 发通知群码不受影响） */
export const FORM_RELAY_GROUP_QR_ENABLED = false

export const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '即将开放'

export const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '转单「二维码加群」正在升级，预计明日开放。PR 发通知上传群码不受影响。'

export function isFormRelayGroupQrFeatureEnabled(): boolean {
  return FORM_RELAY_GROUP_QR_ENABLED
}

export function assertFormRelayGroupQrEnabled(): void {
  if (!FORM_RELAY_GROUP_QR_ENABLED) {
    throw new Error(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
  }
}

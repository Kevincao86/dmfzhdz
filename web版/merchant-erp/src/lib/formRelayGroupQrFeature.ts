/** 转发代收·二维码加群（转单工具专用；PR 发通知群码不受影响） */
export const FORM_RELAY_GROUP_QR_ENABLED = true

export const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '暂未开放'

export const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '转单「二维码加群」暂未开放。PR 发通知上传群码不受影响。'

export function isFormRelayGroupQrFeatureEnabled(): boolean {
  return FORM_RELAY_GROUP_QR_ENABLED
}

export function assertFormRelayGroupQrEnabled(): void {
  if (!FORM_RELAY_GROUP_QR_ENABLED) {
    throw new Error(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
  }
}

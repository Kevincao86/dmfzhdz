/** 群二维码上传/下发（转发代收·二维码加群 + 星选反选群码，临时关闭，明日恢复） */
export const FORM_RELAY_GROUP_QR_ENABLED = false

export const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '即将开放'

export const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '群二维码功能正在升级，预计明日开放，请稍后再试。'

export function isFormRelayGroupQrFeatureEnabled(): boolean {
  return FORM_RELAY_GROUP_QR_ENABLED
}

/** 与 isFormRelayGroupQrFeatureEnabled 同义：星选反选群码、PR 补传等统一开关 */
export function isMpGroupQrUploadEnabled(): boolean {
  return FORM_RELAY_GROUP_QR_ENABLED
}

export function assertFormRelayGroupQrEnabled(): void {
  if (!FORM_RELAY_GROUP_QR_ENABLED) {
    throw new Error(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
  }
}

export function assertMpGroupQrUploadEnabled(): void {
  assertFormRelayGroupQrEnabled()
}

/** 转发代收·二维码加群（临时关闭，明日恢复） */
const FORM_RELAY_GROUP_QR_ENABLED = false

const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '即将开放'

const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '二维码加群功能正在升级，预计明日开放，请稍后再试。'

function isFormRelayGroupQrFeatureEnabled() {
  return FORM_RELAY_GROUP_QR_ENABLED
}

function showFormRelayGroupQrComingSoon() {
  wx.showModal({
    title: FORM_RELAY_GROUP_QR_COMING_SOON_TITLE,
    content: FORM_RELAY_GROUP_QR_COMING_SOON_MSG,
    showCancel: false,
  })
}

module.exports = {
  FORM_RELAY_GROUP_QR_ENABLED,
  FORM_RELAY_GROUP_QR_COMING_SOON_TITLE,
  FORM_RELAY_GROUP_QR_COMING_SOON_MSG,
  isFormRelayGroupQrFeatureEnabled,
  showFormRelayGroupQrComingSoon,
}

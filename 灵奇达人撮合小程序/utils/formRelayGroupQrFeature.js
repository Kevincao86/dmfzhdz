/** 转发代收·二维码加群 */
const FORM_RELAY_GROUP_QR_ENABLED = true

const FORM_RELAY_GROUP_QR_COMING_SOON_TITLE = '暂未开放'

const FORM_RELAY_GROUP_QR_COMING_SOON_MSG =
  '转单「二维码加群」暂未开放。PR 发通知上传群码不受影响。'

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

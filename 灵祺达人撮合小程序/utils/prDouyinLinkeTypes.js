const userProfile = require('./userProfile.js')

const PR_DOUYIN_LINKE_COPY = {
  brandAlt: '抖音林客',
  sectionTitle: '抖音林客 · 服务商应用',
  sectionIntro:
    '绑定生活服务开放平台创建的「服务商应用」。完成林客授权后，可添加代运营客户商家；发招募时可选择挂接林客商家并自动同步定向招募。',
  bindButton: '绑定抖音林客',
  addClientButton: '添加客户商家',
  publishAttachTitle: '是否挂接抖音林客商家',
  publishAttachHint: '选「是」后，报名满员并通知达人时将自动在林客端创建定向招募并同步达人佣金与结算费用。',
}

function emptyPublishLinkeAttach() {
  const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
  return {
    enabled: false,
    clientId: '',
    merchantAccountId: '',
    merchantDisplayName: '',
    productIds: [],
    merchantPhone: String(pr.contactPhone || '').trim(),
  }
}

module.exports = {
  PR_DOUYIN_LINKE_COPY,
  emptyPublishLinkeAttach,
}

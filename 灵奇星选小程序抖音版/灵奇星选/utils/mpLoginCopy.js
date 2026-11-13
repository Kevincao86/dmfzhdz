const config = require('./config.js')

const WECHAT = {
  platformName: '微信',
  oauthTab: '微信登录',
  oauthButton: '微信一键登录',
  oauthBannerText: '使用微信昵称头像登录，即可发招募、报名与导出',
  oauthBannerBtn: '微信登录',
  sheetTitle: '微信登录 / 注册',
  sheetHint: '授权头像与昵称后，达人/PR 身份共用同一微信账号',
  nickPlaceholder: '点击选用微信昵称',
  loginSub: '微信登录后使用完整功能',
  authAvatarTitle: '获取微信头像',
  authNickTitle: '获取微信昵称',
  authAvatarHint: '请点击下方头像按钮，授权您的微信头像',
  authNickHint: '请点击输入框，选用您的微信昵称',
  legalOAuthText: '使用微信一键登录前，请勾选并同意《用户协议》和《隐私政策》。',
  toastNeedAvatar: '请先授权微信头像',
  toastNeedNick: '请选用微信昵称',
  toastPickNick: '请选用微信昵称',
  toastAuthAvatar: '请授权微信头像',
  errNickRequired: '请填写或选择微信昵称',
  errLoginFailed: '微信登录失败',
  sheetNickPlaceholder: '点击选用微信昵称',
  confirmNickToast: '请填写微信昵称',
  confirmNickTapToast: '请点击昵称框选用微信昵称',
}

const DOUYIN = {
  platformName: '抖音',
  oauthTab: '抖音登录',
  oauthButton: '抖音一键登录',
  oauthBannerText: '使用抖音昵称头像登录，即可发招募、报名与导出',
  oauthBannerBtn: '抖音登录',
  sheetTitle: '抖音登录 / 注册',
  sheetHint: '授权头像与昵称后，达人/PR 身份共用同一抖音账号',
  nickPlaceholder: '点击填写抖音昵称',
  loginSub: '抖音登录后使用完整功能',
  authAvatarTitle: '获取抖音头像',
  authNickTitle: '获取抖音昵称',
  authAvatarHint: '请点击下方头像按钮，授权您的抖音头像',
  authNickHint: '请点击输入框，填写您的抖音昵称',
  legalOAuthText: '使用抖音一键登录前，请勾选并同意《用户协议》和《隐私政策》。',
  toastNeedAvatar: '请先授权抖音头像',
  toastNeedNick: '请填写抖音昵称',
  toastPickNick: '请填写抖音昵称',
  toastAuthAvatar: '请授权抖音头像',
  errNickRequired: '请填写或选择抖音昵称',
  errLoginFailed: '抖音登录失败',
  sheetNickPlaceholder: '点击填写抖音昵称',
  confirmNickToast: '请填写抖音昵称',
  confirmNickTapToast: '请点击昵称框填写抖音昵称',
}

function getOauthLoginCopy() {
  return config.MP_PLATFORM === 'douyin' ? DOUYIN : WECHAT
}

module.exports = {
  getOauthLoginCopy,
}

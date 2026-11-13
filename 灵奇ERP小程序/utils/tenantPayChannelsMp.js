/** 商家 ERP 小程序仅支持微信支付（与小程序环境一致） */
const { assetUrl } = require('./mpStaticAssets.js')

module.exports = {
  TENANT_PAY_CHANNELS: [
    { id: 'wechat', label: '微信支付', icon: assetUrl('payment/wechat.png') },
  ],
}

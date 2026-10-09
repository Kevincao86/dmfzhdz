const { MP_ICP_FILING, MP_PSB_FILING } = require('../../utils/siteIcp')

/** 底部输入栏，页脚留在文档流里，避免挡住发送 */
const FLOW_ROUTES = {
  'pages/messages/messages': true,
  'pages/subpack-pr/chat/chat': true,
  'pages/subpack-pr/order-group-chat/order-group-chat': true,
  'pages/subpack-mine/mine-support-chat/mine-support-chat': true,
}

/** 已有底栏的页面：页脚抬到该栏上方 */
const LIFT_BOTTOM = {
  'pages/index/index': 'calc(100rpx + env(safe-area-inset-bottom))',
  'pages/recommend/recommend': 'calc(100rpx + env(safe-area-inset-bottom))',
  'pages/mine/mine': 'calc(100rpx + env(safe-area-inset-bottom))',
  'pages/publish/publish': 'calc(132rpx + env(safe-area-inset-bottom))',
  'pages/subpack-mine/mine-local-life-eval/mine-local-life-eval': 'calc(100rpx + env(safe-area-inset-bottom))',
  'pages/subpack-core/detail/detail': 'calc(128rpx + env(safe-area-inset-bottom))',
  'pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants': 'calc(180rpx + env(safe-area-inset-bottom))',
  'pages/subpack-pr/mine-pr-targeted-pick/mine-pr-targeted-pick': 'calc(140rpx + env(safe-area-inset-bottom))',
  'pages/subpack-mine/mine-training-account/mine-training-account': 'calc(140rpx + env(safe-area-inset-bottom))',
  'pages/subpack-mine/mine-training-post/mine-training-post': 'calc(140rpx + env(safe-area-inset-bottom))',
  'pages/subpack-mine/mine-template-edit/mine-template-edit': 'calc(148rpx + env(safe-area-inset-bottom))',
}

function currentRoute() {
  const pages = getCurrentPages()
  const cur = pages && pages.length ? pages[pages.length - 1] : null
  return (cur && cur.route) || ''
}

Component({
  properties: {
    compact: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    filing: MP_ICP_FILING,
    psbFiling: MP_PSB_FILING,
    docked: true,
    safePad: true,
    dockStyle: 'bottom:0;',
    spacerH: 'calc(120rpx + env(safe-area-inset-bottom))',
  },
  lifetimes: {
    attached() {
      const route = currentRoute()
      if (FLOW_ROUTES[route]) {
        this.setData({ docked: false, safePad: false, dockStyle: '', spacerH: '0' })
        return
      }
      const lift = LIFT_BOTTOM[route]
      if (lift) {
        this.setData({
          docked: true,
          safePad: false,
          dockStyle: `bottom:${lift};`,
          spacerH: '120rpx',
        })
        return
      }
      this.setData({
        docked: true,
        safePad: true,
        dockStyle: 'bottom:0;',
        spacerH: 'calc(120rpx + env(safe-area-inset-bottom))',
      })
    },
  },
})

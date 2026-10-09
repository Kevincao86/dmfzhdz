const { MP_ICP_FILING, MP_PSB_FILING } = require('../../utils/siteIcp')

/** 底部输入栏，页脚留在文档流里 */
const FLOW_ROUTES = {
  'pages/support-chat/support-chat': true,
  'pages/ai-agent/ai-agent': true,
}

/** 已有底栏的页面：页脚抬到该栏上方 */
const LIFT_BOTTOM = {
  'pages/dashboard/dashboard': 'calc(98rpx + env(safe-area-inset-bottom))',
  'pages/shop-eval/shop-eval': 'calc(98rpx + env(safe-area-inset-bottom))',
  'pages/functions/functions': 'calc(98rpx + env(safe-area-inset-bottom))',
  'pages/mine/mine': 'calc(98rpx + env(safe-area-inset-bottom))',
  'pages/product-create/product-create': 'calc(140rpx + env(safe-area-inset-bottom))',
  'pages/geo-assist/geo-assist': 'calc(140rpx + env(safe-area-inset-bottom))',
}

function currentRoute() {
  const pages = getCurrentPages()
  const cur = pages && pages.length ? pages[pages.length - 1] : null
  return (cur && cur.route) || ''
}

Component({
  data: {
    copyright: `© ${new Date().getFullYear()} 温州灵祺智能科技有限公司 Copyright. All Rights Reserved.`,
    filing: MP_ICP_FILING,
    psbFiling: MP_PSB_FILING,
    docked: true,
    safePad: true,
    dockStyle: 'bottom:0;',
    spacerH: 'calc(132rpx + env(safe-area-inset-bottom))',
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
          spacerH: '132rpx',
        })
        return
      }
      this.setData({
        docked: true,
        safePad: true,
        dockStyle: 'bottom:0;',
        spacerH: 'calc(132rpx + env(safe-area-inset-bottom))',
      })
    },
  },
})

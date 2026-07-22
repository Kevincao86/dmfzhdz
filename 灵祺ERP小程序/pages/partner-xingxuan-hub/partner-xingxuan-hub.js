const fwsWeb = require('../../utils/fwsWebBridgeMp.js')

const XINGXUAN_ITEMS = [
  { title: '招募大厅', desc: '浏览可接单达人', path: '/recruitment/xingxuan/hall' },
  { title: '发布招募', desc: '新建星选发单', path: '/recruitment/xingxuan/publish' },
  { title: '我的发单', desc: '发单进度与状态', path: '/recruitment/xingxuan/orders' },
  { title: '商单日历', desc: '排期与档期', path: '/recruitment/xingxuan/calendar' },
  { title: '转发工具', desc: '表单转发给客户', path: '/recruitment/xingxuan/form-relay' },
  { title: '我的模版', desc: '招募模版库', path: '/recruitment/xingxuan/templates' },
  { title: '消息', desc: '星选站内消息', path: '/recruitment/xingxuan/messages' },
  { title: '增值服务', desc: 'Brief · 短视频 · 数字人', path: '/recruitment/xingxuan/addons' },
]

Page({
  data: {
    items: XINGXUAN_ITEMS.map((it) => ({
      ...it,
      url: fwsWeb.fwsWebPageUrl(it.path),
    })),
  },
})

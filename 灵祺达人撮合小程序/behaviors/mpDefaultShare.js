/** 未自定义分享的页面：统一 AI 封面 + 跳转招募大厅 */
const mpShare = require('../utils/mpShare.js')

module.exports = Behavior({
  pageLifetimes: {
    show() {
      mpShare.enableShareMenu()
    },
  },
  methods: {
    onShareAppMessage() {
      return mpShare.defaultShare('/pages/index/index')
    },
    onShareTimeline() {
      return mpShare.defaultTimelineShare()
    },
  },
})

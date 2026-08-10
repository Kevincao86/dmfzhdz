/** 与 Web RecruitmentPage 中 FLOW 步骤标题一致 */
Page({
  data: {
    steps: [
      { key: 'publish', url: '/pages/recruit-publish-pick/recruit-publish-pick', title: '发布招募需求', desc: '', tone: 'blue' },
      { key: 'talent', url: '/pages/recruit-talent-pool/recruit-talent-pool', title: '达人池筛选', desc: '', tone: 'indigo' },
      { key: 'schedule', url: '/pages/recruit-schedule/recruit-schedule', title: '排期编排', desc: '', tone: 'cyan' },
      { key: 'review', url: '/pages/recruit-video-review/recruit-video-review', title: '视频审核管理', desc: '', tone: 'violet' },
      { key: 'payment', url: '/pages/recruit-payment/recruit-payment', title: '结款账单', desc: '', tone: 'gray' },
    ],
  },
  goPick() {
    wx.navigateTo({ url: '/pages/recruit-publish-pick/recruit-publish-pick' })
  },
})

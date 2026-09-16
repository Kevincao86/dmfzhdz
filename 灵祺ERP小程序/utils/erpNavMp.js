/**
 * ERP 功能导航 — 与 Web nav.ts 路径对齐，供智能体快捷任务跳转。
 */
const TASK_NAV = {
  create_product: '/pages/product-list/product-list',
  recruit_influencer: '/pages/recruitment/recruitment',
  handle_review: '/pages/reviews-list/reviews-list',
  optimize_local_ads: '/pages/ads-manage/ads-manage',
  follow_local_lead: '/pages/leads-center/leads-center',
  sync_platform: '/pages/product-list/product-list',
  analyze_exception: '/pages/dashboard/dashboard',
  generate_copywriting: '/pages/ai-content/ai-content',
  file_tax: '/pages/finance-tax/finance-tax',
  general: '/pages/functions/functions',
}

const MODULE_PAGES = {
  store_info: '/pages/store-list/store-list?mode=info',
  store_decoration: '/pages/store-list/store-list?mode=decoration',
  store_menu: '/pages/store-menu/store-menu',
  store_analysis: '/pages/store-analysis/store-analysis',
  competitors: '/pages/competitors/competitors',
  settings: '/pages/mine/mine',
}

const TAB_PATHS = [
  '/pages/functions/functions',
  '/pages/dashboard/dashboard',
  '/pages/ai-agent/ai-agent',
  '/pages/mine/mine',
]

function isTabUrl(url) {
  const p = String(url || '').split('?')[0]
  return TAB_PATHS.includes(p)
}

function openUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) {
    wx.showToast({ title: '功能暂未开放', icon: 'none' })
    return
  }
  if (isTabUrl(raw)) {
    wx.switchTab({
      url: raw.split('?')[0],
      fail() {
        wx.showToast({ title: '无法切换到该页', icon: 'none' })
      },
    })
    return
  }
  wx.navigateTo({
    url: raw,
    fail() {
      wx.showToast({ title: '页面打开失败，请重新编译', icon: 'none' })
    },
  })
}

function navForTaskType(taskType) {
  return TASK_NAV[taskType] || TASK_NAV.general
}

function openTaskPage(taskType) {
  openUrl(navForTaskType(taskType))
}

module.exports = {
  TASK_NAV,
  MODULE_PAGES,
  TAB_PATHS,
  isTabUrl,
  openUrl,
  navForTaskType,
  openTaskPage,
}

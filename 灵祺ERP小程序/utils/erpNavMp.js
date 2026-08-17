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
  digital_human: '/pages/digital-human/digital-human',
  ai_ops_plan: '/pages/ai-ops-plan/ai-ops-plan',
  settings: '/pages/mine/mine',
}

function navForTaskType(taskType) {
  return TASK_NAV[taskType] || TASK_NAV.general
}

function openTaskPage(taskType) {
  const url = navForTaskType(taskType)
  if (!url) return
  if (url.includes('/pages/functions/') || url.includes('/pages/agent/') || url.includes('/pages/dashboard/') || url.includes('/pages/mine/')) {
    wx.switchTab({ url })
    return
  }
  wx.navigateTo({ url })
}

module.exports = {
  TASK_NAV,
  MODULE_PAGES,
  navForTaskType,
  openTaskPage,
}

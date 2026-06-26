/**
 * 星选增值 API 客户端
 */
const api = require('./api.js')

const PATH = '/erp-api/meoo-ops-mp-xingxuan-enhance'

async function call(action, payload) {
  if (!api.hasApi()) throw new Error('网络未配置')
  const res = await api.post(PATH, { action, ...(payload || {}) })
  if (!res || res.ok === false) {
    throw new Error((res && (res.detail || res.error || res.message)) || '请求失败')
  }
  return res
}

module.exports = {
  getSubscriptions: () => call('get_subscriptions'),
  saveSubscriptions: (subscription, enabled) =>
    call('save_subscriptions', { subscription, enabled }),
  matchSubscriptionOrders: () => call('match_subscription_orders'),
  getCooperationPool: () => call('get_cooperation_pool'),
  syncCooperationPool: () => call('sync_cooperation_pool'),
  upsertCooperation: (entry) => call('upsert_cooperation', { entry }),
  removeCooperation: (entryId) => call('remove_cooperation', { entryId }),
  getBriefTemplates: () => call('get_brief_templates'),
  upsertBriefTemplate: (template) => call('upsert_brief_template', { template }),
  removeBriefTemplate: (templateId) => call('remove_brief_template', { templateId }),
  getTalentCredit: (match) => call('get_talent_credit', match ? { match } : {}),
  batchApplicantTrust: (talents) => call('batch_applicant_trust', { talents }),
  checkApplySchedule: (payload) => call('check_apply_schedule', payload || {}),
  suggestRouteBundles: (payload) => call('suggest_route_bundles', payload || {}),
  getTalentWatchlist: (list) => call('get_talent_watchlist', list ? { list } : {}),
  upsertWatchlist: (list, entry) => call('upsert_watchlist', { list, entry }),
  removeWatchlist: (list, entryId) => call('remove_watchlist', { list, entryId }),
  watchlistFromApplicant: (mpOrderId, applicantId, list, reason) =>
    call('watchlist_from_applicant', { mpOrderId, applicantId, list, reason }),
  getFulfillmentTimeline: (mpOrderId, applicantId) =>
    call('get_fulfillment_timeline', { mpOrderId, applicantId }),
  getRecruitmentFunnel: (mpOrderId) =>
    call('get_recruitment_funnel', mpOrderId ? { mpOrderId } : {}),
  suggestQuote: (payload) => call('suggest_quote', payload || {}),
  videoSubmitChecklist: (payload) => call('video_submit_checklist', payload || {}),
}

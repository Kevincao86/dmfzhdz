import { getToken } from '../mpSession'
import { apiUrl } from '../mpApiBase'

async function callEnhance<T extends Record<string, unknown>>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl('/api/meoo-ops-mp-xingxuan-enhance'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
    },
    body: JSON.stringify({ action, ...(payload || {}) }),
  })
  const data = (await res.json()) as T & { ok?: boolean; error?: string; detail?: string; message?: string }
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.message || data.detail || data.error || `http_${res.status}`))
  }
  return data
}

export const xingxuanEnhanceApi = {
  getSubscriptions: () => callEnhance('get_subscriptions'),
  saveSubscriptions: (subscription: Record<string, unknown>, enabled: boolean) =>
    callEnhance('save_subscriptions', { subscription, enabled }),
  matchSubscriptionOrders: () => callEnhance('match_subscription_orders'),
  getCooperationPool: () => callEnhance('get_cooperation_pool'),
  syncCooperationPool: () => callEnhance('sync_cooperation_pool'),
  upsertCooperation: (entry: Record<string, unknown>) => callEnhance('upsert_cooperation', { entry }),
  removeCooperation: (entryId: string) => callEnhance('remove_cooperation', { entryId }),
  getBriefTemplates: () => callEnhance('get_brief_templates'),
  upsertBriefTemplate: (template: Record<string, unknown>) =>
    callEnhance('upsert_brief_template', { template }),
  removeBriefTemplate: (templateId: string) => callEnhance('remove_brief_template', { templateId }),
  getTalentCredit: (match?: Record<string, unknown>) =>
    callEnhance('get_talent_credit', match ? { match } : {}),
  batchApplicantTrust: (talents: Record<string, unknown>[]) =>
    callEnhance('batch_applicant_trust', { talents }),
  checkApplySchedule: (payload: Record<string, unknown>) => callEnhance('check_apply_schedule', payload),
  suggestRouteBundles: (payload: Record<string, unknown>) => callEnhance('suggest_route_bundles', payload),
  getTalentWatchlist: (list?: string) => callEnhance('get_talent_watchlist', list ? { list } : {}),
  upsertWatchlist: (list: string, entry: Record<string, unknown>) =>
    callEnhance('upsert_watchlist', { list, entry }),
  removeWatchlist: (list: string, entryId: string) => callEnhance('remove_watchlist', { list, entryId }),
  watchlistFromApplicant: (mpOrderId: string, applicantId: string, list: string, reason?: string) =>
    callEnhance('watchlist_from_applicant', { mpOrderId, applicantId, list, reason }),
  getFulfillmentTimeline: (mpOrderId: string, applicantId: string) =>
    callEnhance('get_fulfillment_timeline', { mpOrderId, applicantId }),
  getRecruitmentFunnel: (mpOrderId?: string) =>
    callEnhance('get_recruitment_funnel', mpOrderId ? { mpOrderId } : {}),
  suggestQuote: (payload: Record<string, unknown>) => callEnhance('suggest_quote', payload),
  videoSubmitChecklist: (payload: Record<string, unknown>) =>
    callEnhance('video_submit_checklist', payload),
}

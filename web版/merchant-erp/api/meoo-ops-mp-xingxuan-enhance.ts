/**
 * POST /api/meoo-ops-mp-xingxuan-enhance — 星选增值统一入口（action 分发）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createMpAuthRest, resolveSession, type MpAccountRow } from '../src/lib/mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  findRegistryMemberForAccount,
  findRegistryPrForAccount,
} from '../src/lib/mpRegistryProfileGet.js'
import {
  buildFulfillmentTimeline,
  buildVideoSubmitChecklist,
  computePrFunnelOverview,
  computeRecruitmentFunnel,
  computeTalentCredit,
  listPrBriefTemplates,
  listPrCooperationPool,
  normalizeOrderSubscription,
  orderMatchesSubscription,
  removeBriefTemplate,
  removeCooperationPoolEntry,
  saveMemberOrderSubscription,
  suggestQuoteRange,
  syncCooperationPoolFromCompletedOrders,
  upsertBriefTemplate,
  upsertCooperationPoolEntry,
  type MpBriefStructured,
} from '../src/lib/mpXingxuanEnhanceCore.js'
import {
  batchComputeTalentCredit,
  batchCooperationPoolHits,
  batchWatchlistHitsForApplicants,
  checkApplyScheduleConflict,
  collectTalentConfirmedSchedules,
  findCooperationPoolEntry,
  findOrderPrUser,
  findTalentWatchlistHit,
  listPrWatchlist,
  removeWatchlistEntry,
  suggestRouteBundledOrders,
  upsertWatchlistEntry,
  watchlistEntryFromApplicant,
  type TalentIdentityMatch,
} from '../src/lib/mpXingxuanTrustCore.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function sessionToken(req: VercelRequest): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

function patchMember(data: RegistryFile, memberId: string, patch: (m: NonNullable<ReturnType<typeof findRegistryMemberForAccount>>) => NonNullable<ReturnType<typeof findRegistryMemberForAccount>>) {
  const members = data.mpTalentMembers ?? []
  const ix = members.findIndex((m) => m.id === memberId)
  if (ix < 0) return false
  members[ix] = patch(members[ix]!)
  data.mpTalentMembers = members
  return true
}

function patchPr(data: RegistryFile, prId: string, patch: (p: NonNullable<ReturnType<typeof findRegistryPrForAccount>>) => NonNullable<ReturnType<typeof findRegistryPrForAccount>>) {
  const users = data.mpPrUsers ?? []
  const ix = users.findIndex((u) => u.id === prId)
  if (ix < 0) return false
  users[ix] = patch(users[ix]!)
  data.mpPrUsers = users
  return true
}

function findApplicant(data: RegistryFile, mpOrderId: string, applicantId: string) {
  const order = (data.mpRecruitmentOrders ?? []).find((o) => o.id === mpOrderId)
  if (!order) return { order: null, applicant: null }
  const applicant = (order.applicants ?? []).find((a) => a.id === applicantId) ?? null
  return { order, applicant }
}

async function handleAction(
  action: string,
  body: Record<string, unknown>,
  account: MpAccountRow,
  data: RegistryFile,
): Promise<{ status: number; body: Record<string, unknown>; save?: boolean }> {
  const role = account.active_role
  const orders = data.mpRecruitmentOrders ?? []

  switch (action) {
    case 'get_subscriptions': {
      const member = findRegistryMemberForAccount(data, account)
      if (!member) return { status: 404, body: { ok: false, error: 'member_not_found' } }
      return {
        status: 200,
        body: { ok: true, subscription: normalizeOrderSubscription(member.orderSubscription) },
      }
    }
    case 'save_subscriptions': {
      if (role === 'pr') return { status: 403, body: { ok: false, error: 'talent_only' } }
      const member = findRegistryMemberForAccount(data, account)
      if (!member) return { status: 404, body: { ok: false, error: 'member_not_found' } }
      const prefs = normalizeOrderSubscription(body.subscription)
      prefs.enabled = body.enabled === true || prefs.enabled
      const ok = patchMember(data, member.id, (m) => saveMemberOrderSubscription(m, prefs))
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, subscription: prefs }, save: true }
    }
    case 'match_subscription_orders': {
      const member = findRegistryMemberForAccount(data, account)
      if (!member) return { status: 404, body: { ok: false, error: 'member_not_found' } }
      const prefs = normalizeOrderSubscription(member.orderSubscription)
      const matched = orders
        .filter((o) => o.status === 'open' || o.status === 'collecting')
        .filter((o) => orderMatchesSubscription(o, prefs))
        .slice(0, 20)
        .map((o) => ({ id: o.id, title: o.title, platform: o.platform, region: o.region, urgent: o.urgent }))
      return { status: 200, body: { ok: true, matched, subscription: prefs } }
    }
    case 'get_cooperation_pool': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      return { status: 200, body: { ok: true, pool: listPrCooperationPool(pr) } }
    }
    case 'sync_cooperation_pool': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const synced = syncCooperationPoolFromCompletedOrders(data, pr)
      const ok = patchPr(data, pr.id, () => synced)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, pool: listPrCooperationPool(synced) }, save: true }
    }
    case 'upsert_cooperation': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const entry = body.entry as Record<string, unknown> | undefined
      if (!entry) return { status: 400, body: { ok: false, error: 'entry_required' } }
      const next = upsertCooperationPoolEntry(pr, {
        id: entry.id as string | undefined,
        talentMemberId: entry.talentMemberId as string | undefined,
        lingqiTalentId: entry.lingqiTalentId as string | undefined,
        talentLibraryId: entry.talentLibraryId as string | undefined,
        displayName: String(entry.displayName || '达人'),
        platform: entry.platform as string | undefined,
        avatarUrl: entry.avatarUrl as string | undefined,
        tags: Array.isArray(entry.tags) ? (entry.tags as string[]) : [],
        note: entry.note as string | undefined,
        lastCoopAt: entry.lastCoopAt as string | undefined,
      })
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, pool: listPrCooperationPool(next) }, save: true }
    }
    case 'remove_cooperation': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const entryId = String(body.entryId || '').trim()
      if (!entryId) return { status: 400, body: { ok: false, error: 'entry_id_required' } }
      const next = removeCooperationPoolEntry(pr, entryId)
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, pool: listPrCooperationPool(next) }, save: true }
    }
    case 'get_brief_templates': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      return { status: 200, body: { ok: true, templates: listPrBriefTemplates(pr) } }
    }
    case 'upsert_brief_template': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const tpl = body.template as Record<string, unknown> | undefined
      if (!tpl) return { status: 400, body: { ok: false, error: 'template_required' } }
      const next = upsertBriefTemplate(pr, {
        id: tpl.id as string | undefined,
        title: String(tpl.title || 'Brief 模版'),
        brief: (tpl.brief || {}) as MpBriefStructured,
        bodyMarkdown: tpl.bodyMarkdown as string | undefined,
      })
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, templates: listPrBriefTemplates(next) }, save: true }
    }
    case 'remove_brief_template': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const tplId = String(body.templateId || '').trim()
      if (!tplId) return { status: 400, body: { ok: false, error: 'template_id_required' } }
      const next = removeBriefTemplate(pr, tplId)
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return { status: 200, body: { ok: true, templates: listPrBriefTemplates(next) }, save: true }
    }
    case 'get_talent_credit': {
      const member = findRegistryMemberForAccount(data, account)
      const bodyMatch = body.match as Record<string, unknown> | undefined
      const credit = computeTalentCredit(orders, {
        talentMemberId: String(bodyMatch?.talentMemberId || member?.id || '').trim() || undefined,
        wxOpenId: String(bodyMatch?.wxOpenId || account.openid || '').trim() || undefined,
        lingqiTalentId: String(
          bodyMatch?.lingqiTalentId || member?.lingqiTalentId || account.lingqi_talent_id || '',
        ).trim() || undefined,
        platformAccount: String(bodyMatch?.platformAccount || '').trim() || undefined,
      })
      return { status: 200, body: { ok: true, credit } }
    }
    case 'batch_talent_credit': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const talents = Array.isArray(body.talents) ? (body.talents as TalentIdentityMatch[]) : []
      const credits = batchComputeTalentCredit(orders, talents)
      return { status: 200, body: { ok: true, credits } }
    }
    case 'batch_applicant_trust': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const talents = Array.isArray(body.talents) ? (body.talents as TalentIdentityMatch[]) : []
      return {
        status: 200,
        body: {
          ok: true,
          credits: batchComputeTalentCredit(orders, talents),
          watchlist: batchWatchlistHitsForApplicants(pr, talents),
          cooperation: batchCooperationPoolHits(pr, talents),
        },
      }
    }
    case 'check_apply_schedule': {
      const mpOrderId = String(body.mpOrderId || '').trim()
      const order = orders.find((o) => o.id === mpOrderId)
      if (!order) return { status: 404, body: { ok: false, error: 'order_not_found' } }
      const member = findRegistryMemberForAccount(data, account)
      const applicant = {
        talentMemberId: member?.id,
        wxOpenId: account.openid,
        platformAccount: String(body.platformAccount || '').trim() || undefined,
      } as RegistryMpRecruitmentApplicant
      const preferredVisitDate = String(body.preferredVisitDate || body.visitDate || '').trim()
      const conflict = checkApplyScheduleConflict({
        orders,
        targetOrder: order,
        applicant,
        preferredVisitDate: preferredVisitDate || undefined,
      })
      const grayHit = findTalentWatchlistHit(findOrderPrUser(data, order), {
        talentMemberId: member?.id,
        wxOpenId: account.openid,
        platformAccount: applicant.platformAccount,
      })
      const bundles = suggestRouteBundledOrders({
        orders,
        targetOrder: order,
        talentCity: String(body.talentCity || member?.city || '').trim() || undefined,
        preferredVisitDate: preferredVisitDate || undefined,
      })
      return {
        status: 200,
        body: {
          ok: true,
          scheduleOk: conflict.ok,
          scheduleMessage: conflict.ok ? '' : conflict.message,
          conflicts: conflict.ok ? [] : conflict.conflicts,
          graylistWarning:
            grayHit?.list === 'graylist'
              ? `灰名单提醒：${grayHit.entry.reason || '该 PR 团队曾标记此达人需留意'}`
              : '',
          bundles,
        },
      }
    }
    case 'suggest_route_bundles': {
      const mpOrderId = String(body.mpOrderId || '').trim()
      const order = orders.find((o) => o.id === mpOrderId)
      if (!order) return { status: 404, body: { ok: false, error: 'order_not_found' } }
      const member = findRegistryMemberForAccount(data, account)
      const bundles = suggestRouteBundledOrders({
        orders,
        targetOrder: order,
        talentCity: String(body.talentCity || member?.city || '').trim() || undefined,
        preferredVisitDate: String(body.preferredVisitDate || body.visitDate || '').trim() || undefined,
      })
      return { status: 200, body: { ok: true, bundles } }
    }
    case 'get_talent_watchlist': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const list = body.list === 'graylist' ? 'graylist' : 'blacklist'
      return {
        status: 200,
        body: {
          ok: true,
          list,
          entries: listPrWatchlist(pr, list),
          blacklist: listPrWatchlist(pr, 'blacklist'),
          graylist: listPrWatchlist(pr, 'graylist'),
        },
      }
    }
    case 'upsert_watchlist': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const list = body.list === 'graylist' ? 'graylist' : 'blacklist'
      const entryRaw = body.entry as Record<string, unknown> | undefined
      if (!entryRaw) return { status: 400, body: { ok: false, error: 'entry_required' } }
      const next = upsertWatchlistEntry(pr, list, {
        id: entryRaw.id as string | undefined,
        talentMemberId: entryRaw.talentMemberId as string | undefined,
        lingqiTalentId: entryRaw.lingqiTalentId as string | undefined,
        platformAccount: entryRaw.platformAccount as string | undefined,
        wxOpenId: entryRaw.wxOpenId as string | undefined,
        displayName: String(entryRaw.displayName || '达人'),
        platform: entryRaw.platform as string | undefined,
        reason: entryRaw.reason as string | undefined,
        addedBy: account.lingqi_pr_id || account.openid,
      })
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return {
        status: 200,
        body: {
          ok: true,
          list,
          entries: listPrWatchlist(next, list),
          blacklist: listPrWatchlist(next, 'blacklist'),
          graylist: listPrWatchlist(next, 'graylist'),
        },
        save: true,
      }
    }
    case 'remove_watchlist': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const list = body.list === 'graylist' ? 'graylist' : 'blacklist'
      const entryId = String(body.entryId || '').trim()
      if (!entryId) return { status: 400, body: { ok: false, error: 'entry_id_required' } }
      const next = removeWatchlistEntry(pr, list, entryId)
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return {
        status: 200,
        body: {
          ok: true,
          list,
          entries: listPrWatchlist(next, list),
          blacklist: listPrWatchlist(next, 'blacklist'),
          graylist: listPrWatchlist(next, 'graylist'),
        },
        save: true,
      }
    }
    case 'watchlist_from_applicant': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      const mpOrderId = String(body.mpOrderId || '').trim()
      const applicantId = String(body.applicantId || '').trim()
      const list = body.list === 'graylist' ? 'graylist' : 'blacklist'
      const reason = String(body.reason || '').trim() || undefined
      const { applicant } = findApplicant(data, mpOrderId, applicantId)
      if (!applicant) return { status: 404, body: { ok: false, error: 'applicant_not_found' } }
      const next = upsertWatchlistEntry(pr, list, {
        ...watchlistEntryFromApplicant(applicant, reason),
        addedBy: account.lingqi_pr_id || account.openid,
      })
      const ok = patchPr(data, pr.id, () => next)
      if (!ok) return { status: 500, body: { ok: false, error: 'patch_failed' } }
      return {
        status: 200,
        body: {
          ok: true,
          list,
          entries: listPrWatchlist(next, list),
        },
        save: true,
      }
    }
    case 'get_fulfillment_timeline': {
      const mpOrderId = String(body.mpOrderId || '').trim()
      const applicantId = String(body.applicantId || '').trim()
      if (!mpOrderId || !applicantId) {
        return { status: 400, body: { ok: false, error: 'mp_order_id_and_applicant_id_required' } }
      }
      const { order, applicant } = findApplicant(data, mpOrderId, applicantId)
      if (!applicant) return { status: 404, body: { ok: false, error: 'applicant_not_found' } }
      return {
        status: 200,
        body: { ok: true, timeline: buildFulfillmentTimeline(applicant, order) },
      }
    }
    case 'get_recruitment_funnel': {
      if (role !== 'pr') return { status: 403, body: { ok: false, error: 'pr_only' } }
      const mpOrderId = String(body.mpOrderId || '').trim()
      const pr = findRegistryPrForAccount(data, account)
      if (!pr) return { status: 404, body: { ok: false, error: 'pr_not_found' } }
      if (mpOrderId) {
        const order = orders.find((o) => o.id === mpOrderId)
        if (!order) return { status: 404, body: { ok: false, error: 'order_not_found' } }
        return { status: 200, body: { ok: true, funnel: computeRecruitmentFunnel(order) } }
      }
      const overview = computePrFunnelOverview(orders, {
        prRegistryId: pr.id,
        lingqiPrId: pr.lingqiPrId,
      })
      return { status: 200, body: { ok: true, overview } }
    }
    case 'suggest_quote': {
      const result = suggestQuoteRange({
        followers: Number(body.followers) || 0,
        platform: String(body.platform || ''),
        city: String(body.city || ''),
        budgetText: String(body.budgetText || ''),
      })
      return { status: 200, body: { ok: true, quote: result } }
    }
    case 'video_submit_checklist': {
      const checklist = buildVideoSubmitChecklist({
        hasVideo: body.hasVideo === true,
        durationSec: typeof body.durationSec === 'number' ? body.durationSec : undefined,
        aiChecked: body.aiChecked === true,
        aiPassed: body.aiPassed === true,
        platform: String(body.platform || ''),
      })
      return { status: 200, body: { ok: true, checklist } }
    }
    default:
      return { status: 400, body: { ok: false, error: 'unknown_action', action } }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    const rest = createMpAuthRest(supabaseUrl, serviceRole)
    const token = sessionToken(req)
    const session = token ? await resolveSession(rest, token) : null
    if (!session?.account) {
      sendJson(res, 401, { ok: false, error: 'login_required' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const action = String(body.action || '').trim()
    if (!action) {
      sendJson(res, 400, { ok: false, error: 'action_required' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const result = await handleAction(action, body, session.account, data)
    if (result.save) {
      await io.save(data)
    }
    sendJson(res, result.status, result.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_xingxuan_enhance_failed',
      detail: msg.slice(0, 800),
    })
  }
}

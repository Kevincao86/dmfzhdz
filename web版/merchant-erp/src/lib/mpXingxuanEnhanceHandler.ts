import type { MpAccountRow } from './mpAccountAuth.js'
import type {
  MpBriefTemplate,
  MpCooperationPoolEntry,
  MpTalentWatchlistEntry,
  RegistryMpRecruitmentApplicant,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { findRegistryMemberForAccount } from './mpRegistryProfileGet.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { createMpAuthRest, resolveSession } from './mpAccountAuth.js'
import {
  buildRecruitmentFunnelOverview,
  computeTalentCreditForAccount,
  findCooperationHit,
  findWatchlistHit,
  matchSubscriptionOrders,
  normalizeSubscription,
  prOrdersForAccount,
  resolvePrUserIndex,
  suggestQuoteHeuristic,
  syncCooperationPoolFromOrders,
  upsertBriefTemplateList,
  type TalentMatchQuery,
} from './mpXingxuanEnhanceCore.js'

export type MpXingxuanEnhanceBody = Record<string, unknown> & { action?: string }

type HandlerCtx = {
  data: RegistrySnapshot
  account: MpAccountRow
  save: () => Promise<void>
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function talentQueryFrom(raw: unknown, fallbackKey = ''): TalentMatchQuery {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    key: str(o.key) || fallbackKey,
    talentMemberId: str(o.talentMemberId) || undefined,
    lingqiTalentId: str(o.lingqiTalentId) || undefined,
    platformAccount: str(o.platformAccount) || undefined,
    wxOpenId: str(o.wxOpenId) || undefined,
    platform: str(o.platform) || undefined,
  }
}

function requirePr(ctx: HandlerCtx) {
  const hit = resolvePrUserIndex(ctx.data, ctx.account)
  if (!hit) return { ok: false as const, error: 'pr_not_registered', status: 400 }
  return { ok: true as const, ...hit }
}

function watchlistEntryFromApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  reason?: string,
): MpTalentWatchlistEntry {
  const now = new Date().toISOString()
  return {
    id: `wl_${applicant.id}`,
    talentMemberId: applicant.talentMemberId,
    lingqiTalentId: applicant.talentMemberId,
    platformAccount: applicant.platformAccount,
    wxOpenId: applicant.wxOpenId,
    displayName: String(applicant.platformNickname || applicant.name || applicant.platformAccount || '达人'),
    platform: applicant.platform,
    reason: reason || '',
    addedAt: now,
  }
}

async function handleAction(ctx: HandlerCtx, body: MpXingxuanEnhanceBody): Promise<{ status: number; data: Record<string, unknown> }> {
  const action = str(body.action)
  if (!action) return { status: 400, data: { ok: false, error: 'missing_action' } }

  if (action === 'get_talent_credit') {
    const credit = computeTalentCreditForAccount(ctx.data, ctx.account, talentQueryFrom(body.match))
    return { status: 200, data: { ok: true, credit } }
  }

  if (action === 'get_subscriptions') {
    const member = findRegistryMemberForAccount(ctx.data, ctx.account)
    const subscription = member?.orderSubscription ?? normalizeSubscription({ enabled: false })
    return { status: 200, data: { ok: true, subscription } }
  }

  if (action === 'save_subscriptions') {
    const members = ctx.data.mpTalentMembers ?? []
    const member = findRegistryMemberForAccount(ctx.data, ctx.account)
    if (!member) return { status: 400, data: { ok: false, error: 'talent_not_registered' } }
    const idx = members.findIndex((m) => m.id === member.id)
    if (idx < 0) return { status: 400, data: { ok: false, error: 'talent_not_registered' } }
    const subscription = normalizeSubscription(body.subscription)
    subscription.enabled = body.enabled !== false && subscription.enabled
    members[idx] = { ...members[idx]!, orderSubscription: subscription, updatedAt: new Date().toISOString() }
    ctx.data.mpTalentMembers = members
    await ctx.save()
    return { status: 200, data: { ok: true, subscription } }
  }

  if (action === 'match_subscription_orders') {
    const member = findRegistryMemberForAccount(ctx.data, ctx.account)
    const subscription = member?.orderSubscription ?? normalizeSubscription({ enabled: false })
    const matched = matchSubscriptionOrders(ctx.data, subscription).map((o) => ({
      id: o.id,
      title: o.title || o.customerName || o.storeName,
      platform: o.platform,
      region: o.region,
      budgetText: o.budgetText,
    }))
    return { status: 200, data: { ok: true, matched } }
  }

  if (action === 'suggest_quote') {
    return { status: 200, data: { ok: true, ...suggestQuoteHeuristic(body) } }
  }

  const prHit = requirePr(ctx)
  if (!prHit.ok) {
    const prOnly = new Set([
      'get_cooperation_pool',
      'sync_cooperation_pool',
      'upsert_cooperation',
      'remove_cooperation',
      'get_brief_templates',
      'upsert_brief_template',
      'remove_brief_template',
      'get_talent_watchlist',
      'upsert_watchlist',
      'remove_watchlist',
      'watchlist_from_applicant',
      'get_recruitment_funnel',
      'batch_applicant_trust',
    ])
    if (prOnly.has(action)) return { status: prHit.status, data: { ok: false, error: prHit.error } }
  }

  const prCtx = prHit.ok ? prHit : null

  if (action === 'get_cooperation_pool' && prCtx) {
    return { status: 200, data: { ok: true, pool: prCtx.user.cooperationPool ?? [] } }
  }

  if (action === 'sync_cooperation_pool' && prCtx) {
    const orders = prOrdersForAccount(ctx.data, ctx.account)
    const pool = syncCooperationPoolFromOrders(prCtx.user, orders)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, cooperationPool: pool, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, pool } }
  }

  if (action === 'upsert_cooperation' && prCtx) {
    const entry = (body.entry || {}) as MpCooperationPoolEntry
    const id = str(entry.id) || `cp_${Date.now()}`
    const pool = [...(prCtx.user.cooperationPool ?? [])]
    const idx = pool.findIndex((e) => e.id === id)
    const next: MpCooperationPoolEntry = {
      ...entry,
      id,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      addedAt: entry.addedAt || new Date().toISOString(),
    }
    if (idx >= 0) pool[idx] = { ...pool[idx], ...next }
    else pool.unshift(next)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, cooperationPool: pool, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, pool } }
  }

  if (action === 'remove_cooperation' && prCtx) {
    const entryId = str(body.entryId)
    const pool = (prCtx.user.cooperationPool ?? []).filter((e) => e.id !== entryId)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, cooperationPool: pool, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, pool } }
  }

  if (action === 'get_brief_templates' && prCtx) {
    return { status: 200, data: { ok: true, templates: prCtx.user.briefTemplates ?? [] } }
  }

  if (action === 'upsert_brief_template' && prCtx) {
    const template = (body.template || {}) as MpBriefTemplate
    const templates = upsertBriefTemplateList(prCtx.user.briefTemplates ?? [], template)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, briefTemplates: templates, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, templates } }
  }

  if (action === 'remove_brief_template' && prCtx) {
    const templateId = str(body.templateId)
    const templates = (prCtx.user.briefTemplates ?? []).filter((t) => t.id !== templateId)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, briefTemplates: templates, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, templates } }
  }

  if (action === 'get_talent_watchlist' && prCtx) {
    return {
      status: 200,
      data: {
        ok: true,
        blacklist: prCtx.user.talentBlacklist ?? [],
        graylist: prCtx.user.talentGraylist ?? [],
      },
    }
  }

  if (action === 'upsert_watchlist' && prCtx) {
    const list = str(body.list) === 'graylist' ? 'graylist' : 'blacklist'
    const entry = (body.entry || {}) as MpTalentWatchlistEntry
    const id = str(entry.id) || `wl_${Date.now()}`
    const key = list === 'graylist' ? 'talentGraylist' : 'talentBlacklist'
    const arr = [...(prCtx.user[key] ?? [])]
    const idx = arr.findIndex((e) => e.id === id)
    const next = { ...entry, id, addedAt: entry.addedAt || new Date().toISOString() }
    if (idx >= 0) arr[idx] = { ...arr[idx], ...next }
    else arr.unshift(next)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, [key]: arr, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, [key]: arr } }
  }

  if (action === 'remove_watchlist' && prCtx) {
    const list = str(body.list) === 'graylist' ? 'graylist' : 'blacklist'
    const entryId = str(body.entryId)
    const key = list === 'graylist' ? 'talentGraylist' : 'talentBlacklist'
    const arr = (prCtx.user[key] ?? []).filter((e) => e.id !== entryId)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, [key]: arr, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, [key]: arr } }
  }

  if (action === 'watchlist_from_applicant' && prCtx) {
    const mpOrderId = str(body.mpOrderId)
    const applicantId = str(body.applicantId)
    const list = str(body.list) === 'graylist' ? 'graylist' : 'blacklist'
    const order = (ctx.data.mpRecruitmentOrders ?? []).find((o) => o.id === mpOrderId)
    const applicant = order?.applicants?.find((a) => a.id === applicantId)
    if (!applicant) return { status: 404, data: { ok: false, error: 'applicant_not_found' } }
    const entry = watchlistEntryFromApplicant(applicant, str(body.reason))
    const key = list === 'graylist' ? 'talentGraylist' : 'talentBlacklist'
    const arr = [...(prCtx.user[key] ?? [])]
    const idx = arr.findIndex((e) => e.id === entry.id)
    if (idx >= 0) arr[idx] = entry
    else arr.unshift(entry)
    const users = ctx.data.mpPrUsers ?? []
    users[prCtx.idx] = { ...prCtx.user, [key]: arr, updatedAt: new Date().toISOString() }
    ctx.data.mpPrUsers = users
    await ctx.save()
    return { status: 200, data: { ok: true, entry, list } }
  }

  if (action === 'get_recruitment_funnel' && prCtx) {
    const orders = prOrdersForAccount(ctx.data, ctx.account)
    const mpOrderId = str(body.mpOrderId)
    const scoped = mpOrderId ? orders.filter((o) => o.id === mpOrderId) : orders
    const overview = buildRecruitmentFunnelOverview(scoped)
    return { status: 200, data: { ok: true, overview } }
  }

  if (action === 'batch_applicant_trust' && prCtx) {
    const talents = Array.isArray(body.talents) ? body.talents : []
    const credits: Record<string, unknown> = {}
    const watchlist: Record<string, unknown> = {}
    const cooperation: Record<string, unknown> = {}
    for (const raw of talents) {
      const q = talentQueryFrom(raw)
      const key = q.key || str((raw as Record<string, unknown>).id)
      if (!key) continue
      credits[key] = computeTalentCreditForAccount(ctx.data, ctx.account, q)
      const wl = findWatchlistHit(prCtx.user, q)
      watchlist[key] = wl ? { list: wl.list, reason: wl.entry.reason } : null
      cooperation[key] = findCooperationHit(prCtx.user, q) ? true : false
    }
    return { status: 200, data: { ok: true, credits, watchlist, cooperation } }
  }

  if (action === 'check_apply_schedule') {
    const mpOrderId = str(body.mpOrderId)
    const query = talentQueryFrom(body)
    const member = findRegistryMemberForAccount(ctx.data, ctx.account)
    if (!query.talentMemberId) query.talentMemberId = str(member?.id || ctx.account.registry_member_id)
    if (!query.wxOpenId) query.wxOpenId = str(ctx.account.openid)

    let scheduleOk = true
    let scheduleMessage = ''

    let graylistWarning = ''
    const order = (ctx.data.mpRecruitmentOrders ?? []).find((o) => o.id === mpOrderId)
    if (order) {
      const meta =
        order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
          ? (order.mpPublishMeta as Record<string, unknown>)
          : {}
      const prLq = str(meta.lingqiPrId)
      const prReg = str(meta.registryPrId)
      const prUser = (ctx.data.mpPrUsers ?? []).find((u) => u.lingqiPrId === prLq || u.id === prReg)
      if (prUser) {
        const wl = findWatchlistHit(prUser, query)
        if (wl?.list === 'graylist') {
          graylistWarning = `该 PR 已将您列入灰名单：${wl.entry.reason || '请谨慎报名'}`
        }
        if (wl?.list === 'blacklist') {
          scheduleOk = false
          scheduleMessage = '您在该 PR 团队黑名单中，无法报名'
        }
      }
    }

    const bundles = (ctx.data.mpRecruitmentOrders ?? [])
      .filter((o) => o.status === 'open' || o.status === 'collecting')
      .filter((o) => o.id !== mpOrderId)
      .filter((o) => {
        const region = str(o.region)
        const city = str(body.talentCity)
        return !city || !region || region.includes(city) || city.includes(region)
      })
      .slice(0, 5)
      .map((o) => ({ id: o.id, title: o.title || o.customerName || o.storeName }))

    return {
      status: 200,
      data: { ok: true, scheduleOk, scheduleMessage, graylistWarning, bundles },
    }
  }

  if (action === 'suggest_route_bundles') {
    const city = str(body.talentCity || body.city)
    const bundles = (ctx.data.mpRecruitmentOrders ?? [])
      .filter((o) => o.status === 'open' || o.status === 'collecting')
      .filter((o) => {
        const region = str(o.region)
        return !city || !region || region.includes(city) || city.includes(region)
      })
      .slice(0, 6)
      .map((o) => ({ id: o.id, title: o.title || o.customerName || o.storeName }))
    return { status: 200, data: { ok: true, bundles } }
  }

  if (action === 'get_fulfillment_timeline') {
    const mpOrderId = str(body.mpOrderId)
    const applicantId = str(body.applicantId)
    const order = (ctx.data.mpRecruitmentOrders ?? []).find((o) => o.id === mpOrderId)
    const applicant = order?.applicants?.find((a) => a.id === applicantId)
    const events = applicant?.fulfillmentTimeline ?? []
    return { status: 200, data: { ok: true, events } }
  }

  if (action === 'video_submit_checklist') {
    const mpOrderId = str(body.mpOrderId)
    const order = (ctx.data.mpRecruitmentOrders ?? []).find((o) => o.id === mpOrderId)
    const checklist = [
      '确认探店日期与门店地址',
      '按 Brief 要求完成拍摄与口播',
      '成片时长与画幅符合招募说明',
      '无违规词与未授权素材',
      order?.briefStructured?.deliverables?.length
        ? `交付物：${order.briefStructured.deliverables.join('、')}`
        : '提交前核对招募详情中的交付要求',
    ]
    return { status: 200, data: { ok: true, checklist } }
  }

  return { status: 400, data: { ok: false, error: 'unknown_action', action } }
}

export async function handleMpXingxuanEnhanceBody(
  body: MpXingxuanEnhanceBody,
  opts: { supabaseUrl: string; serviceRole: string; token: string },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const rest = createMpAuthRest(opts.supabaseUrl, opts.serviceRole)
  const session = opts.token ? await resolveSession(rest, opts.token) : null
  if (!session?.account) {
    return { status: 401, data: { ok: false, error: 'login_required', message: '请先登录' } }
  }

  const io = createRegistrySnapshotIoFetch(opts.supabaseUrl, opts.serviceRole)
  const data = await io.load()
  const ctx: HandlerCtx = {
    data,
    account: session.account,
    save: async () => {
      await io.save(data)
    },
  }
  return handleAction(ctx, body)
}

/**
 * 巨量引擎千川 Open API 网关
 * 文档：https://open.oceanengine.com/labels/34
 * 基址：https://api.oceanengine.com
 */
import type { ServerResponse } from 'node:http'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { generateReviewReplyByDoubao } from './merchantAiUpstream.js'

const OE_BASE = (
  process.env.QIANCHUAN_API_BASE ??
  process.env.OCEANENGINE_API_BASE ??
  'https://ad.oceanengine.com'
).replace(/\/$/, '')

function mapOceanError(raw: string, status?: number): string {
  const s = raw.trim()
  const lower = s.toLowerCase()
  if (status === 404 || /not_found|page could not be found/.test(lower)) {
    return '巨量开放平台接口不可用，请检查授权或稍后重试。'
  }
  if (status && status >= 500) return '巨量开放平台暂时繁忙，请稍后再试。'
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return '连接巨量千川失败，请确认 Access Token 与广告主 ID 正确，并在开放平台开通线索/投放权限。'
  }
  return s
}

const AD_INSIGHT_ACTIONS_MARKER = '---ACTIONS---'

function parseAdInsightResponse(raw: string): {
  insight: string
  actions: Array<{
    actionId: string
    actionType: 'enable' | 'disable' | 'note'
    promotionId?: string
    promotionName?: string
    reason: string
  }>
} {
  const markerIdx = raw.indexOf(AD_INSIGHT_ACTIONS_MARKER)
  const insight =
    markerIdx >= 0 ? raw.slice(0, markerIdx).trim() : raw.trim()
  const actions: Array<{
    actionId: string
    actionType: 'enable' | 'disable' | 'note'
    promotionId?: string
    promotionName?: string
    reason: string
  }> = []
  if (markerIdx < 0) return { insight, actions }
  const tail = raw.slice(markerIdx + AD_INSIGHT_ACTIONS_MARKER.length).trim()
  const jsonStart = tail.indexOf('[')
  if (jsonStart < 0) return { insight, actions }
  try {
    const arr = JSON.parse(tail.slice(jsonStart)) as unknown[]
    if (!Array.isArray(arr)) return { insight, actions }
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i]
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const opt = String(o.optStatus ?? o.actionType ?? '').toUpperCase()
      const actionType: 'enable' | 'disable' | 'note' =
        opt === 'ENABLE' || opt === 'enable' ? 'enable' : opt === 'DISABLE' || opt === 'disable' ? 'disable' : 'note'
      const promotionId = String(o.promotionId ?? o.promotion_id ?? '').trim() || undefined
      const promotionName = String(o.promotionName ?? o.promotion_name ?? '').trim() || undefined
      const reason = String(o.reason ?? o.note ?? 'AI 建议调整').trim()
      actions.push({
        actionId: `${promotionId ?? promotionName ?? 'act'}_${i}`,
        actionType,
        promotionId,
        promotionName,
        reason,
      })
    }
  } catch {
    /* ignore malformed actions */
  }
  return { insight, actions }
}

export type QianchuanCredentials = {
  accessToken: string
  localAccountId: string
  demoMode?: boolean
}

type OeEnvelope<T> = {
  code?: number
  message?: string
  data?: T
  request_id?: string
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function credsFromBody(j: Record<string, unknown>): QianchuanCredentials | null {
  const accessToken =
    (typeof j.access_token === 'string' ? j.access_token : '') ||
    (typeof j.accessToken === 'string' ? j.accessToken : '') ||
    process.env.OCEANENGINE_ACCESS_TOKEN?.trim() ||
    ''
  const localAccountId =
    (typeof j.advertiser_id === 'string' ? j.advertiser_id : '') ||
    (typeof j.advertiserId === 'string' ? j.advertiserId : '') ||
    (typeof j.local_account_id === 'string' ? j.local_account_id : '') ||
    (typeof j.localAccountId === 'string' ? j.localAccountId : '') ||
    process.env.OCEANENGINE_ADVERTISER_ID?.trim() ||
    process.env.OCEANENGINE_LOCAL_ACCOUNT_ID?.trim() ||
    ''
  if (!accessToken || !localAccountId) return null
  return { accessToken, localAccountId }
}

async function oceanGet<T>(
  creds: QianchuanCredentials,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const qs = new URLSearchParams(query).toString()
  const url = `${OE_BASE}${path}${qs ? `?${qs}` : ''}`
  const r = await fetch(url, {
    headers: { 'Access-Token': creds.accessToken, Accept: 'application/json' },
  })
  const text = await r.text()
  let parsed: OeEnvelope<T> = {}
  try {
    parsed = JSON.parse(text) as OeEnvelope<T>
  } catch {
    return { ok: false, message: mapOceanError(text, r.status) }
  }
  if (!r.ok) {
    return { ok: false, message: mapOceanError(parsed.message ?? text, r.status) }
  }
  if (parsed.code !== 0 && parsed.code !== undefined) {
    return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status) }
  }
  return { ok: true, data: (parsed.data ?? {}) as T }
}

async function oceanPost<T>(
  creds: QianchuanCredentials,
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const url = `${OE_BASE}${path}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Access-Token': creds.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let parsed: OeEnvelope<T> = {}
  try {
    parsed = JSON.parse(text) as OeEnvelope<T>
  } catch {
    return { ok: false, message: mapOceanError(text, r.status) }
  }
  if (!r.ok) {
    return { ok: false, message: mapOceanError(parsed.message ?? text, r.status) }
  }
  if (parsed.code !== 0 && parsed.code !== undefined) {
    return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status) }
  }
  return { ok: true, data: (parsed.data ?? {}) as T }
}

const PROMO_STATUS_ZH: Record<string, string> = {
  PROMOTION_STATUS_ENABLE: '投放中',
  PROMOTION_STATUS_DISABLE: '未投放',
  PROMOTION_STATUS_DONE: '已完成',
  PROMOTION_STATUS_FROZEN: '已终止',
  PROMOTION_STATUS_DELETED: '已删除',
}

const CLUE_STATE_ZH: Record<string, string> = {
  NEW: '新线索',
  CLUE_CONFIRM: '有意向',
  CLUE_HIGH_INTENTION: '高意向',
  ARRIVAL: '到店/上门',
  CONVERSION_CLASS: '已成交',
  INVALID_EVENT: '无效',
}

function demoProjects() {
  return {
    list: [
      {
        projectId: '900001',
        projectName: '五一到店引流-通投',
        status: 'PROJECT_STATUS_ENABLE',
        statusLabel: '投放中',
        budgetYuan: 300,
        marketingGoal: 'VIDEO_IMAGE',
        createTime: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        projectId: '900002',
        projectName: '直播专场-周末',
        status: 'PROJECT_STATUS_DISABLE',
        statusLabel: '已暂停',
        budgetYuan: 500,
        marketingGoal: 'LIVE',
        createTime: new Date(Date.now() - 86400000 * 12).toISOString(),
      },
    ],
    demoMode: true,
  }
}

function demoPromotions() {
  return {
    list: [
      {
        promotionId: '8001001',
        promotionName: '团购套餐-到店立减',
        projectId: '900001',
        projectName: '五一到店引流-通投',
        statusFirst: 'PROMOTION_STATUS_ENABLE',
        statusLabel: '投放中',
        budgetYuan: 200,
        bidYuan: 35,
        marketingGoal: 'VIDEO_IMAGE',
        learningPhase: 'LEARNING',
        createTime: new Date(Date.now() - 86400000 * 3).toISOString(),
        statCost: 1280.5,
        showCnt: 45200,
        clickCnt: 2100,
        convertCnt: 86,
        ctr: 4.65,
      },
      {
        promotionId: '8001002',
        promotionName: '门店导航-附近3km',
        projectId: '900001',
        projectName: '五一到店引流-通投',
        statusFirst: 'PROMOTION_STATUS_DISABLE',
        statusLabel: '未投放',
        budgetYuan: 150,
        bidYuan: 28,
        marketingGoal: 'VIDEO_IMAGE',
        learningPhase: 'LEARNED',
        createTime: new Date(Date.now() - 86400000 * 8).toISOString(),
        statCost: 560.2,
        showCnt: 18000,
        clickCnt: 720,
        convertCnt: 31,
        ctr: 4.0,
      },
    ],
    demoMode: true,
  }
}

function demoClues() {
  const now = Date.now()
  return {
    list: [
      {
        clueId: 'clue_demo_001',
        name: '张女士',
        phone: '138****6621',
        city: '杭州',
        clueSource: '千川-表单',
        promotionName: '团购套餐-到店立减',
        convertState: 'NEW',
        convertStateLabel: '新线索',
        createdAt: new Date(now - 3600000).toISOString(),
        callbackDone: false,
      },
      {
        clueId: 'clue_demo_002',
        name: '李先生',
        phone: '186****0093',
        city: '杭州',
        clueSource: '千川-私信',
        promotionName: '门店导航-附近3km',
        convertState: 'CLUE_CONFIRM',
        convertStateLabel: '有意向',
        createdAt: new Date(now - 86400000).toISOString(),
        callbackDone: true,
      },
    ],
    pageInfo: { page: 1, page_size: 20, total_number: 2 },
    demoMode: true,
  }
}

function mapPromotionStatus(s: string): string {
  return PROMO_STATUS_ZH[s] ?? s
}

function mapClueState(s: string): string {
  return CLUE_STATE_ZH[s] ?? s
}

function apiFailWithCreds(message: string) {
  return { ok: true as const, list: [] as unknown[], demoMode: false as const, apiError: message }
}

function dateRangeLast7(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86400000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`
  return { start: fmt(start), end: fmt(end) }
}

export async function handleQianchuanRoutes(
  method: string,
  pathname: string,
  url: URL,
  res: ServerResponse,
  bodyRaw: string,
  aiEnv: MerchantAiEnv,
): Promise<boolean> {
  if (!pathname.startsWith('/api/merchant/qianchuan/')) return false

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/bind/test') {
    const { runQianchuanBindTest } = await import('../api/qianchuanBindTestCore.js')
    const result = await runQianchuanBindTest(bodyRaw)
    json(res, result.statusCode, result.body)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/oauth/exchange') {
    const { runLocalPromotionOAuthExchange } = await import('../api/localPromotionOAuthExchangeCore.js')
    const result = await runLocalPromotionOAuthExchange(bodyRaw)
    json(res, result.statusCode, result.body)
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/qianchuan/projects') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    if (!creds) {
      json(res, 200, { ok: true, ...demoProjects() })
      return true
    }
    const pr = await oceanGet<{ list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v1.0/qianchuan/campaign/list/',
      {
        advertiser_id: creds.localAccountId,
        page: url.searchParams.get('page') ?? '1',
        page_size: url.searchParams.get('page_size') ?? '20',
      },
    )
    if (!pr.ok) {
      json(res, 200, { ...apiFailWithCreds(pr.message), message: pr.message })
      return true
    }
    const list = (pr.data.list ?? []).map((p) => ({
      projectId: String(p.campaign_id ?? p.id ?? ''),
      projectName: String(p.campaign_name ?? p.name ?? '—'),
      status: String(p.status ?? ''),
      statusLabel: mapPromotionStatus(String(p.status ?? '')),
      budgetYuan: Number(p.budget ?? 0) / 100 || undefined,
      marketingGoal: String(p.marketing_goal ?? p.marketing_scene ?? ''),
      createTime: String(p.create_time ?? ''),
    }))
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/qianchuan/promotions') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    if (!creds) {
      json(res, 200, { ok: true, ...demoPromotions() })
      return true
    }
    const pr = await oceanGet<{ list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v1.0/qianchuan/ad/get/',
      {
        advertiser_id: creds.localAccountId,
        page: url.searchParams.get('page') ?? '1',
        page_size: url.searchParams.get('page_size') ?? '20',
      },
    )
    if (!pr.ok) {
      json(res, 200, { ...apiFailWithCreds(pr.message), message: pr.message })
      return true
    }
    const range = dateRangeLast7()
    const adIds = (pr.data.list ?? [])
      .map((p) => String(p.ad_id ?? p.id ?? ''))
      .filter(Boolean)
    const reportMap = new Map<string, Record<string, unknown>>()
    if (adIds.length > 0) {
      const rep = await oceanGet<{ list?: Record<string, unknown>[] }>(
        creds,
        '/open_api/v1.0/qianchuan/report/ad/get/',
        {
          advertiser_id: creds.localAccountId,
          start_date: range.start.slice(0, 10),
          end_date: range.end.slice(0, 10),
          filtering: JSON.stringify({ ad_ids: adIds.slice(0, 50) }),
        },
      )
      if (rep.ok) {
        for (const row of rep.data.list ?? []) {
          const id = String(row.ad_id ?? '')
          if (id) reportMap.set(id, row)
        }
      }
    }
    const list = (pr.data.list ?? []).map((p) => {
      const id = String(p.ad_id ?? p.id ?? '')
      const metrics = reportMap.get(id)
      const statCost = metrics ? Number(metrics.stat_cost ?? 0) / 100 : undefined
      const showCnt = metrics ? Number(metrics.show_cnt ?? 0) : undefined
      const clickCnt = metrics ? Number(metrics.click_cnt ?? 0) : undefined
      const convertCnt = metrics ? Number(metrics.convert_cnt ?? 0) : undefined
      const ctr =
        showCnt && showCnt > 0 && clickCnt != null
          ? Math.round((clickCnt / showCnt) * 10000) / 100
          : undefined
      const goal = String(p.marketing_goal ?? '')
      const marketingGoal =
        goal === 'LIVE_PROM_GOODS' ? 'LIVE' : goal === 'VIDEO_PROM_GOODS' ? 'VIDEO_IMAGE' : goal
      return {
        promotionId: id,
        promotionName: String(p.ad_name ?? p.name ?? '—'),
        projectId: String(p.campaign_id ?? ''),
        statusFirst:
          String(p.status ?? '') === 'DELIVERY_OK'
            ? 'PROMOTION_STATUS_ENABLE'
            : 'PROMOTION_STATUS_DISABLE',
        statusLabel: mapPromotionStatus(
          String(p.status ?? '') === 'DELIVERY_OK'
            ? 'PROMOTION_STATUS_ENABLE'
            : 'PROMOTION_STATUS_DISABLE',
        ),
        budgetYuan: Number(p.budget ?? 0) / 100 || undefined,
        bidYuan: Number(p.cpa_bid ?? p.roi_goal ?? 0) / 100 || undefined,
        marketingGoal,
        learningPhase: String(p.learning_phase ?? ''),
        createTime: String(p.ad_create_time ?? p.create_time ?? ''),
        statCost,
        showCnt,
        clickCnt,
        convertCnt,
        ctr,
      }
    })
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/promotions/status') {
    const j = parseBody(bodyRaw)
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 400, { ok: false, message: '请先绑定千川' })
      return true
    }
    const ids = Array.isArray(j.promotion_ids) ? j.promotion_ids.map(String) : []
    const optStatus = String(j.opt_status ?? 'ENABLE')
    if (ids.length === 0) {
      json(res, 400, { ok: false, message: '缺少 promotion_ids' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v1.0/qianchuan/ad/status/update/', {
      advertiser_id: Number(creds.localAccountId),
      ad_ids: ids.map((id) => Number(id)),
      opt_status: optStatus === 'ENABLE' ? 'ENABLE' : 'DISABLE',
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/qianchuan/report/summary') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    const range = dateRangeLast7()
    if (!creds) {
      json(res, 200, {
        ok: true,
        summary: {
          statCost: 2140.7,
          showCnt: 73200,
          clickCnt: 3120,
          convertCnt: 128,
          ctr: 4.26,
          cpl: 16.73,
          dateRange: range,
        },
        demoMode: true,
      })
      return true
    }
    const pr = await oceanGet<{ list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v1.0/qianchuan/report/ad/get/',
      {
        advertiser_id: creds.localAccountId,
        start_date: range.start.slice(0, 10),
        end_date: range.end.slice(0, 10),
      },
    )
    if (!pr.ok) {
      json(res, 200, {
        ok: true,
        summary: { statCost: 0, showCnt: 0, clickCnt: 0, convertCnt: 0, ctr: 0, dateRange: range },
        message: pr.message,
        demoMode: false,
      })
      return true
    }
    const rows = pr.data.list ?? []
    let statCost = 0
    let showCnt = 0
    let clickCnt = 0
    let convertCnt = 0
    for (const row of rows) {
      statCost += Number(row.stat_cost ?? 0)
      showCnt += Number(row.show_cnt ?? 0)
      clickCnt += Number(row.click_cnt ?? 0)
      convertCnt += Number(row.convert_cnt ?? 0)
    }
    const ctr = showCnt > 0 ? (clickCnt / showCnt) * 100 : 0
    json(res, 200, {
      ok: true,
      summary: {
        statCost: statCost / 100,
        showCnt,
        clickCnt,
        convertCnt,
        ctr: Math.round(ctr * 100) / 100,
        cpl: convertCnt > 0 ? Math.round((statCost / 100 / convertCnt) * 100) / 100 : undefined,
        dateRange: range,
      },
      demoMode: false,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/clues/list') {
    const j = parseBody(bodyRaw)
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 200, { ok: true, ...demoClues() })
      return true
    }
    const range = dateRangeLast7()
    const accountId = Number(creds.localAccountId)
    const pr = await oceanPost<{ list?: Record<string, unknown>[]; page_info?: Record<string, unknown> }>(
      creds,
      '/open_api/2/tools/clue/life/get/',
      {
        local_account_ids: [accountId],
        start_time: typeof j.start_time === 'string' ? j.start_time : range.start,
        end_time: typeof j.end_time === 'string' ? j.end_time : range.end,
        page: Number(j.page) || 1,
        page_size: Number(j.page_size) || 20,
      },
    )
    if (!pr.ok) {
      json(res, 200, {
        ok: true,
        list: [],
        pageInfo: { page: 1, page_size: 20, total_number: 0 },
        demoMode: false,
        apiError: pr.message,
        message: `暂无法从巨量拉取真实线索（${pr.message}）；请确认已开通线索权限、广告主 ID 正确。`,
      })
      return true
    }
    const list = (pr.data.list ?? []).map((c) => {
      const state = String(c.clue_convert_state ?? c.convert_state ?? 'NEW')
      return {
        clueId: String(c.clue_id ?? ''),
        name: String(c.name ?? c.user_name ?? '—'),
        phone: String(c.telephone ?? c.phone ?? '—'),
        city: String(c.city_name ?? c.city ?? ''),
        clueSource: String(c.clue_source ?? ''),
        promotionName: String(c.promotion_name ?? ''),
        convertState: state,
        convertStateLabel: mapClueState(state),
        createdAt: String(c.create_time ?? c.clue_create_time ?? ''),
        callbackDone: state !== 'NEW',
      }
    })
    json(res, 200, {
      ok: true,
      list,
      pageInfo: pr.data.page_info,
      demoMode: false,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/clues/callback') {
    const j = parseBody(bodyRaw)
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 400, { ok: false, message: '请先绑定千川' })
      return true
    }
    const clueId = String(j.clue_id ?? j.clueId ?? '')
    const state = String(j.clue_convert_state ?? j.convertState ?? '')
    if (!clueId || !state) {
      json(res, 400, { ok: false, message: '缺少 clue_id 或 clue_convert_state' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/2/tools/clue/life/callback/', {
      local_account_ids: [Number(creds.localAccountId)],
      clue_id: clueId,
      clue_convert_state: state,
      event_data:
        state === 'INVALID_EVENT' && j.reason_code
          ? { reason_code: j.reason_code, reason_message: j.reason_message ?? '' }
          : undefined,
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/clues/ai-suggest') {
    const j = parseBody(bodyRaw)
    const name = String(j.name ?? '顾客')
    const phone = String(j.phone ?? '')
    const promotionName = String(j.promotionName ?? '千川广告')
    const convertState = String(j.convertStateLabel ?? j.convertState ?? '新线索')
    const storeName = String(j.storeName ?? '本店')
    const aiRes = await generateReviewReplyByDoubao(aiEnv, {
      platformLabel: '巨量千川线索',
      userName: name,
      reviewText: `线索状态：${convertState}。来源广告：${promotionName}。联系电话：${phone}。请生成一段简短、礼貌的跟进话术（微信/电话均可），邀请到店或加微，80字以内，不要编造具体优惠金额。门店：${storeName}。`,
      ratingStars: 5,
      sentiment: 'good',
    })
    if (aiRes.ok === false) {
      json(res, 502, { ok: false, message: aiRes.message })
      return true
    }
    json(res, 200, { ok: true, suggestion: aiRes.text })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/qianchuan/ai/ad-insight') {
    const j = parseBody(bodyRaw)
    const promotions = Array.isArray(j.promotions) ? j.promotions : []
    const clues = Array.isArray(j.clues) ? j.clues : []
    const channelStats = Array.isArray(j.channelStats) ? j.channelStats : []
    const summary = j.summary as Record<string, unknown> | undefined
    const pane = String(j.pane ?? 'ai')
    const mode = String(j.mode ?? 'assisted')
    const paneLabels: Record<string, string> = {
      live: '直播间投流',
      video: '短视频投流',
      leads: '线索分析',
      ai: 'AI 整体分析',
    }
    const paneLabel = paneLabels[pane] ?? '投流'
    const clueCount = clues.length
    const statCost = summary?.statCost ?? '—'
    const convertCnt = summary?.convertCnt ?? '—'
    const leadCpl =
      clueCount > 0 && typeof statCost === 'number'
        ? Math.round((statCost / clueCount) * 100) / 100
        : '—'
    const actionHint =
      mode === 'auto_adjust'
        ? `\n\n请在全文最后单独一行输出标记 ---ACTIONS---，其后紧跟 JSON 数组（不要有其它文字），每项格式：{"promotionId":"计划ID","promotionName":"计划名","optStatus":"ENABLE或DISABLE","reason":"一句话原因"}。仅建议暂停/启用且你有把握的计划，最多5条。`
        : ''
    const prompt = `你是本地生活商家投流顾问。当前板块：${paneLabel}。介入模式：${mode}。
根据以下巨量千川近7日数据给出分析（中文，分点清晰，每点不超过2行）：
- 投流消耗：${statCost}元；平台转化：${convertCnt}；线索量：${clueCount}；线索成本约：${leadCpl}元
- 概览 CTR ${summary?.ctr ?? '—'}%，点击 ${summary?.clickCnt ?? '—'}
- 分渠道：${JSON.stringify(channelStats).slice(0, 1000)}
- 广告计划：${JSON.stringify(promotions).slice(0, 1200)}
- 线索样本：${JSON.stringify(clues).slice(0, 600)}
请针对【${paneLabel}】给出：①现状诊断 ②优化建议 ③本周优先动作（2-3条）。${actionHint}`
    const aiRes = await generateReviewReplyByDoubao(aiEnv, {
      platformLabel: '巨量千川',
      userName: '商家',
      reviewText: prompt,
      ratingStars: 3,
      sentiment: 'neutral',
    })
    if (aiRes.ok === false) {
      json(res, 502, { ok: false, message: aiRes.message })
      return true
    }
    const { insight, actions } = parseAdInsightResponse(aiRes.text)
    json(res, 200, { ok: true, insight, actions })
    return true
  }

  return false
}

function credsFromQuery(url: URL): QianchuanCredentials | null {
  const accessToken = url.searchParams.get('access_token')?.trim() ?? ''
  const localAccountId = url.searchParams.get('advertiser_id')?.trim() ??
    url.searchParams.get('local_account_id')?.trim() ?? ''
  if (!accessToken || !localAccountId) return null
  return { accessToken, localAccountId }
}

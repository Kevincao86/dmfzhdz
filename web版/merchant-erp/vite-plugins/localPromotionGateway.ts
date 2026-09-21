/**
 * 巨量引擎本地推 Open API 网关
 * 文档：https://open.oceanengine.com/labels/34
 * 基址：https://api.oceanengine.com
 */
import type { ServerResponse } from 'node:http'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { generateAdvertisingAiTextBilled, type AdAiBillingOpts } from './merchantAdAiPoints.js'
import {
  AD_INSIGHT_ACTIONS_MARKER,
  emptyAdvertisingClues,
  emptyAdvertisingList,
  emptyAdvertisingSummary,
  parseAdInsightResponse,
} from './advertisingGatewayCommon.js'
import { fetchAuthorizedAdvertisers, listEbpLocalAdvertisers } from './localPromotionOAuthCore.js'

const OE_BASE = (process.env.OCEANENGINE_API_BASE ?? 'https://api.oceanengine.com').replace(/\/$/, '')

function mapOceanError(raw: string, status?: number, code?: number): string {
  const s = raw.trim()
  const lower = s.toLowerCase()
  const codeHint = code != null ? `（巨量错误码 ${code}）` : ''
  if (status === 404 || /not_found|page could not be found/.test(lower)) {
    return `巨量开放平台接口不可用，请检查授权或稍后重试${codeHint}`
  }
  if (status && status >= 500) return `巨量开放平台暂时繁忙，请稍后再试${codeHint}`
  if (/access_token无效|access token invalid|invalid access_token/i.test(s)) {
    return `access_token 无效或已过期，请到系统设置重新授权本地推${codeHint}`
  }
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return `连接巨量本地推失败，请确认 Access Token 与广告主 ID 正确，并在开放平台开通投放/报表权限${codeHint}`
  }
  return `${s}${codeHint}`
}

/** 广告主 ID 超过 15 位时 JSON.parse 会丢精度，先转成字符串 */
function parseOceanJson<T>(text: string): T {
  const quoted = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"')
  return JSON.parse(quoted) as T
}

function jsonBodyPreserveIntIds(body: unknown): string {
  return JSON.stringify(body).replace(/"(\d{16,})"/g, '$1')
}

const LOCAL_REPORT_METRICS_LIST = [
  'stat_cost',
  'show_cnt',
  'click_cnt',
  'convert_cnt',
  'ctr',
  'conversion_cost',
  'cpc_platform',
  'form_cnt',
]


export type LocalPromotionCredentials = {
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

function credsFromBody(j: Record<string, unknown>): LocalPromotionCredentials | null {
  const accessToken =
    (typeof j.access_token === 'string' ? j.access_token : '') ||
    (typeof j.accessToken === 'string' ? j.accessToken : '') ||
    process.env.OCEANENGINE_ACCESS_TOKEN?.trim() ||
    ''
  const localAccountIdRaw = j.local_account_id ?? j.localAccountId
  const localAccountId =
    (typeof localAccountIdRaw === 'string' ? localAccountIdRaw.trim() : '') ||
    (typeof localAccountIdRaw === 'number' && Number.isFinite(localAccountIdRaw)
      ? String(localAccountIdRaw)
      : '') ||
    process.env.OCEANENGINE_LOCAL_ACCOUNT_ID?.trim() ||
    ''
  if (!accessToken || !localAccountId) return null
  return { accessToken, localAccountId }
}

async function oceanGet<T>(
  creds: LocalPromotionCredentials,
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
    parsed = parseOceanJson<OeEnvelope<T>>(text)
  } catch {
    return { ok: false, message: mapOceanError(text, r.status) }
  }
  if (!r.ok) {
    return { ok: false, message: mapOceanError(parsed.message ?? text, r.status, parsed.code) }
  }
  if (parsed.code !== 0 && parsed.code !== undefined) {
    return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status, parsed.code) }
  }
  return { ok: true, data: (parsed.data ?? {}) as T }
}

async function oceanPost<T>(
  creds: LocalPromotionCredentials,
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
    body: jsonBodyPreserveIntIds(body),
  })
  const text = await r.text()
  let parsed: OeEnvelope<T> = {}
  try {
    parsed = parseOceanJson<OeEnvelope<T>>(text)
  } catch {
    return { ok: false, message: mapOceanError(text, r.status) }
  }
  if (!r.ok) {
    return { ok: false, message: mapOceanError(parsed.message ?? text, r.status, parsed.code) }
  }
  if (parsed.code !== 0 && parsed.code !== undefined) {
    return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status, parsed.code) }
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

function pickBudgetYuan(row: Record<string, unknown>): number | undefined {
  const ds =
    row.delivery_setting && typeof row.delivery_setting === 'object' && !Array.isArray(row.delivery_setting)
      ? (row.delivery_setting as Record<string, unknown>)
      : {}
  const raw = Number(
    row.project_budget ?? ds.project_budget ?? row.budget ?? ds.budget ?? row.project_bid ?? row.bid ?? 0,
  )
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  if (!Number.isInteger(raw) || raw < 1000) return Math.round(raw * 100) / 100
  return Math.round(raw) / 100
}

type LocalReportMetrics = {
  promotionId: string
  projectId: string
  statCost: number
  showCnt: number
  clickCnt: number
  convertCnt: number
  ctr: number
}

function parseLocalReportRow(row: Record<string, unknown>): LocalReportMetrics {
  const dim =
    row.dimensions && typeof row.dimensions === 'object' && !Array.isArray(row.dimensions)
      ? (row.dimensions as Record<string, unknown>)
      : {}
  const nested = row.metrics
  const src =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : row
  const num = (k: string) => {
    const v = src[k] ?? row[k]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0
    return Number.isFinite(n) ? n : 0
  }
  const showCnt = num('show_cnt')
  const clickCnt = num('click_cnt')
  const ctrRaw = num('ctr')
  const ctr =
    ctrRaw > 0
      ? ctrRaw <= 1
        ? Math.round(ctrRaw * 10000) / 100
        : Math.round(ctrRaw * 100) / 100
      : showCnt > 0
        ? Math.round((clickCnt / showCnt) * 10000) / 100
        : 0
  return {
    promotionId: String(
      row.promotion_id ?? row.cdp_promotion_id ?? dim.promotion_id ?? dim.cdp_promotion_id ?? '',
    ),
    projectId: String(row.project_id ?? row.cdp_project_id ?? dim.project_id ?? dim.cdp_project_id ?? ''),
    statCost: num('stat_cost'),
    showCnt,
    clickCnt,
    convertCnt: num('convert_cnt') || num('form_cnt'),
    ctr,
  }
}

async function fetchOeReportRows(
  creds: LocalPromotionCredentials,
  path: string,
  extraQuery: Record<string, string> = {},
): Promise<Record<string, unknown>[]> {
  const range = dateRangeLast7()
  const startDate = range.start.slice(0, 10)
  const endDate = range.end.slice(0, 10)
  const extraBody: Record<string, unknown> = {}
  if (extraQuery.filtering) {
    try {
      extraBody.filtering = JSON.parse(extraQuery.filtering) as unknown
    } catch {
      /* ignore */
    }
  }
  const metricSets: string[][] = [
    LOCAL_REPORT_METRICS_LIST,
    ['stat_cost', 'show_cnt', 'click_cnt', 'convert_cnt', 'ctr'],
    ['stat_cost', 'show_cnt', 'click_cnt', 'convert_cnt'],
  ]
  for (const metricsList of metricSets) {
    const getQuery = {
      local_account_id: creds.localAccountId,
      start_date: startDate,
      end_date: endDate,
      time_granularity: 'TIME_GRANULARITY_TOTAL',
      metrics: JSON.stringify(metricsList),
      page: '1',
      page_size: '100',
      ...extraQuery,
    }
    const pr = await oceanGet<Record<string, unknown>>(creds, path, getQuery)
    if (pr.ok) {
      const rows = asRecordList(pr.data, 'project_list', 'promotion_list', 'list', 'data_list')
      if (rows.length) return rows
    }
    const posted = await oceanPost<Record<string, unknown>>(creds, path, {
      local_account_id: creds.localAccountId,
      start_date: startDate,
      end_date: endDate,
      time_granularity: 'TIME_GRANULARITY_TOTAL',
      metrics: metricsList,
      page: 1,
      page_size: 100,
      ...extraBody,
    })
    if (posted.ok) {
      const rows = asRecordList(posted.data, 'project_list', 'promotion_list', 'list', 'data_list')
      if (rows.length) return rows
    }
  }
  return []
}

async function loadLocalReportMaps(creds: LocalPromotionCredentials): Promise<{
  byPromotion: Map<string, LocalReportMetrics>
  byProject: Map<string, LocalReportMetrics>
  totals: { statCost: number; showCnt: number; clickCnt: number; convertCnt: number; ctr: number }
}> {
  const byPromotion = new Map<string, LocalReportMetrics>()
  const byProject = new Map<string, LocalReportMetrics>()
  const ingest = (rows: Record<string, unknown>[], preferReplace = true) => {
    for (const row of rows) {
      const m = parseLocalReportRow(row)
      if (m.promotionId) byPromotion.set(m.promotionId, m)
      if (m.projectId) {
        const prev = byProject.get(m.projectId)
        if (!prev || preferReplace) byProject.set(m.projectId, m)
      }
    }
  }

  ingest(await fetchOeReportRows(creds, '/open_api/v3.0/local/report/promotion/get/'), false)
  ingest(await fetchOeReportRows(creds, '/open_api/v3.0/local/report/project/get/'))
  ingest(
    await fetchOeReportRows(creds, '/open_api/v3.0/local/report/project/get/', {
      filtering: JSON.stringify({ marketing_goal: 'VIDEO_IMAGE' }),
    }),
  )
  ingest(
    await fetchOeReportRows(creds, '/open_api/v3.0/local/report/project/get/', {
      filtering: JSON.stringify({ marketing_goal: 'LIVE' }),
    }),
  )
  const accountRows = await fetchOeReportRows(creds, '/open_api/v3.0/local/report/account/get/')
  ingest(accountRows)

  let statCost = 0
  let showCnt = 0
  let clickCnt = 0
  let convertCnt = 0
  for (const row of accountRows) {
    const m = parseLocalReportRow(row)
    if (m.statCost || m.showCnt) {
      statCost += m.statCost
      showCnt += m.showCnt
      clickCnt += m.clickCnt
      convertCnt += m.convertCnt
    }
  }
  if (!statCost && !showCnt) {
    const acc = byProject.size ? byProject : byPromotion
    for (const m of acc.values()) {
      statCost += m.statCost
      showCnt += m.showCnt
      clickCnt += m.clickCnt
      convertCnt += m.convertCnt
    }
  }
  const ctr = showCnt > 0 ? Math.round((clickCnt / showCnt) * 10000) / 100 : 0
  return { byPromotion, byProject, totals: { statCost, showCnt, clickCnt, convertCnt, ctr } }
}

function metricsForRow(
  maps: { byPromotion: Map<string, LocalReportMetrics>; byProject: Map<string, LocalReportMetrics> },
  promotionId: string,
  projectId: string,
): LocalReportMetrics | undefined {
  return (
    maps.byPromotion.get(promotionId) ||
    maps.byProject.get(promotionId) ||
    (projectId ? maps.byProject.get(projectId) : undefined)
  )
}

export async function handleLocalPromotionRoutes(
  method: string,
  pathname: string,
  url: URL,
  res: ServerResponse,
  bodyRaw: string,
  aiEnv: MerchantAiEnv,
  billing?: AdAiBillingOpts,
): Promise<boolean> {
  if (!pathname.startsWith('/api/merchant/local-promotion/')) return false

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/bind/test') {
    const { runLocalPromotionBindTest } = await import('../api/localPromotionBindTestCore.js')
    const result = await runLocalPromotionBindTest(bodyRaw)
    json(res, result.statusCode, result.body)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/oauth/exchange') {
    const { runLocalPromotionOAuthExchange } = await import('../api/localPromotionOAuthExchangeCore.js')
    const result = await runLocalPromotionOAuthExchange(bodyRaw)
    json(res, result.statusCode, result.body)
    return true
  }

  if (
    (method === 'GET' || method === 'POST') &&
    pathname === '/api/merchant/local-promotion/projects'
  ) {
    const rawCreds = credsForList(method, url, bodyRaw)
    if (!rawCreds) {
      json(res, 200, emptyAdvertisingList('请先绑定本地推账号'))
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const pr = await listLocalByMarketingGoals(
      creds,
      '/open_api/v3.0/local/project/list/',
      ['project_list', 'list'],
      'project_status_first',
      'PROJECT_STATUS_ALL',
    )
    if (!pr.ok) {
      json(res, 200, { ...apiFailWithCreds(pr.message), message: pr.message })
      return true
    }
    const list = pr.rows.map((p) => ({
      projectId: String(p.project_id ?? p.id ?? ''),
      projectName: String(p.project_name ?? p.name ?? '—'),
      status: String(p.project_status ?? p.status ?? ''),
      statusLabel: mapPromotionStatus(String(p.project_status_first ?? p.status ?? '')),
      budgetYuan: pickBudgetYuan(p),
      marketingGoal: pickLocalMarketingGoal(p),
      createTime: String(p.create_time ?? ''),
    }))
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (
    (method === 'GET' || method === 'POST') &&
    pathname === '/api/merchant/local-promotion/promotions'
  ) {
    const rawCreds = credsForList(method, url, bodyRaw)
    if (!rawCreds) {
      json(res, 200, emptyAdvertisingList('请先绑定本地推账号'))
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const pr = await listLocalPromotionsMerged(creds)
    if (!pr.ok) {
      json(res, 200, { ...apiFailWithCreds(pr.message), message: pr.message })
      return true
    }
    const maps = await loadLocalReportMaps(creds)
    const projectIds = [
      ...new Set(pr.rows.map((p) => String(p.project_id ?? p.promotion_id ?? '')).filter(Boolean)),
    ].slice(0, 20)
    if (projectIds.length) {
      const extra = await fetchOeReportRows(creds, '/open_api/v3.0/local/report/project/get/', {
        filtering: jsonBodyPreserveIntIds({ cdp_project_ids: projectIds }),
      })
      for (const row of extra) {
        const m = parseLocalReportRow(row)
        if (m.projectId) maps.byProject.set(m.projectId, m)
        if (m.promotionId) maps.byPromotion.set(m.promotionId, m)
      }
    }
    const list = pr.rows.map((p) => {
      const id = String(p.promotion_id ?? '')
      const projectId = String(p.project_id ?? '')
      const metrics = metricsForRow(maps, id, projectId)
      const statCost = metrics?.statCost
      const showCnt = metrics?.showCnt
      const clickCnt = metrics?.clickCnt
      const convertCnt = metrics?.convertCnt
      const ctr = metrics?.ctr
      return {
        promotionId: id,
        promotionName: String(p.promotion_name ?? p.project_name ?? '—'),
        projectId,
        projectName: String(p.project_name ?? ''),
        statusFirst: String(p.promotion_status_first ?? ''),
        statusLabel: mapPromotionStatus(String(p.promotion_status_first ?? '')),
        budgetYuan: pickBudgetYuan(p),
        bidYuan: pickBudgetYuan({ budget: p.bid, project_bid: p.project_bid }),
        marketingGoal: pickLocalMarketingGoal(p),
        learningPhase: String(p.learning_phase ?? ''),
        createTime: String(p.promotion_create_time ?? p.create_time ?? ''),
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/promotions/status') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const ids = Array.isArray(j.promotion_ids) ? j.promotion_ids.map(String) : []
    const optStatus = String(j.opt_status ?? 'ENABLE')
    if (ids.length === 0) {
      json(res, 400, { ok: false, message: '缺少 promotion_ids' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v3.0/local/promotion/status/update/', {
      local_account_id: creds.localAccountId,
      promotion_ids: ids,
      opt_status: optStatus,
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (
    (method === 'GET' || method === 'POST') &&
    pathname === '/api/merchant/local-promotion/report/summary'
  ) {
    const rawCreds = credsForList(method, url, bodyRaw)
    const range = dateRangeLast7()
    if (!rawCreds) {
      json(res, 200, emptyAdvertisingSummary(range, '请先绑定本地推账号'))
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const maps = await loadLocalReportMaps(creds)
    const t = maps.totals
    json(res, 200, {
      ok: true,
      summary: {
        statCost: t.statCost,
        showCnt: t.showCnt,
        clickCnt: t.clickCnt,
        convertCnt: t.convertCnt,
        ctr: t.ctr,
        cpl: t.convertCnt > 0 ? Math.round((t.statCost / t.convertCnt) * 100) / 100 : undefined,
        dateRange: range,
      },
      demoMode: false,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/clues/list') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 200, emptyAdvertisingClues('请先绑定本地推账号'))
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const range = dateRangeLast7()
    const pr = await oceanPost<{ list?: Record<string, unknown>[]; page_info?: Record<string, unknown> }>(
      creds,
      '/open_api/2/tools/clue/life/get/',
      {
        local_account_ids: [creds.localAccountId],
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/clues/callback') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const clueId = String(j.clue_id ?? j.clueId ?? '')
    const state = String(j.clue_convert_state ?? j.convertState ?? '')
    if (!clueId || !state) {
      json(res, 400, { ok: false, message: '缺少 clue_id 或 clue_convert_state' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/2/tools/clue/life/callback/', {
      local_account_ids: [creds.localAccountId],
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/clues/ai-suggest') {
    const j = parseBody(bodyRaw)
    const name = String(j.name ?? '顾客')
    const phone = String(j.phone ?? '')
    const promotionName = String(j.promotionName ?? '本地推广告')
    const convertState = String(j.convertStateLabel ?? j.convertState ?? '新线索')
    const storeName = String(j.storeName ?? '本店')
    const adOut = await generateAdvertisingAiTextBilled(
      aiEnv,
      {
        system:
          '你是本地生活商家线索跟进顾问。请用中文输出简短礼貌的跟进话术，80字以内，不要编造具体优惠金额。',
        user: `线索状态：${convertState}。来源广告：${promotionName}。联系电话：${phone}。门店：${storeName}。顾客：${name}。`,
      },
      billing,
      '本地推线索话术 AI',
    )
    if (adOut.blocked) {
      json(res, adOut.status, adOut.body)
      return true
    }
    const aiRes = adOut.result
    if (aiRes.ok === false) {
      json(res, 502, { ok: false, message: aiRes.message })
      return true
    }
    json(res, 200, {
      ok: true,
      suggestion: aiRes.text,
      pointsCharged: aiRes.pointsCharged,
      pointsBalance: aiRes.pointsBalance,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/ai/ad-insight') {
    const j = parseBody(bodyRaw)
    const promotions = Array.isArray(j.promotions) ? j.promotions : []
    const clues = Array.isArray(j.clues) ? j.clues : []
    const channelStats = Array.isArray(j.channelStats) ? j.channelStats : []
    const summary = j.summary as Record<string, unknown> | undefined
    const pane = String(j.pane ?? 'ai')
    const mode = String(j.mode ?? 'assisted')
    const { system, user } = buildLocalPromotionInsightPrompt({
      pane,
      mode,
      summary,
      promotions,
      clues,
      channelStats,
    })
    const adOut = await generateAdvertisingAiTextBilled(
      aiEnv,
      { system, user },
      billing,
      '本地推广告洞察 AI',
    )
    if (adOut.blocked) {
      json(res, adOut.status, adOut.body)
      return true
    }
    const aiRes = adOut.result
    if (aiRes.ok === false) {
      json(res, 502, { ok: false, message: aiRes.message })
      return true
    }
    const { insight, actions } = parseAdInsightResponse(aiRes.text)
    json(res, 200, {
      ok: true,
      insight,
      actions,
      pointsCharged: aiRes.pointsCharged,
      pointsBalance: aiRes.pointsBalance,
    })
    return true
  }

  return false
}

function credsFromQuery(url: URL): LocalPromotionCredentials | null {
  const accessToken = url.searchParams.get('access_token')?.trim() ?? ''
  const localAccountId = url.searchParams.get('local_account_id')?.trim() ?? ''
  if (!accessToken || !localAccountId) return null
  return { accessToken, localAccountId }
}

function credsForList(method: string, url: URL, bodyRaw: string): LocalPromotionCredentials | null {
  if (method === 'POST') return credsFromBody(parseBody(bodyRaw)) ?? credsFromQuery(url)
  return credsFromQuery(url) ?? credsFromBody({})
}

async function resolveLocalPromotionCreds(
  creds: LocalPromotionCredentials,
): Promise<LocalPromotionCredentials> {
  const orig = await oceanGet(
    creds,
    '/open_api/v3.0/local/project/list/',
    { local_account_id: creds.localAccountId, page: '1', page_size: '1' },
  )
  if (orig.ok) return creds

  const seen = new Set<string>()
  const candidates: string[] = []
  const pushIds = (ids: string[]) => {
    for (const id of ids) {
      if (!id || seen.has(id) || id === creds.localAccountId) continue
      seen.add(id)
      candidates.push(id)
    }
  }

  const ebp = await listEbpLocalAdvertisers(creds.accessToken, creds.localAccountId)
  if (ebp.ok) pushIds(ebp.advertisers.map((a) => a.id))

  if (!candidates.length) {
    const auth = await fetchAuthorizedAdvertisers(creds.accessToken)
    if (auth.ok) pushIds(auth.advertisers.map((a) => a.id))
  }

  if (candidates.length === 1) {
    return { ...creds, localAccountId: candidates[0] }
  }
  for (const id of candidates) {
    const probe = await oceanGet(
      { ...creds, localAccountId: id },
      '/open_api/v3.0/local/project/list/',
      { local_account_id: id, page: '1', page_size: '1' },
    )
    if (probe.ok) return { ...creds, localAccountId: id }
  }
  if (candidates.length) return { ...creds, localAccountId: candidates[0] }
  return creds
}

function pickLocalMarketingGoal(row: Record<string, unknown>): string {
  const raw = String(
    row.marketing_goal ?? row.marketingGoal ?? row.marketing_scene ?? '',
  ).trim()
  const upper = raw.toUpperCase()
  if (upper === 'LIVE_PROM_GOODS' || upper === 'LIVE_PROMOTION' || upper === 'LIVE_ROOM') return 'LIVE'
  if (upper === 'VIDEO_PROM_GOODS' || upper === 'SHORT_VIDEO') return 'VIDEO_IMAGE'
  if (raw) return raw
  const blob = `${row.promotion_name ?? ''} ${row.project_name ?? ''} ${row.name ?? ''}`
  if (/短视频|图文/.test(blob)) return 'VIDEO_IMAGE'
  if (/直播/.test(blob)) return 'LIVE'
  return ''
}

async function listAllLocalRows(
  creds: LocalPromotionCredentials,
  path: string,
  listKeys: string[],
  extraQuery: Record<string, string> = {},
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string }> {
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= 10; page++) {
    const pr = await oceanGet<Record<string, unknown>>(creds, path, {
      local_account_id: creds.localAccountId,
      page: String(page),
      page_size: '100',
      ...extraQuery,
    })
    if (!pr.ok) {
      if (page === 1 && rows.length === 0) return { ok: false, message: pr.message }
      break
    }
    const batch = asRecordList(pr.data, ...listKeys)
    if (!batch.length) break
    for (const row of batch) {
      const id = String(row.promotion_id ?? row.project_id ?? row.id ?? '')
      const key = id || JSON.stringify(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
    if (batch.length < 100) break
  }
  return { ok: true, rows }
}

/** 无筛选时巨量偶发只返回直播；再按 VIDEO_IMAGE / LIVE 各拉一遍并分页合并 */
async function listLocalByMarketingGoals(
  creds: LocalPromotionCredentials,
  path: string,
  listKeys: string[],
  statusKey: 'promotion_status_first' | 'project_status_first',
  statusAll: string,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string }> {
  const variants: Array<{ goal: string; extra: Record<string, string> }> = [
    { goal: '', extra: { filtering: JSON.stringify({ [statusKey]: statusAll }) } },
    {
      goal: 'VIDEO_IMAGE',
      extra: {
        filtering: JSON.stringify({ marketing_goal: 'VIDEO_IMAGE', [statusKey]: statusAll }),
      },
    },
    {
      goal: 'LIVE',
      extra: { filtering: JSON.stringify({ marketing_goal: 'LIVE', [statusKey]: statusAll }) },
    },
  ]
  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []
  let lastErr = ''
  for (const v of variants) {
    const got = await listAllLocalRows(creds, path, listKeys, v.extra)
    if (!got.ok) {
      lastErr = got.message
      continue
    }
    for (const row of got.rows) {
      const id = String(row.promotion_id ?? row.project_id ?? row.id ?? '')
      const key = id || JSON.stringify(row)
      if (seen.has(key)) continue
      seen.add(key)
      const hasGoal = String(row.marketing_goal ?? row.marketingGoal ?? '').trim()
      merged.push(v.goal && !hasGoal ? { ...row, marketing_goal: v.goal } : row)
    }
  }
  if (merged.length) return { ok: true, rows: merged }
  if (lastErr) return { ok: false, message: lastErr }
  return { ok: true, rows: [] }
}

async function listPromotionsByProjectId(
  creds: LocalPromotionCredentials,
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const filters: Record<string, unknown>[] = [
    { project_id: projectId, promotion_status_first: 'PROMOTION_STATUS_ALL' },
    { project_id: projectId, marketing_goal: 'VIDEO_IMAGE', promotion_status_first: 'PROMOTION_STATUS_ALL' },
    { project_id: projectId, marketing_goal: 'LIVE', promotion_status_first: 'PROMOTION_STATUS_ALL' },
    { project_id: projectId },
  ]
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  const take = (batch: Record<string, unknown>[]) => {
    for (const row of batch) {
      const rowPid = String(row.project_id ?? '')
      if (rowPid && rowPid !== projectId) continue
      const id = String(row.promotion_id ?? row.id ?? '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push({ ...row, project_id: row.project_id ?? projectId })
    }
  }
  for (const filtering of filters) {
    const got = await listAllLocalRows(
      creds,
      '/open_api/v3.0/local/promotion/list/',
      ['promotion_list', 'list'],
      { filtering: jsonBodyPreserveIntIds(filtering) },
    )
    if (got.ok && got.rows.length) take(got.rows)
    if (rows.length) return rows
    const posted = await oceanPost<Record<string, unknown>>(creds, '/open_api/v3.0/local/promotion/list/', {
      local_account_id: creds.localAccountId,
      filtering,
      page: 1,
      page_size: 100,
    })
    if (posted.ok) take(asRecordList(posted.data, 'promotion_list', 'list'))
    if (rows.length) return rows
  }
  return rows
}

function projectStatusAsPromotion(status: string): string {
  if (/ENABLE/.test(status)) return 'PROMOTION_STATUS_ENABLE'
  if (/DISABLE/.test(status)) return 'PROMOTION_STATUS_DISABLE'
  if (/DONE|COMPLETE/.test(status)) return 'PROMOTION_STATUS_DONE'
  if (/DELETE/.test(status)) return 'PROMOTION_STATUS_DELETED'
  return status || 'PROMOTION_STATUS_DISABLE'
}

async function listLocalPromotionsMerged(
  creds: LocalPromotionCredentials,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string }> {
  const projects = await listLocalByMarketingGoals(
    creds,
    '/open_api/v3.0/local/project/list/',
    ['project_list', 'list'],
    'project_status_first',
    'PROJECT_STATUS_ALL',
  )
  const projectRows = projects.ok ? projects.rows : []
  const projectGoal = new Map<string, string>()
  const projectById = new Map<string, Record<string, unknown>>()
  for (const p of projectRows) {
    const id = String(p.project_id ?? p.id ?? '')
    if (!id) continue
    projectGoal.set(id, pickLocalMarketingGoal(p))
    projectById.set(id, p)
  }

  const fromGlobal = await listLocalByMarketingGoals(
    creds,
    '/open_api/v3.0/local/promotion/list/',
    ['promotion_list', 'list'],
    'promotion_status_first',
    'PROMOTION_STATUS_ALL',
  )
  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []
  const pushPromo = (row: Record<string, unknown>, fallbackGoal = '') => {
    const id = String(row.promotion_id ?? row.id ?? '')
    if (!id || seen.has(id)) return
    seen.add(id)
    const pid = String(row.project_id ?? '')
    const goal =
      pickLocalMarketingGoal(row) ||
      (pid ? projectGoal.get(pid) ?? '' : '') ||
      fallbackGoal
    merged.push({
      ...row,
      promotion_id: id,
      project_id: pid,
      marketing_goal: goal || row.marketing_goal,
    })
  }

  if (fromGlobal.ok) {
    for (const row of fromGlobal.rows) pushPromo(row)
  }

  const coveredProjects = new Set(
    merged.map((r) => String(r.project_id ?? '')).filter(Boolean),
  )
  const projectIds = [...projectById.keys()].slice(0, 40)
  for (const pid of projectIds) {
    if (coveredProjects.has(pid)) continue
    const child = await listPromotionsByProjectId(creds, pid)
    const fallback = projectGoal.get(pid) ?? ''
    for (const row of child) pushPromo(row, fallback)
    if (child.length) coveredProjects.add(pid)
  }

  for (const pid of projectIds) {
    if (merged.some((r) => String(r.project_id ?? '') === pid)) continue
    const p = projectById.get(pid)
    if (!p) continue
    const status = String(p.project_status_first ?? p.project_status ?? p.status ?? '')
    pushPromo(
      {
        promotion_id: pid,
        promotion_name: String(p.project_name ?? p.name ?? '自动投放项目'),
        project_id: pid,
        project_name: String(p.project_name ?? p.name ?? ''),
        promotion_status_first: projectStatusAsPromotion(status),
        marketing_goal: projectGoal.get(pid) ?? '',
        budget: p.budget ?? p.project_budget,
        project_budget: p.project_budget ?? p.budget,
        delivery_setting: p.delivery_setting,
        create_time: p.create_time,
      },
      projectGoal.get(pid) ?? '',
    )
  }

  for (const row of merged) {
    const p = projectById.get(String(row.project_id ?? ''))
    if (!p) continue
    if (row.project_budget == null) row.project_budget = p.project_budget ?? p.budget
    if (row.budget == null) row.budget = p.budget ?? p.project_budget
    if (row.delivery_setting == null) row.delivery_setting = p.delivery_setting
  }

  if (merged.length) return { ok: true, rows: merged }
  if (!fromGlobal.ok) return fromGlobal
  return { ok: true, rows: [] }
}

function asRecordList(data: Record<string, unknown> | undefined, ...keys: string[]): Record<string, unknown>[] {
  if (!data) return []
  for (const k of keys) {
    const v = data[k]
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  const nested = data.data
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = asRecordList(nested as Record<string, unknown>, ...keys)
    if (inner.length) return inner
  }
  if (data.metrics && typeof data.metrics === 'object') return [data]
  return []
}

function buildLocalPromotionInsightPrompt(input: {
  pane: string
  mode: string
  summary?: Record<string, unknown>
  promotions: unknown[]
  clues: unknown[]
  channelStats: unknown[]
}): { system: string; user: string } {
  const paneLabels: Record<string, string> = {
    live: '直播间投流',
    video: '短视频/图文投流',
    leads: '线索分析',
    ai: '整体投产',
  }
  const paneLabel = paneLabels[input.pane] ?? '投流'
  const plans = (input.promotions ?? []) as Array<Record<string, unknown>>
  const autoPlans = plans.filter(
    (p) =>
      String(p.promotionName ?? p.promotion_name ?? '').includes('自动投放') ||
      String(p.promotionId ?? '') === String(p.projectId ?? ''),
  )
  const spend = Number(input.summary?.statCost ?? 0)
  const show = Number(input.summary?.showCnt ?? 0)
  const convert = Number(input.summary?.convertCnt ?? 0)
  const clues = input.clues.length
  const liveDelivering = plans.filter((p) => String(p.statusFirst ?? '').includes('ENABLE')).length

  const system = `你是巨量本地推操盘手。必须基于给定数字说话，禁止编造消耗/展示/转化。
当前板块：${paneLabel}。模式：${input.mode}。
规则：
1. 名称含「自动投放」或计划ID=项目ID：这是自动投放项目，不要建议「启用/暂停广告ID」，改建议预算、高峰日预算、素材、门店/商品、学习期观察。
2. 消耗为0且状态投放中：优先排查审核、预算过低、学习期、定向过窄、短视频素材未过审，不要说「效果差」。
3. 短视频看完播/点击/转化；直播看进入直播间与停留。给可执行动作，每条不超过2行。
4. 不要输出 Markdown 标题堆砌。`

  const actionHint =
    input.mode === 'auto_adjust'
      ? `\n文末单独一行 ${AD_INSIGHT_ACTIONS_MARKER} 后接 JSON 数组。仅对真实广告（计划ID≠项目ID）给 ENABLE/DISABLE，最多3条。自动投放项目不要进数组。`
      : ''

  const user = `近7日账户：消耗 ${spend} 元，展示 ${show}，转化 ${convert}，线索 ${clues} 条，在投 ${liveDelivering} 条。
自动投放项目数：${autoPlans.length}。
分渠道：${JSON.stringify(input.channelStats).slice(0, 1400)}
计划明细（含预算/消耗/展示/转化/状态）：${JSON.stringify(plans).slice(0, 3500)}
线索：${JSON.stringify(input.clues).slice(0, 600)}

请输出：
① 现状（是否在花钱、有无展示）
② 本板块 3 条优先动作（预算/素材/定向/时段）
③ 若数据为 0：给出 24 小时观察清单，不要空喊加大预算。${actionHint}`

  return { system, user }
}

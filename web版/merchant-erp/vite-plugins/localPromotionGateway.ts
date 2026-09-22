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

/** 投流 AI 与对话/智能体共用运营台 vendorKeys，不能只读轻量 process.env */
async function resolveLocalAdAiEnv(aiEnv: MerchantAiEnv): Promise<MerchantAiEnv> {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('./merchantRegistryVendorEnv.js')
  return mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), aiEnv)
}

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
  if (code === 40000) {
    if (s && s !== 'parameter invalid' && s.toLowerCase() !== 'invalid param') {
      return `${s}${codeHint}`
    }
    return `巨量拒绝了创建参数（缺少门店/商品/抖音号或字段不合规）。请确认本地推已授权可投门店或抖音号${codeHint}`
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

function oceanNumeric(v: unknown): number | string {
  const s = String(v ?? '').trim()
  if (!/^\d+$/.test(s)) return s
  if (s.length >= 16) return s
  const n = Number(s)
  return Number.isFinite(n) ? n : s
}

function coerceOceanCreateBody(body: Record<string, unknown>): Record<string, unknown> {
  const numKeys = new Set([
    'local_account_id',
    'project_id',
    'product_id',
    'budget',
    'bid',
    'schedule_fixed_seconds',
    'high_budget_rate',
  ])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (v == null || v === '') continue
    if (k === 'promotion_poi_ids' && Array.isArray(v)) {
      out[k] = v.map((x) => oceanNumeric(x))
      continue
    }
    if (numKeys.has(k)) {
      out[k] = oceanNumeric(v)
      continue
    }
    out[k] = v
  }
  return out
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

function firstOceanListRow(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  for (const k of [
    'list',
    'aweme_id_list',
    'aweme_list',
    'poi_list',
    'product_list',
    'project_list',
    'data_list',
  ]) {
    const arr = o[k]
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
      return arr[0] as Record<string, unknown>
    }
  }
  return null
}

async function fetchLocalCreateAssets(
  creds: LocalPromotionCredentials,
  marketingGoal: 'LIVE' | 'VIDEO_IMAGE',
): Promise<{ awemeId: string; poiIds: string[]; productId: string }> {
  let awemeId = ''
  let productId = ''
  const poiIds: string[] = []
  const aweme = await oceanGetOrPost(creds, '/open_api/v3.0/local/aweme/authorized/get/', {
    local_account_id: creds.localAccountId,
    marketing_goal: marketingGoal,
    page: '1',
    page_size: '20',
  })
  if (aweme.ok) {
    const row = firstOceanListRow(aweme.data)
    awemeId = String(row?.aweme_id ?? row?.awemeId ?? row?.id ?? '').trim()
  }
  const poi = await oceanGetOrPost(creds, '/open_api/v3.0/local/poi/get/', {
    local_account_id: creds.localAccountId,
    page: '1',
    page_size: '20',
  })
  if (poi.ok) {
    const o = poi.data as Record<string, unknown>
    const arr = (o.poi_list ?? o.list ?? []) as unknown
    if (Array.isArray(arr)) {
      for (const item of arr.slice(0, 8)) {
        if (!item || typeof item !== 'object') continue
        const id = String((item as Record<string, unknown>).poi_id ?? (item as Record<string, unknown>).id ?? '').trim()
        if (id && !poiIds.includes(id)) poiIds.push(id)
      }
    }
  }
  const product = await oceanGetOrPost(creds, '/open_api/v3.0/local/product/get/', {
    local_account_id: creds.localAccountId,
    page: '1',
    page_size: '10',
  })
  if (product.ok) {
    const row = firstOceanListRow(product.data)
    productId = String(row?.product_id ?? row?.id ?? '').trim()
  }
  return { awemeId, poiIds, productId }
}

async function fetchLocalProjectDetail(
  creds: LocalPromotionCredentials,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const q = { local_account_id: creds.localAccountId, project_id: projectId }
  const got = await oceanGet<Record<string, unknown>>(creds, '/open_api/v3.0/local/project/detail/', q)
  if (got.ok && got.data && typeof got.data === 'object') return got.data
  const posted = await oceanPost<Record<string, unknown>>(creds, '/open_api/v3.0/local/project/detail/', q)
  if (posted.ok && posted.data && typeof posted.data === 'object') return posted.data
  return null
}

function projectCreateBodyFromDetail(
  detail: Record<string, unknown>,
  creds: LocalPromotionCredentials,
  name: string,
  budgetFen: number,
): Record<string, unknown> {
  const src = (
    detail.project && typeof detail.project === 'object'
      ? (detail.project as Record<string, unknown>)
      : detail
  )
  const keep = [
    'marketing_goal',
    'local_delivery_scene',
    'ad_type',
    'delivery_goal',
    'delivery_poi_mode',
    'promotion_poi_ids',
    'product_id',
    'aweme_id',
    'external_action',
    'bid_type',
    'bid',
    'budget_mode',
    'is_set_peak_budget',
  ]
  const out: Record<string, unknown> = {
    local_account_id: creds.localAccountId,
    name,
    budget: budgetFen,
  }
  for (const k of keep) {
    const v = src[k]
    if (v == null || v === '') continue
    if (k === 'promotion_poi_ids') {
      if (Array.isArray(v) && v.length) out[k] = v
      continue
    }
    if (typeof v === 'object') continue
    out[k] = v
  }
  const aud = src.audience
  if (aud && typeof aud === 'object' && !Array.isArray(aud)) {
    const district = String((aud as Record<string, unknown>).district ?? '').trim()
    if (district) out.audience = aud
  }
  return sanitizeLocalCreateBody(out)
}

function sanitizeLocalCreateBody(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body }
  const goal = String(out.marketing_goal ?? '').toUpperCase()
  const scene = String(out.local_delivery_scene ?? '').toUpperCase()
  if (goal !== 'LIVE') {
    delete out.schedule_type
    delete out.schedule_fixed_seconds
    delete out.start_time
    delete out.end_time
  }
  if (scene !== 'CONTENT_HEAT') delete out.external_action
  if (scene === 'CONTENT_HEAT') {
    delete out.delivery_goal
    delete out.delivery_poi_mode
    delete out.promotion_poi_ids
    delete out.product_id
    delete out.is_set_peak_budget
    delete out.peak_week_days
    delete out.peak_holidays
    delete out.high_budget_rate
  }
  if (String(out.is_set_peak_budget ?? '').toUpperCase() === 'FALSE') {
    delete out.peak_week_days
    delete out.peak_holidays
    delete out.high_budget_rate
  }
  if (goal === 'LIVE') delete out.is_set_peak_budget
  if (!out.ad_type) out.ad_type = 'GENERAL'
  if (!out.budget_mode) out.budget_mode = 'BUDGET_MODE_DAY'
  if (!out.bid_type) out.bid_type = 'SMART'
  if (!out.audience) out.audience = { district: 'ALL' }
  return out
}

async function oceanGetOrPost<T>(
  creds: LocalPromotionCredentials,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const got = await oceanGet<T>(creds, path, query)
  if (got.ok) return got
  return oceanPost<T>(creds, path, query)
}

function isWeakOceanCreateError(msg: string): boolean {
  return /接口不可用|page could not be found|not_found|404/i.test(msg)
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
    body: jsonBodyPreserveIntIds(
      body && typeof body === 'object' && !Array.isArray(body)
        ? coerceOceanCreateBody(body as Record<string, unknown>)
        : body,
    ),
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/promotions/create') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const name = String(j.name || j.project_name || j.promotion_name || '').trim()
    const budgetYuan = Number(j.budget_yuan ?? j.budgetYuan ?? 0)
    const goalRaw = String(j.marketing_goal || j.goal || 'VIDEO_IMAGE').toUpperCase()
    const marketingGoal =
      goalRaw === 'LIVE' || goalRaw === 'LIVE_PROM_GOODS'
        ? 'LIVE'
        : 'VIDEO_IMAGE'
    if (!name) {
      json(res, 400, { ok: false, message: '请填写计划名称' })
      return true
    }
    if (!Number.isFinite(budgetYuan) || budgetYuan < 100) {
      json(res, 400, { ok: false, message: '日预算至少 100 元' })
      return true
    }
    const budgetFen = Math.round(budgetYuan * 100)
    const attempts: Array<Record<string, unknown>> = []
    const listed = await listLocalByMarketingGoals(
      creds,
      '/open_api/v3.0/local/project/list/',
      ['project_list', 'list'],
      'project_status_first',
      'PROJECT_STATUS_ALL',
    )
    const templateRow = listed.ok
      ? listed.rows.find((row) => {
          const g = pickLocalMarketingGoal(row)
          return marketingGoal === 'LIVE' ? g === 'LIVE' : g === 'VIDEO_IMAGE' || !g
        })
      : undefined
    const templateId = String(templateRow?.project_id ?? templateRow?.id ?? '').trim()
    if (templateId) {
      const detail = await fetchLocalProjectDetail(creds, templateId)
      if (detail) attempts.push(projectCreateBodyFromDetail(detail, creds, name, budgetFen))
    }
    const assets = await fetchLocalCreateAssets(creds, marketingGoal)
    if (marketingGoal === 'LIVE') {
      if (assets.awemeId) {
        attempts.push(
          sanitizeLocalCreateBody({
            local_account_id: creds.localAccountId,
            name,
            marketing_goal: 'LIVE',
            local_delivery_scene: 'CONTENT_HEAT',
            ad_type: 'GENERAL',
            aweme_id: String(assets.awemeId),
            schedule_type: 'FROM_NOW_ON',
            budget_mode: 'BUDGET_MODE_DAY',
            budget: budgetFen,
            bid_type: 'SMART',
            external_action: 'LIVE_ENGAGE',
            audience: { district: 'ALL' },
          }),
        )
      }
    } else {
      attempts.push(
        sanitizeLocalCreateBody({
          local_account_id: creds.localAccountId,
          name,
          marketing_goal: 'VIDEO_IMAGE',
          local_delivery_scene: 'CONTENT_HEAT',
          ad_type: 'GENERAL',
          budget_mode: 'BUDGET_MODE_DAY',
          budget: budgetFen,
          bid_type: 'SMART',
          external_action: 'NATIVE_ACTION',
          audience: { district: 'ALL' },
        }),
      )
      if (assets.poiIds.length) {
        attempts.push(
          sanitizeLocalCreateBody({
            local_account_id: creds.localAccountId,
            name,
            marketing_goal: 'VIDEO_IMAGE',
            local_delivery_scene: 'POI_RECOMMEND',
            ad_type: 'GENERAL',
            delivery_goal: 'POI',
            delivery_poi_mode: 'PART',
            promotion_poi_ids: assets.poiIds.slice(0, 5),
            budget_mode: 'BUDGET_MODE_DAY',
            budget: budgetFen,
            bid_type: 'SMART',
            is_set_peak_budget: 'FALSE',
            audience: { district: 'POI', poi_around: { poi_around_radius: 'KM_10' } },
          }),
        )
      }
      attempts.push(
        sanitizeLocalCreateBody({
          local_account_id: creds.localAccountId,
          name,
          marketing_goal: 'VIDEO_IMAGE',
          local_delivery_scene: 'POI_RECOMMEND',
          ad_type: 'GENERAL',
          delivery_goal: 'POI',
          delivery_poi_mode: 'ALL',
          budget_mode: 'BUDGET_MODE_DAY',
          budget: budgetFen,
          bid_type: 'SMART',
          is_set_peak_budget: 'FALSE',
          audience: { district: 'ALL' },
        }),
      )
      if (assets.productId) {
        attempts.push(
          sanitizeLocalCreateBody({
            local_account_id: creds.localAccountId,
            name,
            marketing_goal: 'VIDEO_IMAGE',
            local_delivery_scene: 'PRODUCT_PAY',
            ad_type: 'GENERAL',
            delivery_goal: 'PRODUCT',
            product_id: assets.productId,
            budget_mode: 'BUDGET_MODE_DAY',
            budget: budgetFen,
            bid_type: 'SMART',
            is_set_peak_budget: 'FALSE',
            audience: { district: 'ALL' },
          }),
        )
      }
    }
    if (!attempts.length) {
      json(res, 400, {
        ok: false,
        message:
          marketingGoal === 'LIVE'
            ? '未获取到可投抖音号，无法创建直播计划。请在巨量本地推开通直播投放抖音号。'
            : '未能组装创建参数，请确认本地推已授权门店或商品。',
      })
      return true
    }
    const failMsgs: string[] = []
    let created: Record<string, unknown> | null = null
    let usedScene = ''
    for (const body of attempts) {
      const pr = await oceanPost(creds, '/open_api/v3.0/local/project/create/', body)
      if (pr.ok) {
        created = (pr.data || {}) as Record<string, unknown>
        usedScene = String(body.local_delivery_scene ?? '')
        break
      }
      if (pr.message && !failMsgs.includes(pr.message)) failMsgs.push(pr.message)
    }
    if (!created) {
      json(res, 502, {
        ok: false,
        message:
          failMsgs[0] ||
          '创建失败。请确认本地推已授权门店/抖音号，并在开放平台开通「本地推投放」项目创建权限。',
        attempts: failMsgs.slice(0, 4),
      })
      return true
    }
    const projectId = String(created.project_id ?? created.id ?? '')
    let promoNote = ''
    if (projectId && usedScene !== 'CONTENT_HEAT') {
      const promoBody: Record<string, unknown> = {
        local_account_id: creds.localAccountId,
        project_id: projectId,
        name: `${name}-广告`,
        enable_graphic_delivery: true,
      }
      if (assets.awemeId) promoBody.aweme_id = String(assets.awemeId)
      const promo = await oceanPost(creds, '/open_api/v3.0/local/promotion/create/', promoBody)
      promoNote = promo.ok ? '已同时创建团购卡广告。' : `项目已建好；广告单元需补素材（${promo.message}）。`
    } else if (usedScene === 'CONTENT_HEAT') {
      promoNote = '内容加热项目已创建；短视频素材可在巨量后台补齐后投放。'
    }
    json(res, 200, {
      ok: true,
      projectId,
      message: `已在巨量本地推创建项目。${promoNote}`.trim(),
    })
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/projects/status') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const ids = Array.isArray(j.project_ids) ? j.project_ids.map(String) : []
    const rawOpt = String(j.opt_status ?? 'ENABLE').toUpperCase()
    const optStatus = rawOpt === 'DISABLE' || rawOpt === 'PAUSE' || rawOpt === 'PAUSED' ? 'PAUSED' : 'ENABLE'
    if (ids.length === 0) {
      json(res, 400, { ok: false, message: '缺少 project_ids' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v3.0/local/project/status/update/', {
      local_account_id: creds.localAccountId,
      data: ids.map((project_id) => ({ project_id, opt_status: optStatus })),
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/projects/budget') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const projectId = String(j.project_id ?? '')
    const budgetYuan = Number(j.budget_yuan ?? j.budgetYuan ?? 0)
    if (!projectId || !Number.isFinite(budgetYuan) || budgetYuan <= 0) {
      json(res, 400, { ok: false, message: '缺少 project_id 或日预算' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v3.0/local/project/update/', {
      local_account_id: creds.localAccountId,
      project_id: projectId,
      budget: Math.round(budgetYuan * 100),
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true, budgetYuan })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/projects/optimize') {
    const j = parseBody(bodyRaw)
    const rawCreds = credsFromBody(j)
    if (!rawCreds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const creds = await resolveLocalPromotionCreds(rawCreds)
    const projectId = String(j.project_id ?? j.projectId ?? '')
    if (!projectId) {
      json(res, 400, { ok: false, message: '缺少 project_id' })
      return true
    }
    const body = buildLocalProjectOptimizeBody(creds, projectId, j)
    if (Object.keys(body).length <= 2) {
      json(res, 400, { ok: false, message: '缺少可写入巨量的出价/定向/预算字段' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v3.0/local/project/update/', body)
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true, projectId })
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
    const mergedEnv = await resolveLocalAdAiEnv(aiEnv)
    const adOut = await generateAdvertisingAiTextBilled(
      mergedEnv,
      {
        system:
          '你是本地生活商家线索跟进顾问。请用中文输出简短礼貌的跟进话术，80字以内，不要编造具体优惠金额。',
        user: `线索状态：${convertState}。来源广告：${promotionName}。联系电话：${phone}。门店：${storeName}。顾客：${name}。`,
      },
      { ...billing, env: mergedEnv as Record<string, string> },
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
    const mergedEnv = await resolveLocalAdAiEnv(aiEnv)
    const adOut = await generateAdvertisingAiTextBilled(
      mergedEnv,
      { system, user },
      { ...billing, env: mergedEnv as Record<string, string> },
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
    let finalInsight = insight
    let finalActions = actions
    if (mode === 'full_ai') {
      const rawCreds = credsFromBody(j)
      const applied = rawCreds
        ? await applyFullAiLocalWrites(rawCreds, promotions, aiRes.text)
        : { lines: ['未带本地推绑定，无法写入巨量。'] }
      if (applied.lines.length) {
        finalInsight = `${insight}\n\n④ 已对巨量执行\n${applied.lines.map((x) => `- ${x}`).join('\n')}`
      }
      finalActions = []
    }
    json(res, 200, {
      ok: true,
      insight: finalInsight,
      actions: finalActions,
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

function parseLocalActionRows(raw: string): Array<Record<string, unknown>> {
  const markerIdx = raw.indexOf(AD_INSIGHT_ACTIONS_MARKER)
  if (markerIdx < 0) return []
  const tail = raw.slice(markerIdx + AD_INSIGHT_ACTIONS_MARKER.length).trim()
  const jsonStart = tail.indexOf('[')
  if (jsonStart < 0) return []
  try {
    const arr = JSON.parse(tail.slice(jsonStart)) as unknown
    return Array.isArray(arr)
      ? arr.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>
      : []
  } catch {
    return []
  }
}

function isAutoDeliveryPlan(p: Record<string, unknown>): boolean {
  const promoId = String(p.promotionId ?? p.promotion_id ?? '')
  const projectId = String(p.projectId ?? p.project_id ?? '')
  const name = String(p.promotionName ?? p.promotion_name ?? p.projectName ?? '')
  return Boolean(projectId && promoId && promoId === projectId) || name.includes('自动投放')
}

function planMetrics(p: Record<string, unknown>) {
  return {
    statCost: Number(p.statCost ?? p.stat_cost ?? 0) || 0,
    showCnt: Number(p.showCnt ?? p.show_cnt ?? 0) || 0,
    clickCnt: Number(p.clickCnt ?? p.click_cnt ?? 0) || 0,
    convertCnt: Number(p.convertCnt ?? p.convert_cnt ?? 0) || 0,
    budgetYuan: Number(p.budgetYuan ?? p.budget_yuan ?? 0) || 0,
  }
}

function inLearningHold(p: Record<string, unknown>): boolean {
  const m = planMetrics(p)
  if (m.statCost > 0 && m.statCost < 50 && m.convertCnt === 0) return true
  if (m.showCnt > 0 && m.clickCnt === 0 && m.statCost < 30) return true
  return false
}

function clampBudgetYuan(current: number, suggested: number): number {
  const base = current > 0 ? current : 300
  const lo = Math.max(100, Math.round(base * 0.8))
  const hi = Math.min(5000, Math.round(base * 1.2))
  const n = Math.round(suggested)
  return Math.min(hi, Math.max(lo, n))
}

function clampBidFen(suggestedFen: number): number {
  const n = Math.round(suggestedFen)
  return Math.min(1000000, Math.max(1, n))
}

function buildAudiencePatch(row: Record<string, unknown>): Record<string, unknown> | null {
  const audienceIn = row.audience && typeof row.audience === 'object' ? (row.audience as Record<string, unknown>) : {}
  const district = String(row.district ?? audienceIn.district ?? '').toUpperCase()
  const gender = String(row.gender ?? audienceIn.gender ?? '').toUpperCase()
  const ageRaw = row.age ?? audienceIn.age
  const audience: Record<string, unknown> = {}
  if (district === 'POI' || district === 'POI_AROUND') {
    audience.district = 'POI'
    audience.poi_around = { poi_around_radius: String(row.poiAroundRadius ?? 'KM_10') }
  } else if (district === 'ALL' || district === 'REGION' || district === 'LOCAL') {
    audience.district = district === 'POI_AROUND' ? 'POI' : district
  }
  if (gender === 'FEMALE' || gender === 'MALE' || gender === 'NONE') audience.gender = gender
  if (Array.isArray(ageRaw) && ageRaw.length) audience.age = ageRaw.map(String)
  else if (typeof ageRaw === 'string' && ageRaw.trim()) audience.age = [ageRaw.trim()]
  return Object.keys(audience).length ? audience : null
}

function buildLocalProjectOptimizeBody(
  creds: LocalPromotionCredentials,
  projectId: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    local_account_id: creds.localAccountId,
    project_id: projectId,
  }
  const budgetYuan = Number(row.budgetYuan ?? row.budget_yuan ?? 0)
  if (Number.isFinite(budgetYuan) && budgetYuan >= 100) {
    body.budget = Math.round(budgetYuan * 100)
  }
  const bidYuan = Number(row.bidYuan ?? row.bid_yuan ?? 0)
  if (Number.isFinite(bidYuan) && bidYuan > 0) {
    body.bid = clampBidFen(bidYuan * 100)
  }
  const aud = buildAudiencePatch(row)
  if (aud) body.audience = aud
  return body
}

async function applyFullAiLocalWrites(
  rawCreds: LocalPromotionCredentials,
  promotions: unknown[],
  insightRaw: string,
): Promise<{ lines: string[] }> {
  const creds = await resolveLocalPromotionCreds(rawCreds)
  const plans = (promotions ?? []) as Array<Record<string, unknown>>
  const byPromo = new Map(plans.map((p) => [String(p.promotionId ?? p.promotion_id ?? ''), p]))
  const byProject = new Map(plans.map((p) => [String(p.projectId ?? p.project_id ?? ''), p]))
  const rows = parseLocalActionRows(insightRaw)
  const lines: string[] = []
  const seen = new Set<string>()

  const run = async (key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (seen.has(key)) return
    seen.add(key)
    const r = await fn()
    lines.push(r.ok ? label : `${label}失败：${r.message ?? '巨量拒绝'}`)
  }

  const writeOptimize = async (projectId: string, patch: Record<string, unknown>, label: string) => {
    const body = buildLocalProjectOptimizeBody(creds, projectId, patch)
    if (Object.keys(body).length <= 2) return
    await run(`opt:${projectId}:${label}`, label, async () => {
      const pr = await oceanPost(creds, '/open_api/v3.0/local/project/update/', body)
      return pr.ok ? { ok: true } : { ok: false, message: pr.message }
    })
  }

  for (const row of rows) {
    const promoId = String(row.promotionId ?? row.promotion_id ?? '').trim()
    const projectId = String(row.projectId ?? row.project_id ?? promoId).trim()
    const plan = byPromo.get(promoId) || byProject.get(projectId)
    const opt = String(row.optStatus ?? row.actionType ?? '').toUpperCase()
    const suggestedBudget = Number(row.budgetYuan ?? row.budget_yuan ?? 0)
    const suggestedBid = Number(row.bidYuan ?? row.bid_yuan ?? 0)
    const auto = plan ? isAutoDeliveryPlan(plan) : Boolean(projectId && promoId && projectId === promoId)

    if (
      projectId &&
      (opt === 'BID' ||
        opt === 'AUDIENCE' ||
        opt === 'REGION' ||
        opt === 'OPTIMIZE' ||
        suggestedBid > 0 ||
        row.district ||
        row.audience ||
        row.gender ||
        row.age)
    ) {
      if (plan && inLearningHold(plan) && suggestedBid > 0) {
        lines.push(`学习期未改出价（项目 ${projectId}）`)
      } else {
        const patch: Record<string, unknown> = { ...row }
        if (suggestedBudget > 0 && plan) {
          const current = planMetrics(plan).budgetYuan
          patch.budgetYuan = clampBudgetYuan(current, suggestedBudget)
        }
        await writeOptimize(
          projectId,
          patch,
          `写入巨量定向/出价（项目 ${projectId}）`,
        )
      }
      if (opt === 'ENABLE' || opt === 'DISABLE' || opt === 'PAUSED') {
        /* continue to status */
      } else {
        continue
      }
    }

    if ((opt === 'BUDGET' || suggestedBudget > 0) && projectId) {
      if (plan && inLearningHold(plan)) {
        lines.push(`学习期未改日预算（项目 ${projectId} 保持观察）`)
        continue
      }
      const current = plan ? planMetrics(plan).budgetYuan : 0
      const next = clampBudgetYuan(current, suggestedBudget || current)
      if (current > 0 && next === current) {
        lines.push(`日预算保持 ¥${current}（项目 ${projectId}）`)
        continue
      }
      await writeOptimize(projectId, { budgetYuan: next }, `日预算 ¥${current || '—'} → ¥${next}`)
      continue
    }

    if (auto && (opt === 'ENABLE' || opt === 'PAUSED' || opt === 'DISABLE' || opt === 'PAUSE')) {
      if (opt !== 'ENABLE' && plan && inLearningHold(plan)) {
        lines.push(`学习期未暂停自动投放项目 ${projectId}`)
        continue
      }
      const status = opt === 'ENABLE' ? 'ENABLE' : 'PAUSED'
      await run(`pstatus:${projectId}:${status}`, `项目${status === 'ENABLE' ? '启用' : '暂停'} ${projectId}`, async () => {
        const pr = await oceanPost(creds, '/open_api/v3.0/local/project/status/update/', {
          local_account_id: creds.localAccountId,
          data: [{ project_id: projectId, opt_status: status }],
        })
        return pr.ok ? { ok: true } : { ok: false, message: pr.message }
      })
      continue
    }

    if (!auto && promoId && (opt === 'ENABLE' || opt === 'DISABLE')) {
      await run(`promo:${promoId}:${opt}`, `广告${opt === 'ENABLE' ? '启用' : '暂停'} ${promoId}`, async () => {
        const pr = await oceanPost(creds, '/open_api/v3.0/local/promotion/status/update/', {
          local_account_id: creds.localAccountId,
          promotion_ids: [promoId],
          opt_status: opt,
        })
        return pr.ok ? { ok: true } : { ok: false, message: pr.message }
      })
    }
  }

  if (!rows.length) {
    const heuristic = await heuristicLowRoiWrites(creds, plans, run)
    lines.push(...heuristic)
  }

  if (!lines.length) {
    const autoPlans = plans.filter(isAutoDeliveryPlan)
    if (autoPlans.some(inLearningHold)) {
      lines.push('学习期未改巨量参数：保持投放，继续观察点击与转化')
    } else {
      lines.push('本轮无写入：模型未给出可执行的预算/出价/定向动作')
    }
  }
  return { lines }
}

async function heuristicLowRoiWrites(
  creds: LocalPromotionCredentials,
  plans: Array<Record<string, unknown>>,
  run: (key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) => Promise<void>,
): Promise<string[]> {
  const lines: string[] = []
  const ranked = [...plans]
    .map((p) => ({ p, m: planMetrics(p) }))
    .filter((x) => x.m.statCost >= 40)
    .sort((a, b) => {
      const roiA = a.m.statCost > 0 ? a.m.convertCnt / a.m.statCost : 0
      const roiB = b.m.statCost > 0 ? b.m.convertCnt / b.m.statCost : 0
      return roiA - roiB
    })
    .slice(0, 3)
  for (const { p, m } of ranked) {
    const projectId = String(p.projectId ?? p.project_id ?? '')
    if (!projectId) continue
    if (inLearningHold(p)) {
      lines.push(`学习期观察 ${projectId}，未改定向`)
      continue
    }
    const roi = m.statCost > 0 ? m.convertCnt / m.statCost : 0
    if (roi > 0.02 && m.convertCnt > 0) continue
    const nextBudget = clampBudgetYuan(m.budgetYuan || 300, (m.budgetYuan || 300) * 0.85)
    const body = buildLocalProjectOptimizeBody(creds, projectId, {
      budgetYuan: nextBudget,
      district: 'POI',
      poiAroundRadius: 'KM_10',
    })
    await run(`heur:${projectId}`, `低投产收紧定向到门店附近10km并下调日预算至 ¥${nextBudget}`, async () => {
      const pr = await oceanPost(creds, '/open_api/v3.0/local/project/update/', body)
      return pr.ok ? { ok: true } : { ok: false, message: pr.message }
    })
  }
  return lines
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
  const autoPlans = plans.filter(isAutoDeliveryPlan)
  const spend = plans.reduce((s, p) => s + (Number(p.statCost ?? 0) || 0), 0) || Number(input.summary?.statCost ?? 0)
  const show = plans.reduce((s, p) => s + (Number(p.showCnt ?? 0) || 0), 0) || Number(input.summary?.showCnt ?? 0)
  const convert = plans.reduce((s, p) => s + (Number(p.convertCnt ?? 0) || 0), 0) || Number(input.summary?.convertCnt ?? 0)
  const click = plans.reduce((s, p) => s + (Number(p.clickCnt ?? 0) || 0), 0)
  const clues = input.clues.length
  const delivering = plans.filter((p) => String(p.statusFirst ?? '').includes('ENABLE')).length
  const isolation =
    input.pane === 'video'
      ? '本板块只讨论短视频/图文。禁止出现直播、进直播间、直播消耗、直播计划。数字只来自下方短视频计划。'
      : input.pane === 'live'
        ? '本板块只讨论直播间投流。禁止出现短视频完播、图文、短视频计划。数字只来自下方直播计划。'
        : '整体分析必须分「短视频」「直播」两段写，禁止把两类消耗、展示、转化加总后当成单一渠道。'

  const system = `你是巨量本地推操盘手。必须基于给定数字说话，禁止编造消耗/展示/转化。
当前板块：${paneLabel}。模式：${input.mode}。
硬性隔离：${isolation}
规则：
1. 名称含「自动投放」或计划ID=项目ID：用项目预算/项目启停，不要对项目ID调用广告启停。
2. 消耗低、有展示无点击：视为学习期或素材/定向问题，不要大额加预算，不要轻易暂停。
3. 短视频看展示/点击/转化；直播看进入直播间与停留。动作每条不超过2行。
4. 不要输出 Markdown 标题堆砌。`

  const needActions = input.mode === 'full_ai' || input.mode === 'auto_adjust'
  const actionHint = needActions
    ? `\n文末单独一行 ${AD_INSIGHT_ACTIONS_MARKER} 后接 JSON 数组，最多3条，且必须属于本板块计划。
真实广告：{"promotionId":"...","optStatus":"ENABLE或DISABLE","reason":"..."}
自动投放/项目优化：{"projectId":"...","optStatus":"BUDGET或BID或AUDIENCE或PAUSED或ENABLE","budgetYuan":数字,"bidYuan":数字,"district":"POI或ALL","gender":"FEMALE或MALE或NONE","age":["AGE_BETWEEN_24_30"],"reason":"..."}
投产低（消耗高、转化少）优先 AUDIENCE：district=POI（门店附近10km）或收紧性别年龄，其次小幅下调日预算；智能出价不要乱改 bidYuan。
学习期不要给 PAUSED。预算调整幅度建议在现预算 ±20% 内。${input.mode === 'full_ai' ? '全面介入会立刻调用巨量 project/update 写入出价、人群、区域。' : '自动调计划需商家确认后再写。'}`
    : ''

  const user = `本板块近7日：消耗 ${spend} 元，展示 ${show}，点击 ${click}，转化 ${convert}，线索 ${clues} 条，在投 ${delivering} 条。
自动投放项目数：${autoPlans.length}。
本板块统计：${JSON.stringify(input.channelStats).slice(0, 1200)}
本板块计划明细：${JSON.stringify(plans).slice(0, 3500)}
本板块线索：${JSON.stringify(input.clues).slice(0, 500)}

请输出：
① 现状（是否在花钱、有无展示；仅本板块）
② 本板块 3 条优先动作
③ 若学习期：写清观察项，不要空喊加大预算。${actionHint}`

  return { system, user }
}

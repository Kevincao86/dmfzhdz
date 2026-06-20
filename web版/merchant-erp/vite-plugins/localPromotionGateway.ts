/**
 * 巨量引擎本地推 Open API 网关
 * 文档：https://open.oceanengine.com/labels/34
 * 基址：https://api.oceanengine.com
 */
import type { ServerResponse } from 'node:http'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { generateReviewReplyByDoubao } from './merchantAiUpstream.js'

const OE_BASE = (process.env.OCEANENGINE_API_BASE ?? 'https://api.oceanengine.com').replace(/\/$/, '')

function mapOceanError(raw: string, status?: number): string {
  const s = raw.trim()
  const lower = s.toLowerCase()
  if (status === 404 || /not_found|page could not be found/.test(lower)) {
    return '巨量开放平台接口不可用，请检查授权或稍后重试。'
  }
  if (status && status >= 500) return '巨量开放平台暂时繁忙，请稍后再试。'
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return '连接巨量本地推失败，请确认 Access Token 与广告主 ID 正确，并在开放平台开通线索/投放权限。'
  }
  return s
}

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
  const localAccountId =
    (typeof j.local_account_id === 'string' ? j.local_account_id : '') ||
    (typeof j.localAccountId === 'string' ? j.localAccountId : '') ||
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
        clueSource: '本地推-表单',
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
        clueSource: '本地推-私信',
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

function dateRangeLast7(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86400000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`
  return { start: fmt(start), end: fmt(end) }
}

export async function handleLocalPromotionRoutes(
  method: string,
  pathname: string,
  url: URL,
  res: ServerResponse,
  bodyRaw: string,
  aiEnv: MerchantAiEnv,
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

  if (method === 'GET' && pathname === '/api/merchant/local-promotion/projects') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    if (!creds) {
      json(res, 200, { ok: true, ...demoProjects() })
      return true
    }
    const pr = await oceanGet<{ project_list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v3.0/local/project/list/',
      {
        local_account_id: creds.localAccountId,
        page: url.searchParams.get('page') ?? '1',
        page_size: url.searchParams.get('page_size') ?? '20',
      },
    )
    if (!pr.ok) {
      json(res, 200, { ok: true, ...demoProjects(), message: pr.message })
      return true
    }
    const list = (pr.data.project_list ?? []).map((p) => ({
      projectId: String(p.project_id ?? p.id ?? ''),
      projectName: String(p.project_name ?? p.name ?? '—'),
      status: String(p.project_status ?? p.status ?? ''),
      statusLabel: mapPromotionStatus(String(p.project_status_first ?? p.status ?? '')),
      budgetYuan: Number(p.budget ?? 0) / 100 || undefined,
      marketingGoal: String(p.marketing_goal ?? ''),
      createTime: String(p.create_time ?? ''),
    }))
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/local-promotion/promotions') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    if (!creds) {
      json(res, 200, { ok: true, ...demoPromotions() })
      return true
    }
    const pr = await oceanGet<{ promotion_list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v3.0/local/promotion/list/',
      {
        local_account_id: creds.localAccountId,
        page: url.searchParams.get('page') ?? '1',
        page_size: url.searchParams.get('page_size') ?? '20',
      },
    )
    if (!pr.ok) {
      json(res, 200, { ok: true, ...demoPromotions(), message: pr.message })
      return true
    }
    const list = (pr.data.promotion_list ?? []).map((p) => ({
      promotionId: String(p.promotion_id ?? ''),
      promotionName: String(p.promotion_name ?? '—'),
      projectId: String(p.project_id ?? ''),
      statusFirst: String(p.promotion_status_first ?? ''),
      statusLabel: mapPromotionStatus(String(p.promotion_status_first ?? '')),
      budgetYuan: Number(p.budget ?? 0) / 100 || undefined,
      bidYuan: Number(p.bid ?? 0) / 100 || undefined,
      marketingGoal: String(p.marketing_goal ?? ''),
      learningPhase: String(p.learning_phase ?? ''),
      createTime: String(p.promotion_create_time ?? ''),
    }))
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/promotions/status') {
    const j = parseBody(bodyRaw)
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
      return true
    }
    const ids = Array.isArray(j.promotion_ids) ? j.promotion_ids.map(String) : []
    const optStatus = String(j.opt_status ?? 'ENABLE')
    if (ids.length === 0) {
      json(res, 400, { ok: false, message: '缺少 promotion_ids' })
      return true
    }
    const pr = await oceanPost(creds, '/open_api/v3.0/local/promotion/status/update/', {
      local_account_id: Number(creds.localAccountId),
      promotion_ids: ids.map((id) => Number(id)),
      opt_status: optStatus,
    })
    if (!pr.ok) {
      json(res, 502, { ok: false, message: pr.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/local-promotion/report/summary') {
    const creds = credsFromQuery(url) ?? credsFromBody({})
    const range = dateRangeLast7()
    if (!creds) {
      json(res, 200, {
        ok: true,
        summary: {
          statCost: 1840.7,
          showCnt: 63200,
          clickCnt: 2820,
          convertCnt: 117,
          ctr: 4.46,
          cpl: 15.73,
          dateRange: range,
        },
        demoMode: true,
      })
      return true
    }
    const pr = await oceanGet<{ list?: Record<string, unknown>[] }>(
      creds,
      '/open_api/v3.0/local/report/promotion/get/',
      {
        local_account_id: creds.localAccountId,
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/clues/list') {
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
        ...demoClues(),
        message: '暂无法从巨量拉取真实线索，已展示演示数据；请确认已开通线索权限或稍后重试。',
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
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 400, { ok: false, message: '请先绑定本地推' })
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/clues/ai-suggest') {
    const j = parseBody(bodyRaw)
    const name = String(j.name ?? '顾客')
    const phone = String(j.phone ?? '')
    const promotionName = String(j.promotionName ?? '本地推广告')
    const convertState = String(j.convertStateLabel ?? j.convertState ?? '新线索')
    const storeName = String(j.storeName ?? '本店')
    const aiRes = await generateReviewReplyByDoubao(aiEnv, {
      platformLabel: '巨量本地推线索',
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

  if (method === 'POST' && pathname === '/api/merchant/local-promotion/ai/ad-insight') {
    const j = parseBody(bodyRaw)
    const promotions = Array.isArray(j.promotions) ? j.promotions : []
    const summary = j.summary as Record<string, unknown> | undefined
    const prompt = `你是本地生活商家投流顾问。根据以下本地推数据给出3条可执行优化建议（每条一行，中文）：
概览：消耗${summary?.statCost ?? '—'}元，展示${summary?.showCnt ?? '—'}，点击${summary?.clickCnt ?? '—'}，转化${summary?.convertCnt ?? '—'}，CTR ${summary?.ctr ?? '—'}%
广告：${JSON.stringify(promotions).slice(0, 1500)}`
    const aiRes = await generateReviewReplyByDoubao(aiEnv, {
      platformLabel: '巨量本地推',
      userName: '商家',
      reviewText: prompt,
      ratingStars: 3,
      sentiment: 'neutral',
    })
    if (aiRes.ok === false) {
      json(res, 502, { ok: false, message: aiRes.message })
      return true
    }
    json(res, 200, { ok: true, insight: aiRes.text })
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

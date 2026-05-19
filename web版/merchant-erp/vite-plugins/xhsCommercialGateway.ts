/**
 * 小红书商业化：聚光（投流）+ 种小草（线索），共用同一套授权。
 * 文档：https://ad-market.xiaohongshu.com/docs-center?bizType=943&articleId=4437
 */
import type { ServerResponse } from 'node:http'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { generateReviewReplyByDoubao } from './merchantAiUpstream.js'

const XHS_AD_BASE = (process.env.XHS_COMMERCIAL_API_BASE_URL ?? '').replace(/\/$/, '')

export type XhsCommercialCredentials = {
  accessToken: string
  advertiserId: string
  appId?: string
  demoMode?: boolean
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

function credsFromBody(j: Record<string, unknown>): XhsCommercialCredentials | null {
  const accessToken =
    (typeof j.access_token === 'string' ? j.access_token : '') ||
    (typeof j.accessToken === 'string' ? j.accessToken : '') ||
    process.env.XHS_COMMERCIAL_ACCESS_TOKEN?.trim() ||
    ''
  const advertiserId =
    (typeof j.advertiser_id === 'string' ? j.advertiser_id : '') ||
    (typeof j.advertiserId === 'string' ? j.advertiserId : '') ||
    process.env.XHS_COMMERCIAL_ADVERTISER_ID?.trim() ||
    ''
  if (!accessToken || !advertiserId) return null
  return {
    accessToken,
    advertiserId,
    appId: typeof j.app_id === 'string' ? j.app_id : typeof j.appId === 'string' ? j.appId : '',
  }
}

function credsFromQuery(url: URL): XhsCommercialCredentials | null {
  return credsFromBody({
    access_token: url.searchParams.get('access_token') ?? '',
    advertiser_id: url.searchParams.get('advertiser_id') ?? '',
  })
}

function commercialConfigured(): boolean {
  return Boolean(XHS_AD_BASE)
}

async function xhsCommercialFetch(
  path: string,
  creds: XhsCommercialCredentials,
  opts: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown },
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  if (!commercialConfigured()) {
    return { ok: false, message: '未配置 XHS_COMMERCIAL_API_BASE_URL' }
  }
  const p = path.startsWith('/') ? path : `/${path}`
  const u = new URL(`${XHS_AD_BASE}${p}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    u.searchParams.set(k, v)
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${creds.accessToken}`,
    'Access-Token': creds.accessToken,
  }
  const init: RequestInit = { method: opts.method ?? 'GET', headers }
  if (opts.method === 'POST' && opts.body != null) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  const r = await fetch(u.toString(), init)
  const text = await r.text()
  let jsonBody: Record<string, unknown> = {}
  try {
    jsonBody = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    return { ok: false, message: '小红书商业化接口返回非 JSON' }
  }
  if (!r.ok) {
    const msg =
      (typeof jsonBody.message === 'string' && jsonBody.message) ||
      (typeof jsonBody.error_msg === 'string' && jsonBody.error_msg) ||
      `HTTP ${r.status}`
    return { ok: false, message: msg }
  }
  const code = jsonBody.code ?? jsonBody.error_code
  if (code != null && code !== 0 && code !== '0' && jsonBody.success !== true) {
    const msg =
      (typeof jsonBody.message === 'string' && jsonBody.message) ||
      (typeof jsonBody.error_msg === 'string' && jsonBody.error_msg) ||
      '请求被拒绝'
    return { ok: false, message: msg }
  }
  return { ok: true, json: jsonBody }
}

function pickList(j: Record<string, unknown>, keys: string[]): unknown[] {
  const data = j.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    for (const k of keys) {
      if (Array.isArray(d[k])) return d[k] as unknown[]
    }
  }
  for (const k of keys) {
    if (Array.isArray(j[k])) return j[k] as unknown[]
  }
  return []
}

function demoJuguangProjects() {
  return {
    list: [
      {
        projectId: 'jg_p_001',
        projectName: '聚光-笔记种草通投',
        status: 'ENABLE',
        statusLabel: '投放中',
        budgetYuan: 400,
        marketingGoal: 'NOTE',
        createTime: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
    ],
    demoMode: true,
  }
}

function demoJuguangPromotions() {
  return {
    list: [
      {
        promotionId: 'jg_ad_1001',
        promotionName: '门店笔记-周末到店',
        projectId: 'jg_p_001',
        projectName: '聚光-笔记种草通投',
        statusFirst: 'ENABLE',
        statusLabel: '投放中',
        budgetYuan: 260,
        bidYuan: 18,
        statCost: 890.3,
        showCnt: 32000,
        clickCnt: 1400,
        convertCnt: 52,
        ctr: 4.38,
      },
    ],
    demoMode: true,
  }
}

function demoJuguangReport() {
  return {
    summary: {
      statCost: 890.3,
      showCnt: 32000,
      clickCnt: 1400,
      convertCnt: 52,
      ctr: 4.38,
      cpl: 17.1,
      dateRange: {
        start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
      },
    },
    demoMode: true,
  }
}

function demoZhongxiaocaoClues() {
  const now = Date.now()
  return {
    list: [
      {
        clueId: 'zxc_001',
        name: '王小姐',
        phone: '139****7788',
        city: '上海',
        clueSource: '种小草-私信',
        promotionName: '门店笔记-周末到店',
        convertState: 'NEW',
        convertStateLabel: '新线索',
        createdAt: new Date(now - 7200000).toISOString(),
        callbackDone: false,
      },
      {
        clueId: 'zxc_002',
        name: '陈先生',
        phone: '177****2210',
        city: '上海',
        clueSource: '种小草-表单',
        promotionName: '聚光-笔记种草通投',
        convertState: 'CLUE_CONFIRM',
        convertStateLabel: '有意向',
        createdAt: new Date(now - 86400000 * 2).toISOString(),
        callbackDone: true,
      },
    ],
    pageInfo: { page: 1, page_size: 20, total_number: 2 },
    demoMode: true,
  }
}

export async function handleXhsCommercialRoutes(
  method: string,
  pathname: string,
  url: URL,
  res: ServerResponse,
  bodyRaw: string,
  aiEnv: MerchantAiEnv,
): Promise<boolean> {
  if (
    !pathname.startsWith('/api/merchant/xhs-commercial/') &&
    !pathname.startsWith('/api/merchant/xhs-juguang/') &&
    !pathname.startsWith('/api/merchant/xhs-zhongxiaocao/')
  ) {
    return false
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-commercial/bind/test') {
    const j = parseBody(bodyRaw)
    const creds = credsFromBody(j)
    if (!creds) {
      json(res, 400, { ok: false, message: '请填写 Access Token 与聚光/种小草广告主 ID' })
      return true
    }
    if (!commercialConfigured()) {
      json(res, 200, {
        ok: true,
        demoMode: true,
        message:
          '未配置 XHS_COMMERCIAL_API_BASE_URL，当前为演示模式；聚光与种小草共用本授权，配置基址后校验真实接口。',
      })
      return true
    }
    const testPath =
      process.env.XHS_COMMERCIAL_BIND_TEST_PATH?.trim() || '/api/open/jg/advertiser/info'
    const tr = await xhsCommercialFetch(testPath, creds, {
      query: { advertiser_id: creds.advertiserId },
    })
    if (!tr.ok) {
      json(res, 200, {
        ok: true,
        demoMode: true,
        message: `无法连接小红书商业化接口：${tr.message}；已切换演示模式。`,
      })
      return true
    }
    json(res, 200, { ok: true, demoMode: false, message: '聚光 / 种小草授权校验通过' })
    return true
  }

  const creds = credsFromQuery(url) ?? credsFromBody(parseBody(bodyRaw))
  const useDemo = !creds || !commercialConfigured()

  if (method === 'GET' && pathname === '/api/merchant/xhs-juguang/projects') {
    if (useDemo) {
      json(res, 200, { ok: true, ...demoJuguangProjects() })
      return true
    }
    const path = process.env.XHS_JUGUANG_PROJECT_LIST_PATH?.trim() || '/api/open/jg/campaign/list'
    const r = await xhsCommercialFetch(path, creds!, {
      query: { advertiser_id: creds!.advertiserId, page: '1', page_size: '20' },
    })
    if (!r.ok) {
      json(res, 200, { ok: true, ...demoJuguangProjects(), upstreamError: r.message })
      return true
    }
    const list = pickList(r.json, ['list', 'campaigns', 'projects', 'items'])
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/xhs-juguang/promotions') {
    if (useDemo) {
      json(res, 200, { ok: true, ...demoJuguangPromotions() })
      return true
    }
    const path = process.env.XHS_JUGUANG_PROMOTION_LIST_PATH?.trim() || '/api/open/jg/unit/list'
    const r = await xhsCommercialFetch(path, creds!, {
      query: { advertiser_id: creds!.advertiserId, page: '1', page_size: '20' },
    })
    if (!r.ok) {
      json(res, 200, { ok: true, ...demoJuguangPromotions(), upstreamError: r.message })
      return true
    }
    const list = pickList(r.json, ['list', 'units', 'promotions', 'items'])
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/xhs-juguang/report/summary') {
    if (useDemo) {
      json(res, 200, { ok: true, ...demoJuguangReport() })
      return true
    }
    const path = process.env.XHS_JUGUANG_REPORT_PATH?.trim() || '/api/open/jg/report/summary'
    const r = await xhsCommercialFetch(path, creds!, {
      query: { advertiser_id: creds!.advertiserId },
    })
    if (!r.ok) {
      json(res, 200, { ok: true, ...demoJuguangReport(), upstreamError: r.message })
      return true
    }
    json(res, 200, { ok: true, summary: r.json.data ?? r.json, demoMode: false })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-juguang/promotions/status') {
    const j = parseBody(bodyRaw)
    if (useDemo) {
      json(res, 200, { ok: true, demoMode: true })
      return true
    }
    const path = process.env.XHS_JUGUANG_STATUS_PATH?.trim() || '/api/open/jg/unit/status'
    const r = await xhsCommercialFetch(path, creds!, { method: 'POST', body: j })
    if (!r.ok) {
      json(res, 502, { ok: false, message: r.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-juguang/ai/ad-insight') {
    const j = parseBody(bodyRaw)
    const summary = j.summary as Record<string, unknown> | undefined
    const promotions = Array.isArray(j.promotions) ? j.promotions : []
    const prompt = `你是小红书聚光投流顾问。近7日数据：${JSON.stringify(summary)}；计划：${JSON.stringify(promotions).slice(0, 2000)}。请用中文给出3条可执行优化建议。`
    const insight = await generateReviewReplyByDoubao(aiEnv, prompt)
    json(res, 200, { ok: true, insight: insight || '暂无 AI 建议' })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-zhongxiaocao/clues/list') {
    if (useDemo) {
      json(res, 200, { ok: true, ...demoZhongxiaocaoClues() })
      return true
    }
    const path = process.env.XHS_ZHONGXIAOCAO_CLUE_LIST_PATH?.trim() || '/api/open/leads/list'
    const r = await xhsCommercialFetch(path, creds!, {
      method: 'POST',
      body: { advertiser_id: creds!.advertiserId, ...(parseBody(bodyRaw) as object) },
    })
    if (!r.ok) {
      json(res, 200, { ok: true, ...demoZhongxiaocaoClues(), upstreamError: r.message })
      return true
    }
    const list = pickList(r.json, ['list', 'clues', 'leads', 'items'])
    json(res, 200, { ok: true, list, demoMode: false })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-zhongxiaocao/clues/callback') {
    if (useDemo) {
      json(res, 200, { ok: true, demoMode: true })
      return true
    }
    const path = process.env.XHS_ZHONGXIAOCAO_CLUE_CALLBACK_PATH?.trim() || '/api/open/leads/callback'
    const r = await xhsCommercialFetch(path, creds!, { method: 'POST', body: parseBody(bodyRaw) })
    if (!r.ok) {
      json(res, 502, { ok: false, message: r.message })
      return true
    }
    json(res, 200, { ok: true })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/xhs-zhongxiaocao/clues/ai-suggest') {
    const j = parseBody(bodyRaw)
    const clue = j.clue as Record<string, unknown> | undefined
    const prompt = `你是种小草线索跟进顾问。线索：${JSON.stringify(clue)}。请生成一段简短、礼貌的跟进话术。`
    const suggestion = await generateReviewReplyByDoubao(aiEnv, prompt)
    json(res, 200, { ok: true, suggestion: suggestion || '您好，感谢关注，方便留个方便联系的时间吗？' })
    return true
  }

  return false
}

/**
 * 抖音生活服务 SPI 联调过审桩（预下单 / 发码 / 退款等）
 * 配置地址：https://mofangdianai.com/erp-api/meoo-douyin-spi
 *
 * 说明：业务侧可不启用真实履约；本桩用于开放平台必验用例。
 * GET  ?diag=1                 查看最近 logid / 当前模式
 * GET  ?set_precreate_fail=2   预下单固定失败码（1/2/3/4/5/6/7；0=成功）
 * GET  ?set_issue_mode=success|async|fail
 */
import fs from 'node:fs'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 10 }

type IssueMode = 'success' | 'async' | 'fail'
type SpiState = {
  precreateFailCode: number
  issueMode: IssueMode
  updatedAt: string
}

type SpiHit = {
  at: string
  action: string
  logid: string
  orderId?: string
  skuId?: string
  responseSummary: string
}

const MAX_HITS = 40
const g = globalThis as typeof globalThis & {
  __meooDouyinSpiHits?: SpiHit[]
}

function hits(): SpiHit[] {
  if (!g.__meooDouyinSpiHits) g.__meooDouyinSpiHits = []
  return g.__meooDouyinSpiHits
}

function pushHit(row: SpiHit): void {
  const arr = hits()
  arr.unshift(row)
  if (arr.length > MAX_HITS) arr.length = MAX_HITS
}

function statePath(): string {
  const fromEnv = String(process.env.DOUYIN_SPI_STATE_FILE || '').trim()
  if (fromEnv) return fromEnv
  const home = process.env.HOME || '/home/admin'
  return path.join(home, 'stack', 'douyin-spi-acceptance.json')
}

function defaultState(): SpiState {
  return {
    precreateFailCode: 0,
    issueMode: 'success',
    updatedAt: new Date().toISOString(),
  }
}

function readState(): SpiState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const o = JSON.parse(raw) as Partial<SpiState>
    const fail = Number(o.precreateFailCode)
    const mode = String(o.issueMode || 'success') as IssueMode
    return {
      precreateFailCode: Number.isFinite(fail) ? fail : 0,
      issueMode: mode === 'async' || mode === 'fail' || mode === 'success' ? mode : 'success',
      updatedAt: String(o.updatedAt || new Date().toISOString()),
    }
  } catch {
    return defaultState()
  }
}

function writeState(next: SpiState): void {
  const p = statePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
}

function headerOne(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v || '').trim()
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    const raw = req.body
    if (raw == null || raw === '') return {}
    if (typeof raw === 'string') return JSON.parse(raw || '{}') as Record<string, unknown>
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    if (typeof raw === 'object') return raw as Record<string, unknown>
  } catch {
    return {}
  }
  return {}
}

function queryOne(req: VercelRequest, key: string): string {
  const v = req.query?.[key]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v ?? '').trim()
}

/** 同一 URL 多场景：优先 query/header，再按 body 形状推断 */
function resolveAction(req: VercelRequest, body: Record<string, unknown>): string {
  const fromQ =
    queryOne(req, 'action') ||
    queryOne(req, 'Action') ||
    queryOne(req, 'method') ||
    queryOne(req, 'Method')
  if (fromQ) return fromQ
  const fromH =
    headerOne(req, 'x-life-action') ||
    headerOne(req, 'x-tt-action') ||
    headerOne(req, 'action')
  if (fromH) return fromH

  if (body.open_id != null || body.certificates != null || body.third_order_id != null) {
    if (body.refund_id != null || body.after_sale_id != null) return 'refund'
    return 'fulfilment.order.tripartite_code'
  }
  if (body.refund_id != null || body.after_sale_id != null || body.refund_amount != null) {
    return 'trade.refund.apply'
  }
  if (body.order_id != null && (body.sku_id != null || body.third_product_id != null)) {
    return 'trade.order.pre_create_order'
  }
  if (body.order_id != null && body.sku_id == null && body.third_product_id == null) {
    return 'trade.order.query'
  }
  return 'unknown'
}

function precreateFailDescription(code: number): string {
  const map: Record<number, string> = {
    1: '商品不存在',
    2: '商品已下线',
    3: '未到商品开始售卖时间',
    4: '已过商品结束售卖时间',
    5: '商品库存售罄',
    6: '已达到购买上限',
    7: '价格校验失败',
    20: '其他异常',
  }
  return map[code] || `预下单失败(${code})`
}

function handlePrecreate(state: SpiState, body: Record<string, unknown>): Record<string, unknown> {
  const fail = state.precreateFailCode
  if (fail > 0) {
    return {
      data: {
        error_code: fail,
        description: precreateFailDescription(fail),
      },
    }
  }
  const orderId = String(body.order_id ?? '').trim() || `unknown_${Date.now()}`
  return {
    data: {
      error_code: 0,
      description: 'success',
      ext_order_id: `meoo_${orderId}`,
    },
  }
}

function handleIssue(state: SpiState, body: Record<string, unknown>): Record<string, unknown> {
  if (state.issueMode === 'fail') {
    return {
      data: {
        error_code: 0,
        description: 'success',
        result: 2,
        fail_reason: 'ACCEPTANCE_FORCE_FAIL',
        fail_reason_desc: '联调过审：强制发券失败',
      },
    }
  }
  if (state.issueMode === 'async') {
    return {
      data: {
        error_code: 0,
        description: 'success',
        result: 0,
      },
    }
  }
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 20)
  const orderId = String(body.order_id ?? '').trim() || String(Date.now())
  const certificates = Array.from({ length: count }, (_, i) => {
    const id = `meoo_cert_${orderId}_${i + 1}`
    return { certificate_id: id, code: `MEOO${orderId.slice(-8)}${i + 1}`.replace(/\W/g, '').slice(0, 24) }
  })
  return {
    data: {
      error_code: 0,
      description: 'success',
      result: 1,
      certificates,
      codes: certificates.map((c) => c.code),
      third_order_id: String(body.third_order_id ?? `meoo_${orderId}`),
    },
  }
}

function handleRefund(_body: Record<string, unknown>): Record<string, unknown> {
  // 默认同意退款，覆盖多数「退款成功」用例；拒绝补码用例可用 set 扩展
  return {
    data: {
      error_code: 0,
      description: 'success',
      result: 1,
    },
  }
}

function handleRefundNotify(_body: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      error_code: 0,
      description: 'success',
    },
  }
}

function handleOrderQuery(body: Record<string, unknown>): Record<string, unknown> {
  const orderId = String(body.order_id ?? '').trim()
  return {
    data: {
      error_code: 0,
      description: 'success',
      order_id: orderId,
      status: 'DONE',
    },
  }
}

function handleGenericOk(): Record<string, unknown> {
  return { data: { error_code: 0, description: 'success' } }
}

function json(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    const setFail = queryOne(req, 'set_precreate_fail')
    const setIssue = queryOne(req, 'set_issue_mode')
    const state = readState()
    let changed = false
    if (setFail !== '') {
      const n = Number(setFail)
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        state.precreateFailCode = Math.floor(n)
        state.updatedAt = new Date().toISOString()
        changed = true
      }
    }
    if (setIssue === 'success' || setIssue === 'async' || setIssue === 'fail') {
      state.issueMode = setIssue
      state.updatedAt = new Date().toISOString()
      changed = true
    }
    if (changed) writeState(state)

    const recent = hits().slice(0, 15)
    json(res, 200, {
      ok: true,
      endpoint: '/api/meoo-douyin-spi',
      state: readState(),
      stateFile: statePath(),
      recentLogids: recent.map((h) => ({
        at: h.at,
        action: h.action,
        logid: h.logid,
        orderId: h.orderId,
        responseSummary: h.responseSummary,
      })),
      latestLogid: recent[0]?.logid || null,
      hint: {
        setOfflineFail: 'GET ?set_precreate_fail=2',
        setSuccess: 'GET ?set_precreate_fail=0',
        setIssueAsync: 'GET ?set_issue_mode=async',
        diag: 'GET ?diag=1',
      },
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { data: { error_code: 20, description: 'method_not_allowed' } })
    return
  }

  const logid =
    headerOne(req, 'x-bytedance-logid') ||
    headerOne(req, 'X-Bytedance-Logid') ||
    headerOne(req, 'x-tt-logid') ||
    ''
  const body = parseBody(req)
  const action = resolveAction(req, body)
  const state = readState()

  let out: Record<string, unknown>
  const a = action.toLowerCase()
  if (a.includes('pre_create') || a === 'trade.order.pre_create_order') {
    out = handlePrecreate(state, body)
  } else if (a.includes('tripartite') || a.includes('fulfilment.order')) {
    out = handleIssue(state, body)
  } else if (a.includes('refund') && (a.includes('sync') || a.includes('notify') || a.includes('info'))) {
    out = handleRefundNotify(body)
  } else if (a.includes('refund')) {
    out = handleRefund(body)
  } else if (a.includes('query') || a.includes('order.query')) {
    out = handleOrderQuery(body)
  } else if (a === 'unknown') {
    // 无 Action 时：有 open_id 当发码，否则当预下单（联调最常见两条）
    out =
      body.open_id != null ? handleIssue(state, body) : handlePrecreate(state, body)
  } else {
    out = handleGenericOk()
  }

  const data = (out.data && typeof out.data === 'object' ? out.data : {}) as Record<string, unknown>
  const summary = `error_code=${data.error_code ?? ''};result=${data.result ?? ''};ext=${data.ext_order_id ?? ''}`
  pushHit({
    at: new Date().toISOString(),
    action,
    logid: logid || '(missing)',
    orderId: String(body.order_id ?? '').trim() || undefined,
    skuId: String(body.sku_id ?? body.third_sku_id ?? '').trim() || undefined,
    responseSummary: summary,
  })

  console.info(
    `[douyin-spi] action=${action} logid=${logid || '-'} order=${String(body.order_id ?? '')} ${summary}`,
  )

  json(res, 200, out)
}

/**
 * 抖音生活服务 SPI 联调过审桩（预下单 / 发码 / 退款等）
 * 配置地址：https://mofangdianai.com/erp-api/meoo-douyin-spi
 *
 * 说明：业务侧可不启用真实履约；本桩用于开放平台必验用例。
 * GET  ?diag=1                 查看最近 logid / 当前模式
 * GET  ?panel=1                联调反馈面板（自动刷新 logid）
 * GET  ?set_scenario=order_fail_limit  一键切联调用例（见面板）
 * GET  ?set_precreate_fail=2   预下单固定失败码（1/2/3/4/5/6/7；0=成功）
 * GET  ?set_issue_mode=success|async|fail
 * GET  ?set_refund_mode=agree|reject
 * GET  ?panel=1&do_verify=1    用已绑定 ERP对接 凭证调验券 OpenAPI（不要走开放平台调试台）
 * GET  ?panel=1&do_cancel=1    撤销核销 OpenAPI
 * GET  ?panel=1&do_idempotent=1 同一 verify_token 再验一次（联调「幂等核销」要 result=0，不要 1208）
 */
import fs from 'node:fs'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { openDouyinSessionCredentials } from './douyin-bind.js'
import {
  douyinServerFetch,
  exchangeDouyinClientToken,
  parseDouyinOpenApiEnvelope,
} from './douyinOpenApiBase.js'

export const config = { maxDuration: 12 }

type IssueMode = 'success' | 'async' | 'fail'
type RefundMode = 'agree' | 'reject'
type SpiState = {
  precreateFailCode: number
  issueMode: IssueMode
  refundMode: RefundMode
  scenario: string
  updatedAt: string
}

type SpiScenario = {
  id: string
  group: 'order_fail' | 'fulfil'
  title: string
  precreateFailCode: number
  issueMode: IssueMode
  refundMode: RefundMode
  buy: string
  copy: string
  how: string
}

const SPI_SCENARIOS: SpiScenario[] = [
  {
    id: 'order_fail_no_sku',
    group: 'order_fail',
    title: '下单失败 · 商品ID不存在',
    precreateFailCode: 1,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '来客库存必须>0，能看到购买按钮。不要改商品ID。点购买后预下单回 error_code=1。',
  },
  {
    id: 'order_fail_offline',
    group: 'order_fail',
    title: '下单失败 · 商品已下线',
    precreateFailCode: 2,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '来客库存必须>0。点购买后预下单回 error_code=2。此桩可能让抖音把商品标成不可买，测完请换新测试商品。',
  },
  {
    id: 'order_fail_not_started',
    group: 'order_fail',
    title: '下单失败 · 未到售卖开始时间',
    precreateFailCode: 3,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '来客库存必须>0，不要改售卖开始时间。点购买后预下单回 error_code=3。',
  },
  {
    id: 'order_fail_ended',
    group: 'order_fail',
    title: '下单失败 · 已过售卖结束时间',
    precreateFailCode: 4,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '来客库存必须>0，不要改售卖结束时间。点购买后预下单回 error_code=4。',
  },
  {
    id: 'order_fail_sold_out',
    group: 'order_fail',
    title: '下单失败 · 商品库存售罄',
    precreateFailCode: 5,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '禁止把来客剩余库存改成 0（前端会没有购买按钮）。库存留着，点购买后预下单回 error_code=5。',
  },
  {
    id: 'order_fail_limit',
    group: 'order_fail',
    title: '下单失败 · 已达到购买上限',
    precreateFailCode: 6,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '禁止用来客每人限购。库存>0，点购买后预下单回 error_code=6。',
  },
  {
    id: 'order_fail_price',
    group: 'order_fail',
    title: '下单失败 · 商家价格校验失败',
    precreateFailCode: 7,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份（应失败）',
    copy: '预下单 logid',
    how: '来客库存必须>0，不要改售价。点购买后预下单回 error_code=7。',
  },
  {
    id: 'issue_sync_fail',
    group: 'fulfil',
    title: '购买 1 份 · 同步发券失败',
    precreateFailCode: 0,
    issueMode: 'fail',
    refundMode: 'agree',
    buy: '买 1 份并支付',
    copy: '发券 logid',
    how: '下单要成功。发券回 data.error_code≠0（联调查这个，不是 result）。抖音会重试几分钟后自动退款。等订单变成退款成功，再填发券 logid。不要填退款流水号。',
  },
  {
    id: 'buy1_issue_verify',
    group: 'fulfil',
    title: '购买 1 份 · 同步发券 · 核销 / 幂等',
    precreateFailCode: 0,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份并支付',
    copy: '发券 → 核销 extra.logid → 幂等 extra.logid',
    how: '先复制发券 logid。核销点「验券」，幂等点「幂等核销」（同一 token，result 必须是 0）。',
  },
  {
    id: 'buy1_cs_refund',
    group: 'fulfil',
    title: '购买 1 份 · 发券成功 · 客服强退 · 通知商家退款成功',
    precreateFailCode: 0,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份并支付',
    copy: '发券 logid；信息同步 logid（不要填退款审核）',
    how: '发券成功后不要点申请退款。只点联调「客服强退」。面板出现「信息同步」logid 再填第 5 步。',
  },
  {
    id: 'buy1_verify_cs_refund',
    group: 'fulfil',
    title: '购买 1 份 · 发券成功 · 核销 · 客服强退 · 通知商家退款成功',
    precreateFailCode: 0,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 1 份并支付',
    copy: '发券 / 核销 extra.logid / 信息同步 logid',
    how: '支付后点「验券」。不要点申请退款，只点联调「客服强退」。第 5 步填「信息同步」logid。',
  },
  {
    id: 'buy2_partial_refund',
    group: 'fulfil',
    title: '购买 2 份 · 同步发券 · 部分核销 · 同步退款成功',
    precreateFailCode: 0,
    issueMode: 'success',
    refundMode: 'agree',
    buy: '买 2 份并支付',
    copy: '发券 logid、核销 extra.logid、退款 logid',
    how: '支付后点「验第 1 张」只核一张，再发起退款。本桩同意退款。',
  },
  {
    id: 'buy2_timeout_refund_reject',
    group: 'fulfil',
    title: '购买 2 份 · 同步发券超时 · 同步退款拒绝补码',
    precreateFailCode: 0,
    issueMode: 'async',
    refundMode: 'reject',
    buy: '买 2 份并支付',
    copy: '发券 logid（超时那条）、退款 logid',
    how: '发券桩会超过 8s 不回成功。退款时本桩拒绝（不补码）。填发券超时 logid 和退款 logid。',
  },
]

function scenarioById(id: string): SpiScenario | undefined {
  return SPI_SCENARIOS.find((s) => s.id === id)
}

function applyScenario(state: SpiState, sc: SpiScenario): void {
  state.precreateFailCode = sc.precreateFailCode
  state.issueMode = sc.issueMode
  state.refundMode = sc.refundMode
  state.scenario = sc.id
  state.updatedAt = new Date().toISOString()
}

function currentScenario(state: SpiState): SpiScenario | undefined {
  const named = scenarioById(state.scenario)
  if (
    named &&
    named.precreateFailCode === state.precreateFailCode &&
    named.issueMode === state.issueMode &&
    named.refundMode === state.refundMode
  ) {
    return named
  }
  const matched = SPI_SCENARIOS.filter(
    (s) =>
      s.precreateFailCode === state.precreateFailCode &&
      s.issueMode === state.issueMode &&
      s.refundMode === state.refundMode,
  )
  if (matched.length === 1) return matched[0]
  if (named && matched.some((s) => s.id === named.id)) return named
  return matched[0]
}

type SpiHit = {
  at: string
  action: string
  logid: string
  orderId?: string
  skuId?: string
  responseSummary: string
  codes?: string[]
  verifyId?: string
  certificateId?: string
  verifyToken?: string
}

const MAX_HITS = 40
const SPI_DEFAULT_APP_ID = 'aw0jtjzp5ptjjpbq'
const SPI_DEFAULT_POI_ID = '7569859650230781962'

type OpenApiCreds = { clientKey: string; clientSecret: string; merchantId: string }

const g = globalThis as typeof globalThis & {
  __meooDouyinSpiHits?: SpiHit[]
  __meooDouyinSpiToken?: { token: string; expMs: number; clientKey: string }
  __meooDouyinSpiFlash?: string
}

function hitsPath(): string {
  return statePath().replace(/\.json$/i, '-hits.json')
}

function loadHitsFromDisk(): SpiHit[] {
  try {
    const raw = JSON.parse(fs.readFileSync(hitsPath(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((x) => x && typeof x === 'object')
      .map((x) => x as SpiHit)
      .slice(0, MAX_HITS)
  } catch {
    return []
  }
}

function saveHits(arr: SpiHit[]): void {
  try {
    const p = hitsPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(arr.slice(0, MAX_HITS), null, 2), 'utf8')
  } catch {
    /* 面板可降级为内存 */
  }
}

function hits(): SpiHit[] {
  if (!g.__meooDouyinSpiHits) g.__meooDouyinSpiHits = loadHitsFromDisk()
  return g.__meooDouyinSpiHits
}

function pushHit(row: SpiHit): void {
  const arr = hits()
  arr.unshift(row)
  if (arr.length > MAX_HITS) arr.length = MAX_HITS
  saveHits(arr)
}

function statePath(): string {
  const fromEnv = String(process.env.DOUYIN_SPI_STATE_FILE || '').trim()
  if (fromEnv) return fromEnv
  const home = process.env.HOME || '/home/admin'
  return path.join(home, 'stack', 'douyin-spi-acceptance.json')
}

let memState: SpiState | null = null

function defaultState(): SpiState {
  return {
    precreateFailCode: 0,
    issueMode: 'async',
    refundMode: 'agree',
    scenario: '',
    updatedAt: new Date().toISOString(),
  }
}

function readState(): SpiState {
  if (memState) return { ...memState }
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const o = JSON.parse(raw) as Partial<SpiState>
    const fail = Number(o.precreateFailCode)
    const mode = String(o.issueMode || 'async') as IssueMode
    const refund = String(o.refundMode || 'agree') as RefundMode
    const parsed: SpiState = {
      precreateFailCode: Number.isFinite(fail) ? fail : 0,
      issueMode: mode === 'async' || mode === 'fail' || mode === 'success' ? mode : 'async',
      refundMode: refund === 'reject' ? 'reject' : 'agree',
      scenario: String(o.scenario || ''),
      updatedAt: String(o.updatedAt || new Date().toISOString()),
    }
    memState = parsed
    return { ...parsed }
  } catch {
    return defaultState()
  }
}

function writeState(next: SpiState): void {
  memState = { ...next }
  try {
    const p = statePath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* 磁盘写失败时内存桩仍生效，避免切桩按钮看起来无效 */
  }
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
  if (Array.isArray(v)) {
    const s = String(v[0] || '').trim()
    if (s) return s
  } else if (v != null && String(v).trim()) {
    return String(v).trim()
  }
  try {
    const raw = String(req.url || '')
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
    return new URLSearchParams(q).get(key)?.trim() || ''
  } catch {
    return ''
  }
}

/** 同一 URL 多场景：notice_list=信息同步；优先 query/header，再按 body 形状推断 */
function resolveAction(req: VercelRequest, body: Record<string, unknown>): string {
  if (Array.isArray(body.notice_list)) return 'refund.notice'
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
    // 联调「同步发券失败」jsonpath 是 $.resp.data.error_code != 0。
    // 官方文档发码失败应是 error_code=0 且 result=2；非 0 时抖音不读 result，会重试随后自动退款。
    return {
      data: {
        error_code: 2,
        description: '发券失败',
        result: 2,
        fail_reason: 'ACCEPTANCE_FORCE_FAIL',
        fail_reason_desc: '联调过审：强制发券失败',
      },
    }
  }
  if (state.issueMode === 'async') {
    // 联调「同步发券超时」要的是 8s 内不要成功回 HTTP 200（见 handler 里 hang）。
    // 若仍落到这里（未 hang），保持官方发码中包络。
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
    return { certificate_id: id, code: issueCode(orderId, i + 1) }
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

function handleRefund(state: SpiState, _body: Record<string, unknown>): Record<string, unknown> {
  if (state.refundMode === 'reject') {
    return {
      data: {
        error_code: 0,
        description: '拒绝退款',
        result: 2,
      },
    }
  }
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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

/**
 * 到综 SPI 官方回包：字段必须全在 data 内，不要带 extra/BaseResp。
 * 同步发券超时 = 发码中：error_code=0（数字）+ result=0 + 不回券码；8s 内返回。
 * extra.error_code=0 时联调会把 HTTP 200 记成「网关错误码」（200 与限购撞号）。
 * 禁止把 error_code 写成字符串 "0"：会记成 20 / 210xxxx。
 * 文档：https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/tripartite.code/create
 */
function wrapSpiResponse(out: Record<string, unknown>, _logid: string): Record<string, unknown> {
  const raw =
    out.data && typeof out.data === 'object' ? (out.data as Record<string, unknown>) : out
  const data: Record<string, unknown> = {
    error_code: Number(raw.error_code) || 0,
    description: raw.description == null || raw.description === '' ? 'success' : raw.description,
  }
  if (raw.result != null) data.result = Number(raw.result)
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'error_code' || k === 'description' || k === 'result') continue
    data[k] = v
  }
  return { data }
}

function spiJson(res: VercelResponse, logid: string, out: Record<string, unknown>): void {
  const nodeRes = res as VercelResponse & { removeHeader?: (name: string) => void }
  nodeRes.removeHeader?.('Access-Control-Allow-Origin')
  nodeRes.removeHeader?.('Access-Control-Allow-Methods')
  nodeRes.removeHeader?.('Access-Control-Allow-Headers')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Bytedance-Logid', logid || '')
  res.setHeader('x-tt-logid', logid || '')
  res.setHeader('X-Tt-Error-Code', '0')
  res.status(200).send(JSON.stringify(wrapSpiResponse(out, logid)))
}

function issueCode(orderId: string, index1: number): string {
  const d = String(orderId).replace(/\D/g, '').padStart(11, '0')
  const core = d.slice(-11)
  const idx = String(Math.max(0, Math.min(9, index1 - 1)))
  const code = `${core}${idx}`.replace(/^0+/, '') || '1'
  return code.padStart(12, '1').slice(0, 15)
}

function codesFromIssueData(data: Record<string, unknown>, orderId?: string): string[] {
  const raw = data.codes
  if (Array.isArray(raw) && raw.length) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean)
  }
  const certs = data.certificates
  if (Array.isArray(certs)) {
    const fromCert = certs
      .map((c) =>
        c && typeof c === 'object' && 'code' in c ? String((c as { code?: unknown }).code || '').trim() : '',
      )
      .filter(Boolean)
    if (fromCert.length) return fromCert
  }
  if (Number(data.result) === 1 && orderId) return [issueCode(orderId, 1)]
  return []
}

function codesForHit(h: SpiHit): string[] {
  if (h.codes && h.codes.length) return h.codes
  const m = String(h.responseSummary || '').match(/codes=([^;]+)/)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseCodesQuery(raw: string): string[] {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function hitVerifyResult(h: SpiHit): number {
  const m = String(h.responseSummary || '').match(/(?:^|;)result=(-?\d+)(?:;|$)/)
  return m ? Number(m[1]) : -1
}

function isVerifyResultZero(h: SpiHit): boolean {
  return isVerifyAction(h.action) && hitVerifyResult(h) === 0
}

function isIssueAction(action: string): boolean {
  const a = String(action || '').toLowerCase()
  return a.includes('tripartite')
}

function isPrecreateAction(action: string): boolean {
  const a = String(action || '').toLowerCase()
  return a.includes('pre_create')
}

function isVerifyAction(action: string): boolean {
  const a = String(action || '').toLowerCase()
  return a.includes('certificate.verify')
}

function isRefundNotifyAction(action: string): boolean {
  const a = String(action || '').toLowerCase()
  return a.includes('notice') || ((a.includes('refund') || a.includes('after_sale')) && (a.includes('sync') || a.includes('notify') || a.includes('info')))
}

function isRefundAction(action: string): boolean {
  const a = String(action || '').toLowerCase()
  return a.includes('refund') && !isRefundNotifyAction(action)
}

function escHtml(s: string): string {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function numericCode(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : -1
}

function extraLogid(j: Record<string, unknown>): string {
  const extra = asRec(j.extra)
  const data = asRec(j.data)
  return String(extra?.logid || extra?.log_id || data?.logid || '').trim()
}

async function loadOpenApiCreds(): Promise<OpenApiCreds> {
  const envKey = String(process.env.DOUYIN_SPI_CLIENT_KEY || '').trim()
  const envSecret = String(process.env.DOUYIN_SPI_CLIENT_SECRET || '').trim()
  const envAccount = String(process.env.DOUYIN_SPI_ACCOUNT_ID || '').trim()
  if (envKey && envSecret) {
    return { clientKey: envKey, clientSecret: envSecret, merchantId: envAccount }
  }
  try {
    const p = path.join(process.env.HOME || '/home/admin', 'stack', 'douyin-spi-openapi.json')
    const o = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<OpenApiCreds>
    if (o.clientKey && o.clientSecret) {
      return {
        clientKey: String(o.clientKey),
        clientSecret: String(o.clientSecret),
        merchantId: String(o.merchantId || ''),
      }
    }
  } catch {
    /* 可选文件 */
  }
  const appId = envKey || SPI_DEFAULT_APP_ID
  const base = String(process.env.SUPABASE_URL || process.env.MEOO_SUPABASE_ADMIN_URL || '').replace(/\/+$/, '')
  const srk = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!base || !srk) {
    throw new Error('缺少抖音凭证：请在商家 ERP 绑定「ERP对接」，或配置 DOUYIN_SPI_CLIENT_KEY/SECRET')
  }
  const restRoot = /\/rest\/v1$/i.test(base) ? base : `${base}/rest/v1`
  const u =
    `${restRoot}/tenant_merchant_bindings?client_key=eq.${encodeURIComponent(appId)}` +
    '&select=sealed_credentials,merchant_account_id&order=updated_at.desc&limit=1'
  const r = await fetch(u, {
    headers: { apikey: srk, Authorization: `Bearer ${srk}`, Accept: 'application/json' },
  })
  const raw = await r.text()
  if (!r.ok) throw new Error(`读取绑定失败 HTTP ${r.status}`)
  const rows = JSON.parse(raw || '[]') as Array<{ sealed_credentials?: string; merchant_account_id?: string }>
  if (!rows[0]?.sealed_credentials) {
    throw new Error(`未找到 ERP对接（${appId}）的来客绑定`)
  }
  const opened = openDouyinSessionCredentials(String(rows[0]?.sealed_credentials || ''))
  if (!opened?.clientKey || !opened.clientSecret) {
    throw new Error('ERP对接绑定凭证无法解密。请到商家 ERP 重新绑定抖音来客。')
  }
  return {
    clientKey: opened.clientKey,
    clientSecret: opened.clientSecret,
    merchantId: opened.merchantId || String(rows[0]?.merchant_account_id || ''),
  }
}

async function ensureSpiClientToken(creds: OpenApiCreds, force = false): Promise<string> {
  const cached = g.__meooDouyinSpiToken
  if (!force && cached && cached.clientKey === creds.clientKey && Date.now() < cached.expMs - 120_000) {
    return cached.token
  }
  const { token, expiresIn } = await exchangeDouyinClientToken(
    creds.clientKey,
    creds.clientSecret,
    douyinServerFetch,
  )
  g.__meooDouyinSpiToken = {
    token,
    expMs: Date.now() + Math.max(300, expiresIn) * 1000,
    clientKey: creds.clientKey,
  }
  return token
}

async function postCertificate(
  apiPath: '/goodlife/v1/fulfilment/certificate/verify/' | '/goodlife/v1/fulfilment/certificate/cancel/',
  creds: OpenApiCreds,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tryOnce = async (token: string) => {
    const headers: Record<string, string> = {
      'access-token': token,
      'content-type': 'application/json',
    }
    if (creds.merchantId) headers['Rpc-Transit-Life-Account'] = creds.merchantId
    const officialUrl = `https://open.douyin.com${apiPath}`
    const r = await douyinServerFetch(officialUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const raw = await r.text()
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`OpenAPI HTTP ${r.status}：${raw.slice(0, 400)}`)
    }
    return parseDouyinOpenApiEnvelope(raw, apiPath)
  }
  let token = await ensureSpiClientToken(creds, false)
  let j = await tryOnce(token)
  const data = asRec(j.data) || {}
  const extra = asRec(j.extra) || {}
  const code = numericCode(data.error_code ?? extra.error_code)
  if (code === 2190002 || code === 2190008) {
    token = await ensureSpiClientToken(creds, true)
    j = await tryOnce(token)
  }
  return j
}

type OpenApiActionResult = { ok: boolean; notice: string; logid: string }

async function runPanelOpenApi(
  kind: 'verify' | 'cancel',
  opts?: { verifyToken?: string; orderId?: string; codes?: string; idempotent?: boolean },
): Promise<OpenApiActionResult> {
  const creds = await loadOpenApiCreds()
  const recent = hits()
  if (kind === 'verify') {
    const qOrder = String(opts?.orderId || '').trim()
    const qCodes = parseCodesQuery(String(opts?.codes || ''))
    const codeHit = qOrder
      ? recent.find((h) => h.orderId === qOrder && codesForHit(h).length > 0) ||
        recent.find((h) => codesForHit(h).length > 0)
      : recent.find((h) => codesForHit(h).length > 0)
    const codes = qCodes.length ? qCodes : codeHit ? codesForHit(codeHit) : []
    const orderId = qOrder || String(codeHit?.orderId || recent.find((h) => h.orderId)?.orderId || '').trim()
    const poiId = String(process.env.DOUYIN_SPI_POI_ID || '').trim() || SPI_DEFAULT_POI_ID
    if (!codes.length || !orderId) {
      return { ok: false, notice: '还没有三方券码。请先切「发券同步成功」并完成购买。', logid: '' }
    }
    const qToken = String(opts?.verifyToken || '').trim()
    const successHit = recent.find(
      (h) => isVerifyResultZero(h) && h.verifyToken && (!orderId || h.orderId === orderId),
    )
    const lastSuccessToken = String(successHit?.verifyToken || '').trim()
    if (opts?.idempotent && !qToken && !lastSuccessToken) {
      return {
        ok: false,
        notice:
          '没有可回放的核销 token。请先点「验券」拿到 result=0，再点「幂等核销」。换新 token 会得到 1208，联调不认。',
        logid: '',
      }
    }
    const verifyToken =
      qToken || (opts?.idempotent ? lastSuccessToken : '') || `meoo-verify-${Date.now()}`
    const j = await postCertificate('/goodlife/v1/fulfilment/certificate/verify/', creds, {
      verify_token: verifyToken,
      poi_id: poiId,
      codes,
      order_id: orderId,
    })
    const data = asRec(j.data) || {}
    const extra = asRec(j.extra) || {}
    const logid = extraLogid(j)
    const err = numericCode(data.error_code ?? extra.error_code)
    const results = Array.isArray(data.verify_results) ? data.verify_results : []
    const first = asRec(results[0]) || {}
    const result = numericCode(first.result)
    const verifyId = String(first.verify_id || '').trim()
    const certificateId = String(first.certificate_id || '').trim()
    const ok = err === 0 && result === 0
    pushHit({
      at: new Date().toISOString(),
      action: 'openapi.certificate.verify',
      logid: logid || '(missing)',
      orderId,
      codes,
      responseSummary:
        `error_code=${err};result=${result};desc=${String(data.description || extra.description || first.msg || '')}` +
        (verifyId ? `;verify_id=${verifyId}` : '') +
        `;verify_token=${verifyToken}`,
      verifyId: verifyId || undefined,
      certificateId: certificateId || undefined,
      verifyToken,
    })
    if (ok) {
      return {
        ok: true,
        notice: opts?.idempotent
          ? `幂等核销成功（result=0，token 未变）。把这条 extra.logid 填联调第 5 步：${logid}`
          : `验券成功（result=0）。把这条 extra.logid 填联调「核销成功」：${logid}`,
        logid,
      }
    }
    if (err === 0 && result === 1208) {
      return {
        ok: false,
        notice:
          `验券返回 1208（已核销）。联调「幂等核销」不认 1208，必须用「核销成功」那次同一个 verify_token 再打才会 result=0。不要填这条 logid：${logid}`,
        logid,
      }
    }
    return {
      ok: false,
      notice: `验券未成功：error_code=${err} result=${result} ${String(data.description || extra.description || first.msg || '')} logid=${logid}`,
      logid,
    }
  }

  const vHit = recent.find((h) => h.verifyId && h.certificateId)
  if (!vHit?.verifyId || !vHit.certificateId) {
    return { ok: false, notice: '还没有验券成功记录，请先点「验券」。', logid: '' }
  }
  const j = await postCertificate('/goodlife/v1/fulfilment/certificate/cancel/', creds, {
    verify_id: vHit.verifyId,
    certificate_id: vHit.certificateId,
  })
  const data = asRec(j.data) || {}
  const extra = asRec(j.extra) || {}
  const logid = extraLogid(j)
  const err = numericCode(data.error_code ?? extra.error_code)
  const ok = err === 0
  pushHit({
    at: new Date().toISOString(),
    action: 'openapi.certificate.cancel',
    logid: logid || '(missing)',
    orderId: vHit.orderId,
    codes: vHit.codes,
    responseSummary: `error_code=${err};desc=${String(data.description || extra.description || '')}`,
  })
  if (ok) {
    return { ok: true, notice: `撤销核销成功。把这条 extra.logid 填联调第 5 步：${logid}`, logid }
  }
  return {
    ok: false,
    notice: `撤销未成功：error_code=${err} ${String(data.description || extra.description || '')} logid=${logid}`,
    logid,
  }
}

function panelHtml(
  state: SpiState,
  latestIssueLogid: string,
  latestPrecreateLogid: string,
  openApiNotice = '',
): string {
  const fail = state.precreateFailCode
  const issue = state.issueMode
  const refund = state.refundMode
  const on = (cond: boolean) => (cond ? ' on' : '')
  const issueLogid = latestIssueLogid || ''
  const preLogid = latestPrecreateLogid || ''
  const sc = currentScenario(state)
  const sceneBtns = (group: SpiScenario['group']) =>
    SPI_SCENARIOS.filter((s) => s.group === group)
      .map(
        (s) =>
          `<a class="btn scene${on(sc?.id === s.id)}" href="?panel=1&set_scenario=${encodeURIComponent(s.id)}">${escHtml(s.title)}</a>`,
      )
      .join('')
  const sceneCard = sc
    ? `<div class="card" style="border-color:#38bdf8">
      <div class="muted">当前用例</div>
      <div class="logid">${escHtml(sc.title)}</div>
      <p class="how">${escHtml(sc.how)}</p>
      <div class="muted" style="margin-top:8px">去抖音：${escHtml(sc.buy)} · 回来复制：${escHtml(sc.copy)}</div>
    </div>`
    : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>抖音 SPI 联调面板</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font:14px/1.45 ui-sans-serif,system-ui; background:#0f172a; color:#e2e8f0; }
    .wrap { max-width:1080px; margin:0 auto; padding:20px 16px 48px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:#94a3b8; margin-bottom:16px; }
    .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:14px 16px; margin-bottom:12px; }
    .logid { font:16px/1.4 ui-monospace,Menlo,monospace; word-break:break-all; color:#38bdf8; }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:10px; }
    button, a.btn { appearance:none; border:0; border-radius:8px; padding:8px 12px; background:#334155; color:#f8fafc; cursor:pointer; text-decoration:none; font:inherit; display:inline-block; }
    button.pri { background:#2563eb; }
    a.ok, button.ok { background:#0f766e; }
    a.warn, button.warn { background:#b45309; }
    a.bad, button.bad { background:#be123c; }
    a.on, button.on { outline:3px solid #38bdf8; box-shadow:0 0 0 1px #38bdf8; }
    .how { color:#e2e8f0; margin:6px 0 0; }
    .scene { background:#0f172a; border:1px solid #334155; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #334155; vertical-align:top; }
    th { color:#94a3b8; font-weight:600; }
    .mono { font-family:ui-monospace,Menlo,monospace; }
    .muted { color:#94a3b8; }
    .okt { color:#34d399; } .badt { color:#fb7185; } .iss { color:#fbbf24; font-weight:700; }
    .copyok { color:#34d399; margin-left:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>抖音 SPI 联调面板</h1>
    <p class="sub">点下面用例切桩，再去抖音买。蓝框=当前选中。下单失败用例来客库存必须大于 0，不要用来客限购/库存=0。</p>
    ${
      openApiNotice
        ? `<div class="card" style="border-color:#38bdf8"><div class="muted">OpenAPI 结果</div><div class="logid" style="white-space:pre-wrap">${escHtml(openApiNotice)}</div></div>`
        : ''
    }
    ${sceneCard}
    <div class="card">
      <div class="muted">下单失败（校验预下单 · 库存必须>0）</div>
      <div class="row">${sceneBtns('order_fail')}</div>
      <div class="muted" style="margin-top:12px">发券 / 核销 / 退款</div>
      <div class="row">${sceneBtns('fulfil')}</div>
    </div>
    <div class="card">
      <div class="muted">发券 logid（同步发券超时用这一条）</div>
      <div id="latestIssue" class="logid">${issueLogid || '（还没有发券请求，先切「发券超时」再去支付）'}</div>
      <div class="row">
        <button type="button" class="pri" id="copyIssue">复制发券 logid</button>
        <button type="button" class="ok" id="copyPre">复制预下单 logid</button>
        <span id="copied" class="copyok" hidden>已复制</span>
      </div>
      <div class="muted" style="margin-top:8px">预下单 logid：<span id="latestPre" class="mono">${preLogid || '—'}</span></div>
      <div class="muted" style="margin-top:10px">联调 extra.logid（点按钮复制后填入对应步骤）</div>
      <div class="muted" style="margin-top:6px">核销成功</div>
      <div id="latestVerify" class="logid">—</div>
      <div class="muted" style="margin-top:6px">撤销核销</div>
      <div id="latestCancel" class="logid">—</div>
      <div class="muted" style="margin-top:6px">幂等核销</div>
      <div id="latestIdempotent" class="logid">—</div>
      <div class="muted" style="margin-top:6px">退款审核（不要填进「信息同步」）</div>
      <div id="latestRefund" class="logid">—</div>
      <div class="muted" style="margin-top:6px">信息同步（客服强退第 5 步填这一条）</div>
      <div id="latestNotify" class="logid">—</div>
      <div class="row">
        <button type="button" class="pri" id="copyVerify">复制核销 logid</button>
        <button type="button" class="ok" id="copyCancel">复制撤销 logid</button>
        <button type="button" class="ok" id="copyIdempotent">复制幂等 logid</button>
        <button type="button" class="ok" id="copyRefund">复制退款审核 logid</button>
        <button type="button" class="pri" id="copyNotify">复制信息同步 logid</button>
      </div>
      <div class="muted" style="margin-top:10px">codes / order_id</div>
      <div id="latestCodes" class="logid">—</div>
      <div id="latestOrder" class="logid">—</div>
      <div class="muted" style="margin-top:6px">verify_id / certificate_id</div>
      <div id="latestVerifyIds" class="logid">—</div>
      <div class="row">
        <button type="button" class="pri" id="copyCodes">复制券码</button>
        <button type="button" class="ok" id="copyOrder">复制订单号</button>
      </div>
      <div class="row">
        <a class="btn pri" href="?panel=1&amp;do_verify=1">验券</a>
        <a class="btn pri" id="verifyOne" href="?panel=1&amp;do_verify=1">验第 1 张</a>
        <a class="btn pri" id="verifyTwo" href="?panel=1&amp;do_verify=1">验第 2 张</a>
        <a class="btn warn" href="?panel=1&amp;do_cancel=1">撤销核销</a>
        <a class="btn ok" href="?panel=1&amp;do_idempotent=1">幂等核销（同一 token 再验，必须 result=0）</a>
      </div>
      <div class="muted" style="margin-top:8px">当前模式：<span id="mode">…</span></div>
    </div>
    <div class="card">
      <div class="muted" style="margin-bottom:8px">细调桩（一般点上面用例即可）</div>
      <div class="muted">下单桩</div>
      <div class="row">
        <a class="btn ok${on(fail === 0)}" href="?panel=1&set_precreate_fail=0">预下单成功</a>
        <a class="btn warn${on(fail === 1)}" href="?panel=1&set_precreate_fail=1">商品不存在</a>
        <a class="btn warn${on(fail === 2)}" href="?panel=1&set_precreate_fail=2">商品已下线</a>
        <a class="btn warn${on(fail === 3)}" href="?panel=1&set_precreate_fail=3">未到售卖时间</a>
        <a class="btn warn${on(fail === 4)}" href="?panel=1&set_precreate_fail=4">已过售卖时间</a>
        <a class="btn bad${on(fail === 5)}" href="?panel=1&set_precreate_fail=5">库存售罄/已抢完</a>
        <a class="btn bad${on(fail === 6)}" href="?panel=1&set_precreate_fail=6">购买上限</a>
        <a class="btn bad${on(fail === 7)}" href="?panel=1&set_precreate_fail=7">价格校验失败</a>
      </div>
      <div class="muted" style="margin-top:10px">发券桩</div>
      <div class="row">
        <a class="btn ok${on(issue === 'success')}" href="?panel=1&set_issue_mode=success">发券同步成功</a>
        <a class="btn warn${on(issue === 'async')}" href="?panel=1&set_issue_mode=async">发券超时(async)</a>
        <a class="btn bad${on(issue === 'fail')}" href="?panel=1&set_issue_mode=fail">发券失败</a>
      </div>
      <div class="muted" style="margin-top:10px">退款桩</div>
      <div class="row">
        <a class="btn ok${on(refund === 'agree')}" href="?panel=1&set_refund_mode=agree">同意退款</a>
        <a class="btn bad${on(refund === 'reject')}" href="?panel=1&set_refund_mode=reject">拒绝退款（不补码）</a>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>时间</th><th>动作</th><th>logid</th><th>订单</th><th>券码</th><th>返回</th></tr></thead>
        <tbody id="rows"><tr><td colspan="6" class="muted">暂无</td></tr></tbody>
      </table>
    </div>
  </div>
  <script>
    const failLabel = {0:'预下单成功',1:'商品不存在',2:'商品已下线',3:'未开售',4:'已过售卖',5:'库存售罄',6:'购买上限',7:'价格校验失败'};
    const issueLabel = {success:'发券同步成功',async:'发券超时',fail:'发券失败'};
    const refundLabel = {agree:'同意退款',reject:'拒绝退款'};
    const api = location.pathname;
    const fmt = (iso) => {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
      catch { return iso; }
    };
    function actionName(a){
      const s = String(a||'').toLowerCase();
      if (s.includes('certificate.cancel')) return '撤销核销';
      if (s.includes('certificate.verify')) return '验券';
      if (s.includes('notice') || ((s.includes('refund')||s.includes('after_sale')) && (s.includes('sync')||s.includes('notify')||s.includes('info')))) return '信息同步';
      if (s.includes('refund')) return '退款审核';
      if (s.includes('tripartite')) return '发券';
      if (s.includes('pre_create')) return '预下单';
      return a || '—';
    }
    async function load() {
      try {
        const r = await fetch(api + '?diag=1&_=' + Date.now(), { cache: 'no-store' });
        const j = await r.json();
        const rows = j.recentLogids || [];
        const issueHit = rows.find(h => String(h.action||'').toLowerCase().includes('tripartite'));
        const preHit = rows.find(h => String(h.action||'').toLowerCase().includes('pre_create'));
        document.getElementById('latestIssue').textContent = (issueHit && issueHit.logid) || '（还没有发券请求，先切「发券超时」再去支付）';
        document.getElementById('latestPre').textContent = (preHit && preHit.logid) || '—';
        const codeHit = rows.find(h => Array.isArray(h.codes) && h.codes.length);
        const codesText = codeHit ? codeHit.codes.join(' ') : '（发券同步成功后会出现 12–15 位数字券码）';
        document.getElementById('latestCodes').textContent = codesText;
        document.getElementById('latestOrder').textContent = (codeHit && codeHit.orderId) || (issueHit && issueHit.orderId) || '（发券成功后会出现抖音订单号）';
        const isVerify = (h) => String(h.action||'').toLowerCase().includes('certificate.verify');
        const resultOf = (h) => {
          const m = String(h.responseSummary||'').match(/(?:^|;)result=(-?\d+)(?:;|$)/);
          return m ? Number(m[1]) : -1;
        };
        const zeros = rows.filter(h => isVerify(h) && resultOf(h) === 0);
        const idemHit = zeros.find(h => h.verifyToken && zeros.filter(x => x.verifyToken === h.verifyToken).length >= 2);
        const verifyHit = idemHit
          ? zeros.filter(x => x.verifyToken === idemHit.verifyToken).slice(-1)[0]
          : zeros[0];
        const cancelHit = rows.find(h => String(h.action||'').toLowerCase().includes('certificate.cancel'));
        const isNotify = (h) => {
          const s = String(h.action||'').toLowerCase();
          return s.includes('notice') || ((s.includes('refund')||s.includes('after_sale')) && (s.includes('sync')||s.includes('notify')||s.includes('info')));
        };
        const refundHit = rows.find(h => String(h.action||'').toLowerCase().includes('refund') && !isNotify(h));
        const notifyHit = rows.find(h => isNotify(h));
        document.getElementById('latestVerify').textContent = (verifyHit && verifyHit.logid) || '（先点「验券」，result 必须是 0）';
        document.getElementById('latestCancel').textContent = (cancelHit && cancelHit.logid) || '—';
        document.getElementById('latestIdempotent').textContent = (idemHit && idemHit.logid) || '（验券成功后点「幂等核销」，不要换 token）';
        document.getElementById('latestRefund').textContent = (refundHit && refundHit.logid) || '—';
        document.getElementById('latestNotify').textContent = (notifyHit && notifyHit.logid) || '（客服强退后才会出现；不要填退款审核 logid）';
        const idsHit = rows.find(h => isVerify(h) && (h.verifyId || h.certificateId));
        const vid = (idsHit && idsHit.verifyId) || '';
        const cid = (idsHit && idsHit.certificateId) || '';
        document.getElementById('latestVerifyIds').textContent = (vid && cid) ? (vid + ' / ' + cid) : '（验券成功后会出现）';
        window.__spiDebug = {
          codes: codeHit && codeHit.codes ? codeHit.codes : [],
          orderId: (codeHit && codeHit.orderId) || (issueHit && issueHit.orderId) || '',
          poiId: '7569859650230781962',
          verifyId: vid,
          certificateId: cid,
        };
        const st = j.state || {};
        const fail = Number(st.precreateFailCode || 0);
        document.getElementById('mode').textContent =
          (failLabel[fail] || ('失败码'+fail)) + ' · ' + (issueLabel[st.issueMode] || st.issueMode) + ' · ' + (refundLabel[st.refundMode] || st.refundMode || '同意退款');
        const codesArr = codeHit && Array.isArray(codeHit.codes) ? codeHit.codes : [];
        const v1 = document.getElementById('verifyOne');
        const v2 = document.getElementById('verifyTwo');
        if (v1) v1.setAttribute('href', codesArr[0] ? ('?panel=1&do_verify=1&codes=' + encodeURIComponent(codesArr[0])) : '?panel=1&do_verify=1');
        if (v2) v2.setAttribute('href', codesArr[1] ? ('?panel=1&do_verify=1&codes=' + encodeURIComponent(codesArr[1])) : '?panel=1&do_verify=1');
        const tb = document.getElementById('rows');
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="muted">暂无。扫码支付后会出现。</td></tr>'; return; }
        tb.innerHTML = rows.map(h => {
          const name = actionName(h.action);
          const isIssue = name === '发券';
          const codes = (h.codes && h.codes.length) ? h.codes.join(' ') : '—';
          return '<tr><td>'+fmt(h.at)+'</td><td class="mono '+(isIssue?'iss':'')+'">'+esc(name)+'</td><td class="mono '+(isIssue?'iss':'okt')+'">'+esc(h.logid)+'</td><td class="mono">'+esc(h.orderId||'')+'</td><td class="mono iss">'+esc(codes)+'</td><td class="mono">'+esc(h.responseSummary||'')+'</td></tr>';
        }).join('');
      } catch (e) { console.warn(e); }
    }
    function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    async function copyText(t) {
      if (!t || t.startsWith('（') || t === '—') return;
      await navigator.clipboard.writeText(t);
      const el = document.getElementById('copied'); el.hidden = false; setTimeout(() => el.hidden = true, 1200);
    }
    document.getElementById('copyIssue').onclick = () => copyText(document.getElementById('latestIssue').textContent.trim());
    document.getElementById('copyPre').onclick = () => copyText(document.getElementById('latestPre').textContent.trim());
    document.getElementById('copyCodes').onclick = () => copyText(document.getElementById('latestCodes').textContent.trim());
    document.getElementById('copyOrder').onclick = () => copyText(document.getElementById('latestOrder').textContent.trim());
    document.getElementById('copyVerify').onclick = () => copyText(document.getElementById('latestVerify').textContent.trim());
    document.getElementById('copyCancel').onclick = () => copyText(document.getElementById('latestCancel').textContent.trim());
    document.getElementById('copyIdempotent').onclick = () => copyText(document.getElementById('latestIdempotent').textContent.trim());
    document.getElementById('copyRefund').onclick = () => copyText(document.getElementById('latestRefund').textContent.trim());
    document.getElementById('copyNotify').onclick = () => copyText(document.getElementById('latestNotify').textContent.trim());
    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`
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
    const setRefund = queryOne(req, 'set_refund_mode')
    const setScenario = queryOne(req, 'set_scenario')
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
    if (setRefund === 'agree' || setRefund === 'reject') {
      state.refundMode = setRefund
      state.updatedAt = new Date().toISOString()
      changed = true
    }
    if (setScenario) {
      const sc = scenarioById(setScenario)
      if (sc) {
        applyScenario(state, sc)
        changed = true
      }
    }
    if (changed) writeState(state)

    let openApiNotice = ''
    const doVerify = queryOne(req, 'do_verify') === '1'
    const doCancel = queryOne(req, 'do_cancel') === '1'
    const doIdempotent = queryOne(req, 'do_idempotent') === '1'
    const doToken = queryOne(req, 'do_token') === '1'
    const wantPanel = queryOne(req, 'panel') === '1' || queryOne(req, 'panel') === 'html'
    if (doToken) {
      try {
        const creds = await loadOpenApiCreds()
        const token = await ensureSpiClientToken(creds, false)
        openApiNotice =
          `把下面整段贴进调试台「请求头」的 access-token（不要点 client_token 那几个字）：\n${token}`
      } catch (e) {
        openApiNotice = e instanceof Error ? e.message : String(e)
      }
      if (wantPanel) {
        g.__meooDouyinSpiFlash = openApiNotice
        res.setHeader('Location', '?panel=1')
        res.setHeader('Cache-Control', 'no-store')
        res.status(302).end()
        return
      }
    }
    if (doVerify || doCancel || doIdempotent) {
      try {
        const r = await runPanelOpenApi(doCancel ? 'cancel' : 'verify', {
          verifyToken: queryOne(req, 'verify_token'),
          orderId: queryOne(req, 'order_id'),
          codes: queryOne(req, 'codes'),
          idempotent: doIdempotent || queryOne(req, 'idempotent') === '1',
        })
        openApiNotice = r.notice
      } catch (e) {
        openApiNotice = e instanceof Error ? e.message : String(e)
      }
      if (wantPanel) {
        g.__meooDouyinSpiFlash = openApiNotice
        res.setHeader('Location', '?panel=1')
        res.setHeader('Cache-Control', 'no-store')
        res.status(302).end()
        return
      }
    }
    if (wantPanel && g.__meooDouyinSpiFlash) {
      openApiNotice = g.__meooDouyinSpiFlash
      g.__meooDouyinSpiFlash = ''
    }

    const recent = hits().slice(0, 15)
    const latestIssueLogid = recent.find((h) => isIssueAction(h.action))?.logid || ''
    const latestPrecreateLogid = recent.find((h) => isPrecreateAction(h.action))?.logid || ''
    const payload = {
      ok: true,
      endpoint: '/api/meoo-douyin-spi',
      state: readState(),
      stateFile: statePath(),
      recentLogids: recent.map((h) => ({
        at: h.at,
        action: h.action,
        logid: h.logid,
        orderId: h.orderId,
        skuId: h.skuId,
        codes: codesForHit(h),
        verifyId: h.verifyId,
        certificateId: h.certificateId,
        verifyToken: h.verifyToken,
        responseSummary: h.responseSummary,
      })),
      latestLogid: latestIssueLogid || recent[0]?.logid || null,
      latestIssueLogid,
      latestPrecreateLogid,
      latestVerifyLogid: recent.find((h) => isVerifyAction(h.action))?.logid || '',
      latestRefundLogid: recent.find((h) => isRefundAction(h.action))?.logid || '',
      latestNotifyLogid: recent.find((h) => isRefundNotifyAction(h.action))?.logid || '',
      scenario: currentScenario(readState())?.id || '',
      hint: {
        panel: 'GET ?panel=1',
        setScenario: 'GET ?set_scenario=order_fail_price',
        setOfflineFail: 'GET ?set_precreate_fail=2',
        setSuccess: 'GET ?set_precreate_fail=0',
        setIssueAsync: 'GET ?set_issue_mode=async',
        diag: 'GET ?diag=1',
      },
    }
    if (wantPanel) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).send(panelHtml(readState(), latestIssueLogid, latestPrecreateLogid, openApiNotice))
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    json(res, 200, payload)
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
  const a = action.toLowerCase()
  const isIssue =
    a.includes('tripartite') ||
    a.includes('fulfilment.order') ||
    (a === 'unknown' && body.open_id != null)

  if (state.issueMode === 'async' && isIssue) {
    pushHit({
      at: new Date().toISOString(),
      action,
      logid: logid || '(missing)',
      orderId: String(body.order_id ?? '').trim() || undefined,
      skuId: String(body.sku_id ?? body.third_sku_id ?? '').trim() || undefined,
      responseSummary: 'hang>8s no HTTP 200',
    })
    console.info(
      `[douyin-spi] action=${action} logid=${logid || '-'} order=${String(body.order_id ?? '')} hang>8s`,
    )
    await new Promise((r) => setTimeout(r, 8500))
    const raw = res as VercelResponse & {
      destroy?: () => void
      writableEnded?: boolean
      headersSent?: boolean
    }
    if (!raw.writableEnded && !raw.headersSent) {
      try {
        raw.destroy?.()
      } catch {
        /* 抖音侧 8s 已超时 */
      }
    }
    return
  }

  let out: Record<string, unknown>
  if (a.includes('pre_create') || a === 'trade.order.pre_create_order') {
    out = handlePrecreate(state, body)
  } else if (a.includes('tripartite') || a.includes('fulfilment.order')) {
    out = handleIssue(state, body)
  } else if (
    a.includes('notice') ||
    (a.includes('refund') && (a.includes('sync') || a.includes('notify') || a.includes('info')))
  ) {
    out = handleRefundNotify(body)
  } else if (a.includes('refund')) {
    out = handleRefund(state, body)
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
  const orderId = String(body.order_id ?? '').trim() || undefined
  const codes = codesFromIssueData(data, orderId)
  const summary =
    `error_code=${data.error_code ?? ''};result=${data.result ?? ''};ext=${data.ext_order_id ?? ''}` +
    (codes.length ? `;codes=${codes.join(',')}` : '')
  pushHit({
    at: new Date().toISOString(),
    action,
    logid: logid || '(missing)',
    orderId,
    skuId: String(body.sku_id ?? body.third_sku_id ?? '').trim() || undefined,
    responseSummary: summary,
    codes: codes.length ? codes : undefined,
  })

  console.info(
    `[douyin-spi] action=${action} logid=${logid || '-'} order=${String(body.order_id ?? '')} keys=${Object.keys(body).join(',')} ${summary}`,
  )

  spiJson(res, logid, out)
}

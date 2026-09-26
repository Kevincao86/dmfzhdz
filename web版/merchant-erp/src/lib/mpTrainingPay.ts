/**
 * 培训保证金与课时费。和课程、讲师资料写在同一份 data/mp-training.json。
 * 单号前缀 TRN，支付结果通知据此入账。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createAlipayPrecreateOrder, createAlipayRefund, loadAlipayPayConfig, queryAlipayOrderByOutTradeNo } from './alipayPay.js'
import {
  createDouyinPayNativeOrder,
  createDouyinPayRefund,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  queryDouyinPayOrderByOutTradeNo,
} from './douyinPayV1.js'
import {
  buildJsapiPayParams,
  createWechatDomesticRefund,
  createWechatJsapiOrder,
  createWechatNativeOrder,
  loadWechatPayConfig,
  queryWechatOrderByOutTradeNo,
  wechatNativeCodeUrlToDataUrl,
} from './wechatPayV3.js'

const FILE = path.join(process.cwd(), 'data', 'mp-training.json')
const DEPOSIT_CENTS = 50000

type Pay = {
  outTradeNo: string
  purpose: 'deposit' | 'course'
  hostId: string
  courseId: string
  payerName: string
  contact: string
  answers?: Record<string, string>
  amountCents: number
  channel: 'wechat' | 'alipay' | 'douyin'
  payerHostId: string
  status: 'pending' | 'paid' | 'refunded'
  createdAt: string
  paidAt: string
  transactionId: string
}

type Deposit = {
  hostId: string
  yuan: number
  paidAt: string
  channel: string
  outTradeNo: string
}

type Bag = {
  courses: Array<Record<string, unknown>>
  profiles: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
  payments: Pay[]
  deposits: Deposit[]
  payouts: Array<Record<string, unknown>>
}

function emptyBag(): Bag {
  return { courses: [], profiles: [], orders: [], payments: [], deposits: [], payouts: [] }
}

function readBag(): Bag {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (Array.isArray(data)) return { ...emptyBag(), courses: data }
    return {
      courses: Array.isArray(data.courses) ? data.courses : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
      payments: Array.isArray(data.payments) ? data.payments : [],
      deposits: Array.isArray(data.deposits) ? data.deposits : [],
      payouts: Array.isArray(data.payouts) ? data.payouts : [],
    }
  } catch {
    return emptyBag()
  }
}

function writeBag(bag: Bag) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(bag), 'utf8')
}

function tradeNo() {
  return `TRN${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`
}

type SignupField = { key: string; label: string; kind: 'name' | 'idNo' | 'phone' | 'text' }

const DEFAULT_SIGNUP_FIELDS: SignupField[] = [
  { key: 'name', label: '姓名', kind: 'name' },
  { key: 'idNo', label: '身份证号', kind: 'idNo' },
  { key: 'phone', label: '手机号', kind: 'phone' },
]

export function normalizeSignupFields(raw: unknown): SignupField[] {
  const list = Array.isArray(raw) ? raw : []
  const out: SignupField[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const label = String(row.label || '').trim().slice(0, 20)
    if (!label) continue
    const kind = row.kind === 'name' || row.kind === 'idNo' || row.kind === 'phone' || row.kind === 'text' ? row.kind : 'text'
    const key = String(row.key || `${kind}-${out.length}`).trim().slice(0, 24)
    if (!key || out.some((field) => field.key === key)) continue
    out.push({ key, label, kind })
    if (out.length >= 8) break
  }
  if (!out.some((field) => field.kind === 'name')) out.unshift(DEFAULT_SIGNUP_FIELDS[0])
  return out.length ? out : DEFAULT_SIGNUP_FIELDS.map((field) => ({ ...field }))
}

export function validateSignupAnswers(fields: SignupField[], raw: unknown) {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const answers: Record<string, string> = {}
  for (const field of fields) {
    const value = String(source[field.key] || '').trim()
    if (!value) return { ok: false as const, error: `请填写${field.label}` }
    if (field.kind === 'idNo' && !/^(\d{15}|\d{17}[\dXx])$/.test(value)) {
      return { ok: false as const, error: '请填写正确的身份证号' }
    }
    if (field.kind === 'phone' && !/^1\d{10}$/.test(value)) {
      return { ok: false as const, error: '请填写正确的手机号' }
    }
    answers[field.key] = value
  }
  const name = fields.find((field) => field.kind === 'name')
  const phone = fields.find((field) => field.kind === 'phone')
  return {
    ok: true as const,
    answers,
    name: name ? answers[name.key] : '',
    phone: phone ? answers[phone.key] : '',
  }
}

function splitFee(fee: number) {
  const pay = Math.round(fee * 100) / 100
  const commission = Math.round(pay * 0.01 * 100) / 100
  const payable = Math.round((pay - commission) * 100) / 100
  return { pay, commission, payable }
}

export function trainingDepositView(hostId: string) {
  if (!hostId) return { paid: false, yuan: 500, paidAt: '', channel: '' }
  const row = readBag().deposits.find((d) => d.hostId === hostId)
  if (!row) return { paid: false, yuan: 500, paidAt: '', channel: '' }
  return { paid: true, yuan: row.yuan, paidAt: row.paidAt, channel: row.channel }
}

function enrollCourse(bag: Bag, pay: Pay) {
  const course = bag.courses.find((c) => String(c.id || '') === pay.courseId)
  if (!course) return
  const signups = Array.isArray(course.signups) ? (course.signups as Array<Record<string, unknown>>) : []
  if (signups.some((s) => s.orderId && bag.orders.some((o) => o.id === s.orderId && o.outTradeNo === pay.outTradeNo))) return
  const parts = splitFee(pay.amountCents / 100)
  const order = {
    id: `od-${Date.now()}`,
    courseId: pay.courseId,
    title: String(course.title || ''),
    hostId: String(course.hostId || ''),
    name: pay.payerName,
    contact: pay.contact,
    ...parts,
    status: 'escrow',
    evidence: '',
    outTradeNo: pay.outTradeNo,
    channel: pay.channel,
    payerHostId: pay.payerHostId || '',
    createdAt: new Date().toISOString(),
    verifiedAt: '',
    settleAt: '',
  }
  signups.push({
    id: `su-${Date.now()}`,
    name: pay.payerName,
    contact: pay.contact,
    answers: pay.answers || {},
    at: order.createdAt,
    orderId: order.id,
  })
  course.signups = signups
  course.enrolled = signups.length
  bag.orders.unshift(order)
}

function markPaid(bag: Bag, outTradeNo: string, transactionId: string) {
  const pay = bag.payments.find((p) => p.outTradeNo === outTradeNo)
  if (!pay) return false
  if (pay.status !== 'paid') {
    pay.status = 'paid'
    pay.paidAt = new Date().toISOString()
    pay.transactionId = transactionId
    if (pay.purpose === 'deposit') {
      bag.deposits = bag.deposits.filter((d) => d.hostId !== pay.hostId).concat({
        hostId: pay.hostId,
        yuan: pay.amountCents / 100,
        paidAt: pay.paidAt,
        channel: pay.channel,
        outTradeNo: pay.outTradeNo,
      })
    } else {
      enrollCourse(bag, pay)
    }
  }
  writeBag(bag)
  return true
}

export function confirmTrainingPay(outTradeNo: string, transactionId: string) {
  const no = String(outTradeNo || '').trim()
  if (!no.startsWith('TRN')) return false
  const bag = readBag()
  if (!bag.payments.some((p) => p.outTradeNo === no)) return false
  return markPaid(bag, no, transactionId)
}

async function providerPaid(pay: Pay) {
  if (pay.channel === 'wechat') {
    const cfg = loadWechatPayConfig()
    if (!cfg.ok) return null
    const q = await queryWechatOrderByOutTradeNo(cfg.config, pay.outTradeNo)
    if (q.tradeState === 'SUCCESS') return q.transactionId || 'wechat'
  } else if (pay.channel === 'alipay') {
    const cfg = loadAlipayPayConfig()
    if (!cfg.ok) return null
    const q = await queryAlipayOrderByOutTradeNo(cfg.config, pay.outTradeNo)
    if (q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED') return q.tradeNo || 'alipay'
  } else {
    const cfg = loadDouyinPayMerchantConfig()
    if (!cfg.ok) return null
    const q = await queryDouyinPayOrderByOutTradeNo(cfg.config, pay.outTradeNo)
    if (isDouyinPayOrderSuccess(q.tradeState)) return q.transactionId || 'douyin'
  }
  return null
}

export async function queryTrainingPay(outTradeNo: string) {
  const bag = readBag()
  const pay = bag.payments.find((p) => p.outTradeNo === outTradeNo)
  if (!pay) return { ok: false, error: '支付单不存在' }
  if (pay.status !== 'paid') {
    const txn = await providerPaid(pay)
    if (txn) markPaid(readBag(), pay.outTradeNo, txn)
  }
  const next = readBag().payments.find((p) => p.outTradeNo === outTradeNo)
  return {
    ok: true,
    paid: next?.status === 'paid',
    purpose: pay.purpose,
    deposit: trainingDepositView(pay.hostId),
  }
}

export async function createTrainingPrepay(body: Record<string, unknown>) {
  const purpose = body.purpose === 'course' ? 'course' : 'deposit'
  const channel = body.channel === 'alipay' || body.channel === 'douyin' ? body.channel : 'wechat'
  const scene = body.scene === 'jsapi' ? 'jsapi' : 'native'
  const hostId = String(body.hostId || '').trim()
  if (scene === 'jsapi' && channel !== 'wechat') {
    return { ok: false as const, error: '小程序请使用微信支付' }
  }
  if (purpose === 'deposit' && !hostId) return { ok: false as const, error: '缺少身份' }
  const bag = readBag()
  let amountCents = DEPOSIT_CENTS
  let courseId = ''
  let description = '培训保证金'
  if (purpose === 'deposit') {
    if (bag.deposits.some((d) => d.hostId === hostId)) {
      return { ok: false as const, error: '保证金已缴纳' }
    }
  } else {
    courseId = String(body.courseId || body.id || '').trim()
    const course = bag.courses.find((c) => String(c.id || '') === courseId)
    if (!course) return { ok: false as const, error: '课程不存在' }
    const review = String(course.reviewStatus || '')
    if (review && review !== 'approved') return { ok: false as const, error: '课程还在审核中' }
    const signups = Array.isArray(course.signups) ? course.signups : []
    if (signups.length >= Math.max(1, Number(course.seats) || 1)) return { ok: false as const, error: '名额已满' }
    const payerHostId = hostId
    if (
      payerHostId &&
      bag.orders.some(
        (o) => String(o.courseId || '') === courseId && String(o.payerHostId || '') === payerHostId,
      )
    ) {
      return { ok: false as const, error: '你已报名该课程' }
    }
    const fields = normalizeSignupFields(course.signupFields)
    const filled = validateSignupAnswers(fields, body.answers || { name: body.name, phone: body.contact, idNo: body.idNo })
    if (!filled.ok) return { ok: false as const, error: filled.error }
    body.name = filled.name
    body.contact = filled.phone
    body.answers = filled.answers
    amountCents = Math.round((Number(course.fee) || 0) * 100)
    if (amountCents < 1) return { ok: false as const, error: '课程费用无效，无法发起支付' }
    description = `培训课时费 ${String(course.title || '')}`.slice(0, 40)
  }
  const outTradeNo = tradeNo()
  const pay: Pay = {
    outTradeNo,
    purpose,
    hostId: purpose === 'deposit' ? hostId : String(bag.courses.find((c) => String(c.id) === courseId)?.hostId || ''),
    courseId,
    payerName: String(body.name || '').trim(),
    contact: String(body.contact || '').trim(),
    answers: body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, string>) : {},
    amountCents,
    channel,
    payerHostId: hostId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    paidAt: '',
    transactionId: '',
  }
  bag.payments.unshift(pay)
  writeBag(bag)
  let qrDataUrl = ''
  let jsapiParams: ReturnType<typeof buildJsapiPayParams> | undefined
  if (channel === 'wechat' && scene === 'jsapi') {
    const openid = String(body.openid || '').trim()
    if (!openid) return { ok: false as const, error: '请使用微信登录后再支付' }
    const cfg = loadWechatPayConfig()
    if (!cfg.ok) return { ok: false as const, error: '微信支付未配置' }
    const { prepayId } = await createWechatJsapiOrder({
      cfg: cfg.config,
      outTradeNo,
      description,
      amountCents,
      openid,
      attach: purpose,
    })
    jsapiParams = buildJsapiPayParams(cfg.config, prepayId)
  } else if (channel === 'wechat') {
    const cfg = loadWechatPayConfig()
    if (!cfg.ok) return { ok: false as const, error: '微信支付未配置' }
    const { codeUrl } = await createWechatNativeOrder({
      cfg: cfg.config,
      outTradeNo,
      description,
      amountCents,
      attach: purpose,
    })
    qrDataUrl = await wechatNativeCodeUrlToDataUrl(codeUrl)
  } else if (channel === 'alipay') {
    const cfg = loadAlipayPayConfig()
    if (!cfg.ok) return { ok: false as const, error: '支付宝未配置' }
    const { qrCode } = await createAlipayPrecreateOrder({
      cfg: cfg.config,
      outTradeNo,
      description,
      amountCents,
      attach: purpose,
    })
    qrDataUrl = await wechatNativeCodeUrlToDataUrl(qrCode)
  } else {
    const cfg = loadDouyinPayMerchantConfig()
    if (!cfg.ok) return { ok: false as const, error: '抖音支付未配置' }
    const { codeUrl } = await createDouyinPayNativeOrder({
      cfg: cfg.config,
      outTradeNo,
      description,
      amountCents,
      attach: purpose,
    })
    qrDataUrl = await wechatNativeCodeUrlToDataUrl(codeUrl)
  }
  return {
    ok: true as const,
    outTradeNo,
    channel,
    payMode: scene === 'jsapi' ? 'wechat_jsapi' : `${channel}_native`,
    amountCents,
    qrDataUrl,
    jsapiParams,
  }
}

function laborTax(monthPayable: number) {
  const income = Number(monthPayable) || 0
  if (income <= 800) return 0
  const taxable = income <= 4000 ? income - 800 : income * 0.8
  let tax = taxable * 0.2
  if (taxable > 50000) tax = taxable * 0.4 - 7000
  else if (taxable > 20000) tax = taxable * 0.3 - 2000
  return Math.max(0, Math.round(tax * 100) / 100)
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function dueOrders(bag: Bag, hostId: string) {
  const now = Date.now()
  return bag.orders.filter((order) => {
    if (String(order.hostId || '') !== hostId || order.status !== 'ready') return false
    const at = String(order.settleAt || '')
    return !at || new Date(at).getTime() <= now
  })
}

export function trainingWithdrawQuote(hostId: string) {
  const bag = readBag()
  const profile = bag.profiles.find((p) => String(p.hostId || '') === hostId) || null
  const due = dueOrders(bag, hostId)
  const payable = money(due.reduce((sum, order) => sum + Number(order.payable || 0), 0))
  const commission = money(due.reduce((sum, order) => sum + Number(order.commission || 0), 0))
  const kind = profile && profile.kind === 'entity' ? 'entity' : 'person'
  const tax = kind === 'entity' ? 0 : laborTax(payable)
  const net = money(payable - tax)
  const bankNo = String(profile?.bankNo || '')
  return {
    count: due.length,
    payable,
    commission,
    tax,
    net,
    kind,
    bank: String(profile?.bank || ''),
    bankTail: bankNo.slice(-4),
    hasAccount: !!(profile && profile.name && bankNo),
  }
}

async function refundCaptured(pay: Pay) {
  const outRefundNo = `TRR${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`
  if (pay.channel === 'wechat') {
    const cfg = loadWechatPayConfig()
    if (!cfg.ok) throw new Error('微信支付未配置，无法原路退款')
    await createWechatDomesticRefund({
      cfg: cfg.config,
      outTradeNo: pay.outTradeNo,
      outRefundNo,
      refundCents: pay.amountCents,
      totalCents: pay.amountCents,
      reason: '培训保证金退款',
    })
  } else if (pay.channel === 'alipay') {
    const cfg = loadAlipayPayConfig()
    if (!cfg.ok) throw new Error('支付宝未配置，无法原路退款')
    await createAlipayRefund({
      cfg: cfg.config,
      outTradeNo: pay.outTradeNo,
      outRefundNo,
      refundCents: pay.amountCents,
      reason: '培训保证金退款',
    })
  } else {
    const cfg = loadDouyinPayMerchantConfig()
    if (!cfg.ok) throw new Error('抖音支付未配置，无法原路退款')
    await createDouyinPayRefund({
      cfg: cfg.config,
      outTradeNo: pay.outTradeNo,
      outRefundNo,
      refundCents: pay.amountCents,
      totalCents: pay.amountCents,
      reason: '培训保证金退款',
    })
  }
  return outRefundNo
}

export async function refundTrainingDeposit(hostId: string) {
  const id = String(hostId || '').trim()
  const first = readBag()
  const deposit = first.deposits.find((d) => d.hostId === id)
  if (!deposit) return { ok: false as const, error: '没有可退的保证金' }
  const pay = first.payments.find((p) => p.outTradeNo === deposit.outTradeNo && p.purpose === 'deposit')
  const captured = !!(pay && pay.status === 'paid' && pay.transactionId && !deposit.outTradeNo.startsWith('TRN-manual'))
  let outRefundNo = ''
  if (captured && pay) outRefundNo = await refundCaptured(pay)
  const bag = readBag()
  const freshPay = bag.payments.find((p) => p.outTradeNo === deposit.outTradeNo && p.purpose === 'deposit')
  if (freshPay && captured) freshPay.status = 'refunded'
  bag.deposits = bag.deposits.filter((d) => d.hostId !== id)
  const profile = bag.profiles.find((p) => String(p.hostId || '') === id)
  if (profile) {
    profile.lecturerStatus = 'none'
    profile.updatedAt = new Date().toISOString()
  }
  writeBag(bag)
  return { ok: true as const, lecturerStatus: 'none' as const, outRefundNo }
}

export function withdrawTraining(hostId: string) {
  const id = String(hostId || '').trim()
  const bag = readBag()
  const profile = bag.profiles.find((p) => String(p.hostId || '') === id)
  if (!profile || !profile.name || !profile.bankNo) {
    return { ok: false as const, error: '请先完成收款认证，绑定收款账户' }
  }
  const due = dueOrders(bag, id)
  if (!due.length) return { ok: false as const, error: '暂无可提现的结算单' }
  const quote = trainingWithdrawQuote(id)
  if (quote.net <= 0) return { ok: false as const, error: '扣税后没有可提现金额' }
  const now = new Date().toISOString()
  for (const order of due) {
    order.status = 'settled'
    order.withdrawnAt = now
  }
  bag.payouts.unshift({
    id: `po-${Date.now()}`,
    hostId: id,
    name: String(profile.name),
    bank: String(profile.bank || ''),
    bankNo: String(profile.bankNo),
    payable: quote.payable,
    commission: quote.commission,
    tax: quote.tax,
    net: quote.net,
    kind: quote.kind,
    orderIds: due.map((order) => String(order.id || '')),
    createdAt: now,
  })
  writeBag(bag)
  return { ok: true as const, ...quote }
}

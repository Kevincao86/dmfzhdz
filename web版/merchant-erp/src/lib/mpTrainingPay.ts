/**
 * 培训保证金与课时费。和课程、讲师资料写在同一份 data/mp-training.json。
 * 单号前缀 TRN，支付结果通知据此入账。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createAlipayPrecreateOrder, loadAlipayPayConfig, queryAlipayOrderByOutTradeNo } from './alipayPay.js'
import {
  createDouyinPayNativeOrder,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  queryDouyinPayOrderByOutTradeNo,
} from './douyinPayV1.js'
import {
  buildJsapiPayParams,
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
  amountCents: number
  channel: 'wechat' | 'alipay' | 'douyin'
  status: 'pending' | 'paid'
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
  profiles: unknown[]
  orders: Array<Record<string, unknown>>
  payments: Pay[]
  deposits: Deposit[]
}

function emptyBag(): Bag {
  return { courses: [], profiles: [], orders: [], payments: [], deposits: [] }
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
    createdAt: new Date().toISOString(),
    verifiedAt: '',
    settleAt: '',
  }
  signups.push({
    id: `su-${Date.now()}`,
    name: pay.payerName,
    contact: pay.contact,
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
    const name = String(body.name || '').trim()
    if (!name) return { ok: false as const, error: '请填写姓名' }
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
    amountCents,
    channel,
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

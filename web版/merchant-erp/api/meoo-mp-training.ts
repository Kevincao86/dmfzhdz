/**
 * GET/POST /api/meoo-mp-training
 * 代收代付：平台收入只认 1% 佣金，99% 挂应付款。
 */
import fs from 'fs'
import path from 'path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createTrainingPrepay, normalizeSignupFields, queryTrainingPay, refundTrainingDeposit, trainingDepositView, trainingWithdrawQuote, withdrawTraining } from '../src/lib/mpTrainingPay.js'

export const config = { maxDuration: 20 }

type SignupField = { key: string; label: string; kind: 'name' | 'idNo' | 'phone' | 'text' }
type Signup = { id: string; name: string; contact: string; at: string; orderId: string; answers?: Record<string, string> }
type Course = {
  id: string
  title: string
  hostName: string
  hostRole: string
  hostId: string
  mode: 'online' | 'offline'
  city: string
  whenText: string
  seats: number
  enrolled: number
  fee: string
  poster: string
  posterMp: string
  note: string
  signupFields: SignupField[]
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewNote: string
  createdAt: string
  signups: Signup[]
}
type Profile = {
  hostId: string
  kind: 'person' | 'entity'
  name: string
  idNo: string
  bank: string
  bankNo: string
  licenseNo: string
  city: string
  platforms: string
  skills: string
  years: string
  intro: string
  avatar: string
  idFront: string
  idBack: string
  licenseImage: string
  lecturerStatus: 'pending' | 'approved' | 'rejected' | 'none' | ''
  lecturerNote: string
  updatedAt: string
}
type Order = {
  id: string
  courseId: string
  title: string
  hostId: string
  name: string
  contact: string
  pay: number
  commission: number
  payable: number
  status: 'escrow' | 'review' | 'ready' | 'settled'
  evidence: string
  createdAt: string
  verifiedAt: string
  settleAt: string
}

type Store = {
  courses: Course[]
  profiles: Profile[]
  orders: Order[]
  payments: unknown[]
  deposits: unknown[]
  payouts: unknown[]
}

const FILE = path.join(process.cwd(), 'data', 'mp-training.json')

function emptyStore(): Store {
  return { courses: [], profiles: [], orders: [], payments: [], deposits: [], payouts: [] }
}

function readStore(): Store {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (Array.isArray(data)) return { courses: data, profiles: [], orders: [], payments: [], deposits: [], payouts: [] }
    return {
      courses: Array.isArray(data.courses) ? data.courses : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
      payments: Array.isArray(data.payments) ? data.payments : [],
      deposits: Array.isArray(data.deposits) ? data.deposits : [],
      payouts: Array.isArray(data.payouts) ? data.payouts : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: Store) {
  const latest = readStore()
  const next = { ...store, payments: latest.payments, deposits: latest.deposits, payouts: latest.payouts }
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(next), 'utf8')
}

function clipImage(raw: unknown) {
  const s = String(raw || '')
  if (!s.startsWith('data:image/')) return ''
  return s.slice(0, 280000)
}

function clipPoster(raw: unknown) {
  const s = String(raw || '')
  if (!s.startsWith('data:image/')) return ''
  return s.slice(0, 400000)
}

function rawImageBase64(dataUrl: string) {
  const s = String(dataUrl || '')
  const i = s.indexOf(',')
  const b64 = (i >= 0 ? s.slice(i + 1) : s).replace(/\s/g, '')
  if (b64.length < 80) throw new Error('请上传图片')
  if (b64.length > 5_500_000) throw new Error('图片过大，请换一张较小的照片')
  return b64
}

function pickText(node: unknown, keys: string[]): string {
  if (!node || typeof node !== 'object') return ''
  const bag = node as Record<string, unknown>
  for (const key of keys) {
    const v = bag[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(bag)) {
    const hit = pickText(v, keys)
    if (hit) return hit
  }
  return ''
}

async function volcOcr(action: string, b64: string) {
  const ak = String(process.env.MERCHANT_AI_VOLC_ACCESS_KEY || '').trim()
  const sk = String(process.env.MERCHANT_AI_VOLC_SECRET_KEY || '').trim()
  if (!ak || !sk) throw new Error('证件识别服务未配置')
  const { signVolcVisualFormPost } = await import('../vite-plugins/volcVisualSign.js')
  const body = `image_base64=${encodeURIComponent(b64)}&version=v3`
  const signed = signVolcVisualFormPost({
    accessKeyId: ak,
    secretAccessKey: sk,
    action,
    version: '2020-08-26',
    region: String(process.env.MERCHANT_AI_VOLC_REGION || 'cn-north-1'),
    body,
  })
  const res = await fetch(signed.url, { method: 'POST', headers: signed.headers, body: signed.body })
  const data = (await res.json()) as Record<string, unknown>
  const meta = data.ResponseMetadata as { Error?: { Message?: string } } | undefined
  const code = Number(data.code)
  if (!res.ok || (Number.isFinite(code) && code !== 10000)) {
    const raw = String(data.message || meta?.Error?.Message || `识别失败(${res.status})`)
    if (/access denied/i.test(raw)) {
      throw new Error('火山引擎账号未开通身份证识别和营业执照识别，当前密钥没有这项权限')
    }
    throw new Error(raw)
  }
  return data
}

async function ocrDoc(kind: string, imageDataUrl: string) {
  const b64 = rawImageBase64(imageDataUrl)
  const action = kind === 'license' ? 'BusinessLicense' : 'IDCard'
  const data = await volcOcr(action, b64)
  const name = pickText(data, ['name', 'company_name', 'enterprise_name', 'legal_person'])
  const idNo = pickText(data, ['id_number', 'id_card_number', 'id_num', 'num'])
  const licenseNo = pickText(data, ['credit_code', 'reg_num', 'social_credit_code', 'license_no'])
  const address = pickText(data, ['address', 'domicile'])
  const authority = pickText(data, ['issue_authority', 'authority'])
  const fields: Record<string, string> = {}
  if (name) fields.name = name
  if (idNo) fields.idNo = idNo
  if (licenseNo) fields.licenseNo = licenseNo
  if (address) fields.address = address
  if (authority) fields.authority = authority
  if (!Object.keys(fields).length) throw new Error('未识别到证件文字，请换一张更清晰的照片')
  return fields
}

function clipText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function publicCourse(course: Course) {
  return !course.reviewStatus || course.reviewStatus === 'approved'
}

function lecturerState(profile: Profile): 'none' | 'pending' | 'approved' | 'rejected' {
  if (profile.lecturerStatus === 'none') return 'none'
  if (profile.lecturerStatus === 'pending' || profile.lecturerStatus === 'approved' || profile.lecturerStatus === 'rejected') {
    return profile.lecturerStatus
  }
  if (profile.intro && profile.city) return 'approved'
  return 'none'
}

function lecturerCard(profile: Profile) {
  return {
    hostId: profile.hostId,
    city: profile.city,
    platforms: profile.platforms,
    skills: profile.skills,
    years: profile.years,
    intro: profile.intro,
    lecturerStatus: lecturerState(profile),
    lecturerNote: profile.lecturerNote || '',
    updatedAt: profile.updatedAt,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const store = readStore()
  if (req.method === 'GET') {
    const hostId = String(req.query.hostId || '')
    const review = String(req.query.review || '') === '1'
    const courses = (review ? store.courses : store.courses.filter(publicCourse)).map(({ signups, ...rest }) => ({
      ...rest,
      signupCount: (signups || []).length,
    }))
    const mine = hostId
      ? store.courses
          .filter((c) => c.hostId === hostId)
          .map(({ signups, ...rest }) => ({
            ...rest,
            signupCount: (signups || []).length,
          }))
      : []
    res.status(200).json({
      ok: true,
      courses,
      mine,
      profile: hostId ? store.profiles.find((p) => p.hostId === hostId) || null : null,
      profiles: review ? store.profiles.filter((p) => lecturerState(p) !== 'none').map(lecturerCard) : [],
      orders: hostId ? store.orders.filter((o) => o.hostId === hostId) : [],
      deposit: trainingDepositView(hostId),
      settlement: trainingWithdrawQuote(hostId),
    })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method' })
    return
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const action = String(body.action || 'create')

  if (action === 'ocrDoc') {
    try {
      const fields = await ocrDoc(String(body.kind || 'id_front'), String(body.imageDataUrl || ''))
      res.status(200).json({ ok: true, fields })
    } catch (e) {
      res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '识别失败' })
    }
    return
  }

  if (action === 'applyLecturer') {
    const hostId = String(body.hostId || '')
    const city = clipText(body.city, 240)
    const intro = clipText(body.intro, 400)
    if (!hostId) {
      res.status(400).json({ ok: false, error: '缺少身份' })
      return
    }
    if (!city || !intro) {
      res.status(400).json({ ok: false, error: '请填写常驻城市和讲师介绍' })
      return
    }
    if (!trainingDepositView(hostId).paid) {
      res.status(400).json({ ok: false, error: '请先缴纳保证金' })
      return
    }
    const prev = store.profiles.find((p) => p.hostId === hostId)
    const profile: Profile = {
      hostId,
      kind: prev?.kind === 'entity' ? 'entity' : 'person',
      name: prev?.name || '',
      idNo: prev?.idNo || '',
      bank: prev?.bank || '',
      bankNo: prev?.bankNo || '',
      licenseNo: prev?.licenseNo || '',
      city,
      platforms: clipText(body.platforms, 120),
      skills: clipText(body.skills, 120),
      years: clipText(body.years, 8),
      intro,
      avatar: clipImage(body.avatar) || prev?.avatar || '',
      idFront: prev?.idFront || '',
      idBack: prev?.idBack || '',
      licenseImage: prev?.licenseImage || '',
      lecturerStatus: 'pending',
      lecturerNote: '',
      updatedAt: new Date().toISOString(),
    }
    store.profiles = store.profiles.filter((p) => p.hostId !== hostId).concat(profile)
    writeStore(store)
    res.status(200).json({ ok: true, profile })
    return
  }

  if (action === 'reviewLecturer') {
    const hostId = String(body.hostId || '')
    const profile = store.profiles.find((p) => p.hostId === hostId)
    if (!profile || lecturerState(profile) === 'none') {
      res.status(404).json({ ok: false, error: '讲师申请不存在' })
      return
    }
    profile.lecturerStatus = body.status === 'rejected' ? 'rejected' : 'approved'
    profile.lecturerNote = clipText(body.note, 200)
    writeStore(store)
    res.status(200).json({ ok: true, profile: lecturerCard(profile) })
    return
  }

  if (action === 'saveProfile') {
    const hostId = String(body.hostId || '')
    if (!hostId) {
      res.status(400).json({ ok: false, error: '缺少身份' })
      return
    }
    const prev = store.profiles.find((p) => p.hostId === hostId)
    if (!prev || lecturerState(prev) !== 'approved') {
      res.status(400).json({ ok: false, error: '讲师申请通过后才能绑定收款账户' })
      return
    }
    const name = String(body.name || '').trim()
    const bankNo = String(body.bankNo || '').trim()
    const kind = body.kind === 'entity' ? 'entity' : 'person'
    const licenseNo = String(body.licenseNo || '').trim()
    if (!name || !bankNo) {
      res.status(400).json({ ok: false, error: '请填写户名和账号' })
      return
    }
    if (kind === 'entity' && !licenseNo) {
      res.status(400).json({ ok: false, error: '请填写统一社会信用代码' })
      return
    }
    const profile: Profile = {
      ...prev,
      kind,
      name,
      idNo: String(body.idNo || '').trim(),
      bank: String(body.bank || '').trim(),
      bankNo,
      licenseNo: kind === 'entity' ? licenseNo : '',
      idFront: clipImage(body.idFront) || prev.idFront || '',
      idBack: clipImage(body.idBack) || prev.idBack || '',
      licenseImage: clipImage(body.licenseImage) || prev.licenseImage || '',
      lecturerStatus: 'approved',
      lecturerNote: prev.lecturerNote || '',
      updatedAt: new Date().toISOString(),
    }
    store.profiles = store.profiles.filter((p) => p.hostId !== hostId).concat(profile)
    writeStore(store)
    res.status(200).json({ ok: true, profile })
    return
  }

  if (action === 'create') {
    const title = String(body.title || '').trim()
    const poster = clipPoster(body.poster)
    const posterMp = clipPoster(body.posterMp)
    if (!title) {
      res.status(400).json({ ok: false, error: '请填写课程名称' })
      return
    }
    if (!poster) {
      res.status(400).json({ ok: false, error: '请上传星选平台宣传图' })
      return
    }
    if (!posterMp) {
      res.status(400).json({ ok: false, error: '请上传小程序宣传图' })
      return
    }
    const hostId = String(body.hostId || '')
    if (hostId) {
      const profile = store.profiles.find((p) => p.hostId === hostId)
      if (!profile || lecturerState(profile) !== 'approved') {
        res.status(400).json({ ok: false, error: '请先申请讲师并通过审核' })
        return
      }
      if (!trainingDepositView(hostId).paid) {
        res.status(400).json({ ok: false, error: '请先缴纳保证金' })
        return
      }
    }
    const course: Course = {
      id: `tr-${Date.now()}`,
      title,
      hostName: String(body.hostName || '达人').trim() || '达人',
      hostRole: String(body.hostRole || 'talent'),
      hostId: String(body.hostId || ''),
      mode: body.mode === 'offline' ? 'offline' : 'online',
      city: String(body.city || '').trim(),
      whenText: String(body.whenText || '').trim(),
      seats: Math.max(1, Number(body.seats) || 1),
      enrolled: 0,
      fee: String(body.fee || '').trim(),
      poster,
      posterMp,
      note: String(body.note || '').trim(),
      signupFields: normalizeSignupFields(body.signupFields),
      reviewStatus: 'pending',
      reviewNote: '',
      createdAt: new Date().toISOString(),
      signups: [],
    }
    store.courses.unshift(course)
    writeStore(store)
    res.status(200).json({ ok: true, course })
    return
  }

  if (action === 'update') {
    const hostId = String(body.hostId || '')
    const course = store.courses.find((c) => c.id === String(body.id || '') && c.hostId === hostId)
    if (!course) {
      res.status(404).json({ ok: false, error: '课程不存在' })
      return
    }
    const profile = store.profiles.find((p) => p.hostId === hostId)
    if (!profile || lecturerState(profile) !== 'approved') {
      res.status(400).json({ ok: false, error: '请先申请讲师并通过审核' })
      return
    }
    const title = String(body.title || '').trim()
    if (!title) {
      res.status(400).json({ ok: false, error: '请填写课程名称' })
      return
    }
    const poster = clipPoster(body.poster)
    const posterMp = clipPoster(body.posterMp)
    const taken = (course.signups || []).length
    course.title = title
    course.mode = body.mode === 'offline' ? 'offline' : 'online'
    course.city = String(body.city || '').trim()
    course.whenText = String(body.whenText || '').trim()
    course.seats = Math.max(taken, Math.max(1, Number(body.seats) || 1))
    course.fee = String(body.fee || '').trim()
    course.note = String(body.note || '').trim()
    course.signupFields = normalizeSignupFields(body.signupFields)
    if (poster) course.poster = poster
    if (posterMp) course.posterMp = posterMp
    course.reviewStatus = 'pending'
    course.reviewNote = ''
    writeStore(store)
    const { signups, ...rest } = course
    res.status(200).json({ ok: true, course: { ...rest, signupCount: (signups || []).length } })
    return
  }

  if (action === 'prepay') {
    try {
      const result = await createTrainingPrepay(body)
      res.status(result.ok ? 200 : 400).json(result)
    } catch (e) {
      res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '支付下单失败' })
    }
    return
  }

  if (action === 'payQuery') {
    try {
      const result = await queryTrainingPay(String(body.outTradeNo || ''))
      res.status(result.ok ? 200 : 404).json(result)
    } catch (e) {
      res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '支付查询失败' })
    }
    return
  }

  if (action === 'refundDeposit') {
    try {
      const result = await refundTrainingDeposit(String(body.hostId || ''))
      res.status(result.ok ? 200 : 400).json(result)
    } catch (e) {
      res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '退款失败' })
    }
    return
  }

  if (action === 'withdraw') {
    try {
      const result = withdrawTraining(String(body.hostId || ''))
      res.status(result.ok ? 200 : 400).json(result)
    } catch (e) {
      res.status(400).json({ ok: false, error: e instanceof Error ? e.message : '提现失败' })
    }
    return
  }

  if (action === 'signup') {
    res.status(400).json({ ok: false, error: '请先完成支付后再报名' })
    return
  }

  if (action === 'review') {
    const course = store.courses.find((c) => c.id === String(body.id || ''))
    if (!course) {
      res.status(404).json({ ok: false, error: '课程不存在' })
      return
    }
    const status = body.status === 'rejected' ? 'rejected' : 'approved'
    course.reviewStatus = status
    course.reviewNote = clipText(body.note, 200)
    writeStore(store)
    res.status(200).json({ ok: true, course: { id: course.id, reviewStatus: course.reviewStatus } })
    return
  }

  if (action === 'verify') {
    const order = store.orders.find((o) => o.id === String(body.orderId || ''))
    if (!order || (order.status !== 'escrow' && order.status !== 'review')) {
      res.status(400).json({ ok: false, error: '订单不在托管中' })
      return
    }
    order.evidence = String(body.evidence || '').trim()
    order.status = 'ready'
    order.verifiedAt = new Date().toISOString()
    const due = new Date()
    due.setDate(due.getDate() + 1)
    order.settleAt = due.toISOString()
    writeStore(store)
    res.status(200).json({ ok: true, order })
    return
  }

  if (action === 'pass') {
    const order = store.orders.find((o) => o.id === String(body.orderId || ''))
    if (!order || order.status !== 'review') {
      res.status(400).json({ ok: false, error: '订单不在核实中' })
      return
    }
    order.status = 'ready'
    const t = new Date()
    t.setDate(t.getDate() + 1)
    order.settleAt = t.toISOString()
    writeStore(store)
    res.status(200).json({ ok: true, order })
    return
  }

  res.status(400).json({ ok: false, error: 'unknown action' })
}

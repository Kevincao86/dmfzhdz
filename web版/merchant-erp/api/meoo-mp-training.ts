/**
 * GET/POST /api/meoo-mp-training
 * 代收代付：平台收入只认 1% 佣金，99% 挂应付款。
 */
import fs from 'fs'
import path from 'path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 20 }

type Signup = { id: string; name: string; contact: string; at: string; orderId: string }
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
  note: string
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
  idFront: string
  idBack: string
  licenseImage: string
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

type Store = { courses: Course[]; profiles: Profile[]; orders: Order[] }

const FILE = path.join(process.cwd(), 'data', 'mp-training.json')

function emptyStore(): Store {
  return { courses: [], profiles: [], orders: [] }
}

function readStore(): Store {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (Array.isArray(data)) return { courses: data, profiles: [], orders: [] }
    return {
      courses: Array.isArray(data.courses) ? data.courses : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      orders: Array.isArray(data.orders) ? data.orders : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(store), 'utf8')
}

function clipImage(raw: unknown) {
  const s = String(raw || '')
  if (!s.startsWith('data:image/')) return ''
  return s.slice(0, 280000)
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

function splitFee(fee: number) {
  const pay = Math.round(fee * 100) / 100
  const commission = Math.round(pay * 0.01 * 100) / 100
  const payable = Math.round((pay - commission) * 100) / 100
  return { pay, commission, payable }
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
    res.status(200).json({
      ok: true,
      courses,
      profile: hostId ? store.profiles.find((p) => p.hostId === hostId) || null : null,
      orders: hostId ? store.orders.filter((o) => o.hostId === hostId) : [],
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

  if (action === 'saveProfile') {
    const hostId = String(body.hostId || '')
    if (!hostId) {
      res.status(400).json({ ok: false, error: '缺少身份' })
      return
    }
    const profile: Profile = {
      hostId,
      kind: body.kind === 'entity' ? 'entity' : 'person',
      name: String(body.name || '').trim(),
      idNo: String(body.idNo || '').trim(),
      bank: String(body.bank || '').trim(),
      bankNo: String(body.bankNo || '').trim(),
      licenseNo: String(body.licenseNo || '').trim(),
      city: clipText(body.city, 40),
      platforms: clipText(body.platforms, 80),
      skills: clipText(body.skills, 120),
      years: clipText(body.years, 8),
      intro: clipText(body.intro, 400),
      idFront: clipImage(body.idFront),
      idBack: clipImage(body.idBack),
      licenseImage: clipImage(body.licenseImage),
      updatedAt: new Date().toISOString(),
    }
    store.profiles = store.profiles.filter((p) => p.hostId !== hostId).concat(profile)
    writeStore(store)
    res.status(200).json({ ok: true, profile })
    return
  }

  if (action === 'create') {
    const title = String(body.title || '').trim()
    const poster = String(body.poster || '')
    if (!title) {
      res.status(400).json({ ok: false, error: '请填写课程名称' })
      return
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
      poster: poster.startsWith('data:image/') ? poster.slice(0, 400000) : '',
      note: String(body.note || '').trim(),
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

  if (action === 'signup') {
    const course = store.courses.find((c) => c.id === String(body.id || ''))
    if (!course) {
      res.status(404).json({ ok: false, error: '课程不存在' })
      return
    }
    const name = String(body.name || '').trim()
    if (!name) {
      res.status(400).json({ ok: false, error: '请填写姓名' })
      return
    }
    if (!publicCourse(course)) {
      res.status(400).json({ ok: false, error: '课程还在审核中' })
      return
    }
    if ((course.signups || []).length >= course.seats) {
      res.status(400).json({ ok: false, error: '名额已满' })
      return
    }
    const parts = splitFee(Number(course.fee) || 0)
    const order: Order = {
      id: `od-${Date.now()}`,
      courseId: course.id,
      title: course.title,
      hostId: course.hostId,
      name,
      contact: String(body.contact || '').trim(),
      ...parts,
      status: 'escrow',
      evidence: '',
      createdAt: new Date().toISOString(),
      verifiedAt: '',
      settleAt: '',
    }
    course.signups = course.signups || []
    course.signups.push({ id: `su-${Date.now()}`, name, contact: order.contact, at: order.createdAt, orderId: order.id })
    course.enrolled = course.signups.length
    store.orders.unshift(order)
    writeStore(store)
    res.status(200).json({ ok: true, order })
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
    if (!order || order.status !== 'escrow') {
      res.status(400).json({ ok: false, error: '订单不在托管中' })
      return
    }
    order.evidence = String(body.evidence || '').trim()
    order.status = 'review'
    order.verifiedAt = new Date().toISOString()
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

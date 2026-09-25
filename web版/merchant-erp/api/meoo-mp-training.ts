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

async function ocrDoc(kind: string, imageDataUrl: string) {
  const image = clipImage(imageDataUrl)
  if (!image) throw new Error('请上传图片')
  const { routeAiChat } = await import('../vite-plugins/aiGateway/chatRouter.js')
  const env = process.env as Record<string, string>
  const provider = (env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim()
  const ask =
    kind === 'license'
      ? '这是营业执照。只输出 JSON：{"name":"企业名称","licenseNo":"统一社会信用代码","legalPerson":"法定代表人"}。看不清的字段留空字符串。'
      : kind === 'id_back'
        ? '这是身份证国徽面。只输出 JSON：{"authority":"签发机关","validFrom":"","validTo":""}。看不清的字段留空字符串。'
        : '这是身份证人像面。只输出 JSON：{"name":"姓名","idNo":"公民身份号码","address":""}。看不清的字段留空字符串。'
  const res = await routeAiChat(
    {
      provider: provider as 'doubao',
      temperature: 0,
      imageDataUrls: [image],
      messages: [
        { role: 'system', content: '你只做证件文字识别，不判断真伪。只输出 JSON，不要其它文字。' },
        { role: 'user', content: ask },
      ],
    },
    env,
  )
  const text = String(res.content || '')
  const m = text.match(/\{[\s\S]*\}/)
  let fields: Record<string, string> = {}
  try {
    const parsed = JSON.parse(m ? m[0] : '{}') as Record<string, unknown>
    for (const [k, v] of Object.entries(parsed)) fields[k] = String(v || '').trim()
  } catch {
    fields = {}
  }
  return fields
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
    res.status(200).json({
      ok: true,
      courses: store.courses.map(({ signups, ...rest }) => ({
        ...rest,
        signupCount: (signups || []).length,
      })),
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
      poster: String(body.poster || '').slice(0, 400000),
      note: String(body.note || '').trim(),
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

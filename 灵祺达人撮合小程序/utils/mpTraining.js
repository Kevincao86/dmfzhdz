const ecs = require('./ecs.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpMembershipUi = require('./mpMembershipUi.js')

const DEPOSIT_KEY = 'meoo_train_deposit_v1'
const LOCAL_KEY = 'meoo_train_courses_v1'
const PROFILE_KEY = 'meoo_train_profile_v1'
const ORDER_KEY = 'meoo_train_orders_v1'
const ADVANCED = new Set(['pro', 'flagship', 'enterprise'])
const DEPOSIT_YUAN = 500

function accountId() {
  const acct = auth.readAccount() || {}
  return String(acct.accountId || acct.id || acct.userId || acct.phone || acct.loginName || 'local')
}

function readDepositMap() {
  try {
    return wx.getStorageSync(DEPOSIT_KEY) || {}
  } catch (_) {
    return {}
  }
}

function applyDeposit(deposit) {
  const map = readDepositMap()
  const id = accountId()
  if (deposit && deposit.paid) {
    map[id] = { yuan: DEPOSIT_YUAN, at: deposit.paidAt || Date.now(), server: true, channel: deposit.channel || 'wechat' }
  } else {
    delete map[id]
  }
  wx.setStorageSync(DEPOSIT_KEY, map)
}

function depositPaid() {
  const row = readDepositMap()[accountId()]
  return !!(row && row.server)
}

async function syncDeposit() {
  if (!(ecs.hasBase && ecs.hasBase())) return depositPaid()
  const res = await ecs.get(`/api/meoo-mp-training?hostId=${encodeURIComponent(accountId())}`)
  if (res && res.deposit) applyDeposit(res.deposit)
  return depositPaid()
}

async function prepay(input) {
  if (!(ecs.hasBase && ecs.hasBase())) throw new Error('请先登录后再支付')
  const openid = require('./mpWechatOpenId.js').resolveOpenIdFromLocal()
  const res = await ecs.post('/api/meoo-mp-training', {
    action: 'prepay',
    purpose: input && input.purpose === 'course' ? 'course' : 'deposit',
    channel: 'wechat',
    scene: 'jsapi',
    hostId: accountId(),
    courseId: input && input.courseId ? input.courseId : '',
    name: input && input.name ? input.name : '',
    contact: input && input.contact ? input.contact : '',
    answers: input && input.answers ? input.answers : {},
    openid,
  })
  if (!res || res.ok === false) throw new Error((res && res.error) || '支付下单失败')
  return res
}

async function walletSummary() {
  if (!(ecs.hasBase && ecs.hasBase())) return { depositPaid: depositPaid(), settlement: null }
  const res = await ecs.get(`/api/meoo-mp-training?hostId=${encodeURIComponent(accountId())}`)
  if (res && res.deposit) applyDeposit(res.deposit)
  return { depositPaid: depositPaid(), settlement: (res && res.settlement) || null }
}

async function refundDeposit() {
  if (!(ecs.hasBase && ecs.hasBase())) throw new Error('请先登录后再退款')
  const res = await ecs.post('/api/meoo-mp-training', { action: 'refundDeposit', hostId: accountId() })
  if (!res || res.ok === false) throw new Error((res && res.error) || '退款失败')
  applyDeposit({ paid: false })
  const profile = readProfile()
  if (profile) writeProfile({ ...profile, lecturerStatus: 'none' })
  return res
}

async function withdrawSettlement() {
  if (!(ecs.hasBase && ecs.hasBase())) throw new Error('请先登录后再提现')
  const res = await ecs.post('/api/meoo-mp-training', { action: 'withdraw', hostId: accountId() })
  if (!res || res.ok === false) throw new Error((res && res.error) || '提现失败')
  return res
}

async function payQuery(outTradeNo) {
  if (!(ecs.hasBase && ecs.hasBase())) throw new Error('请先登录后再查询支付')
  const res = await ecs.post('/api/meoo-mp-training', { action: 'payQuery', outTradeNo })
  if (res && res.deposit) applyDeposit(res.deposit)
  if (!res || res.ok === false) throw new Error((res && res.error) || '支付查询失败')
  return res
}

function planId() {
  const identity = userProfile.readIdentity()
  const acct = auth.readAccount()
  const pr = identity === 'pr' && userProfile.readPrProfile ? userProfile.readPrProfile() : null
  return mpMembershipUi.readMembershipPlanId(acct, identity, null, pr)
}

function isAdvancedMember() {
  return ADVANCED.has(String(planId() || 'basic'))
}

function publishBlockReason() {
  const identity = userProfile.readIdentity()
  if (identity !== 'pr' && identity !== 'talent' && identity !== 'shoot' && identity !== 'edit') {
    return '请先选择达人或 PR 身份'
  }
  if (!isAdvancedMember()) return '发布培训需开通高级会员（专业版及以上）'
  const profile = readProfile()
  const state = lecturerState(profile)
  if (state === 'none') return profile && profile.lecturerStatus === 'none' ? '讲师未认证，不能发布课程' : '请先申请讲师'
  if (state === 'pending') return '讲师申请审核中，通过后才能发布'
  if (state === 'rejected') return '讲师申请未通过，请修改后重新提交'
  if (!depositPaid()) return '发布培训需缴纳保证金'
  return ''
}

function readLocal() {
  try {
    const list = wx.getStorageSync(LOCAL_KEY)
    return Array.isArray(list) ? list : []
  } catch (_) {
    return []
  }
}

function writeLocal(list) {
  wx.setStorageSync(LOCAL_KEY, list)
}

async function listCourses() {
  if (ecs.hasBase && ecs.hasBase()) {
    try {
      const res = await ecs.get('/api/meoo-mp-training')
      const courses = res && (res.courses || (res.data && res.data.courses))
      if (Array.isArray(courses)) {
        writeLocal(courses)
        return courses
      }
    } catch (_) {}
  }
  return readLocal()
}

async function createCourse(input) {
  const reason = publishBlockReason()
  if (reason) throw new Error(reason)
  const identity = userProfile.readIdentity()
  const acct = auth.readAccount() || {}
  const payload = {
    action: 'create',
    title: input.title,
    hostName: input.hostName || acct.nickname || acct.name || '达人',
    hostRole: identity,
    hostId: accountId(),
    mode: input.mode === 'offline' ? 'offline' : 'online',
    city: input.city || '',
    whenText: input.whenText || '',
    seats: Number(input.seats) || 1,
    fee: input.fee || '',
    poster: input.poster || '',
    note: input.note || '',
    signupFields: input.signupFields || [],
  }
  if (ecs.hasBase && ecs.hasBase()) {
    const res = await ecs.post('/api/meoo-mp-training', payload)
    const course = (res && res.course) || (res && res.data && res.data.course)
    if (course) return course
    if (res && res.error) throw new Error(String(res.error))
  }
  const course = {
    id: `tr-${Date.now()}`,
    ...payload,
    enrolled: 0,
    signupCount: 0,
    createdAt: new Date().toISOString(),
  }
  writeLocal([course].concat(readLocal()))
  return course
}

async function listMine() {
  const hostId = accountId()
  if (ecs.hasBase && ecs.hasBase()) {
    try {
      const res = await ecs.get(`/api/meoo-mp-training?hostId=${encodeURIComponent(hostId)}`)
      if (res && Array.isArray(res.mine)) return res.mine
    } catch (_) {}
  }
  return readLocal().filter((c) => !c.hostId || c.hostId === hostId)
}

async function updateCourse(input) {
  const reason = publishBlockReason()
  if (reason) throw new Error(reason)
  const id = String(input.id || '')
  if (!id) throw new Error('课程不存在')
  const identity = userProfile.readIdentity()
  const payload = {
    action: 'update',
    id,
    title: input.title,
    hostId: accountId(),
    hostRole: identity,
    mode: input.mode === 'offline' ? 'offline' : 'online',
    city: input.city || '',
    whenText: input.whenText || '',
    seats: Number(input.seats) || 1,
    fee: input.fee || '',
    poster: input.poster || '',
    note: input.note || '',
    signupFields: input.signupFields || [],
  }
  if (ecs.hasBase && ecs.hasBase()) {
    const res = await ecs.post('/api/meoo-mp-training', payload)
    const course = (res && res.course) || (res && res.data && res.data.course)
    if (course) return course
    if (res && res.error) throw new Error(String(res.error))
  }
  const list = readLocal()
  const course = list.find((c) => c.id === id)
  if (!course) throw new Error('课程不存在')
  Object.assign(course, payload, { reviewStatus: 'pending', reviewNote: '' })
  writeLocal(list)
  return course
}

function readProfile() {
  try {
    const map = wx.getStorageSync(PROFILE_KEY) || {}
    return map[accountId()] || null
  } catch (_) {
    return null
  }
}

function writeProfile(profile) {
  const map = wx.getStorageSync(PROFILE_KEY) || {}
  map[accountId()] = profile
  wx.setStorageSync(PROFILE_KEY, map)
}

function lecturerState(profile) {
  if (!profile) return 'none'
  if (profile.lecturerStatus === 'none') return 'none'
  if (profile.lecturerStatus === 'pending' || profile.lecturerStatus === 'approved' || profile.lecturerStatus === 'rejected') {
    return profile.lecturerStatus
  }
  if (profile.intro && profile.city) return 'approved'
  return 'none'
}

async function syncProfile() {
  if (!(ecs.hasBase && ecs.hasBase())) return readProfile()
  try {
    const res = await ecs.get(`/api/meoo-mp-training?hostId=${encodeURIComponent(accountId())}`)
    if (res && res.profile) {
      writeProfile(res.profile)
      return res.profile
    }
  } catch (_) {}
  return readProfile()
}

async function applyLecturer(input) {
  const prev = readProfile() || {}
  const profile = {
    ...prev,
    hostId: accountId(),
    city: String(input.city || '').trim(),
    platforms: String(input.platforms || '').trim(),
    skills: String(input.skills || '').trim(),
    years: String(input.years || '').trim(),
    intro: String(input.intro || '').trim(),
    avatar: String(input.avatar || prev.avatar || ''),
    lecturerStatus: 'pending',
    updatedAt: new Date().toISOString(),
  }
  if (!profile.city || !profile.intro) throw new Error('请填写常驻城市和讲师介绍')
  if (ecs.hasBase && ecs.hasBase()) {
    const res = await ecs.post('/api/meoo-mp-training', {
      action: 'applyLecturer',
      hostId: profile.hostId,
      city: profile.city,
      platforms: profile.platforms,
      skills: profile.skills,
      years: profile.years,
      intro: profile.intro,
      avatar: profile.avatar || '',
    })
    const saved = (res && res.profile) || profile
    writeProfile(saved)
    return saved
  }
  writeProfile(profile)
  return profile
}

function readOrders() {
  try {
    const list = wx.getStorageSync(ORDER_KEY)
    return Array.isArray(list) ? list : []
  } catch (_) {
    return []
  }
}

function writeOrders(list) {
  wx.setStorageSync(ORDER_KEY, list)
}

function splitFee(fee) {
  const pay = Math.round((Number(fee) || 0) * 100) / 100
  const commission = Math.round(pay * 1) / 100
  const payable = Math.round((pay - commission) * 100) / 100
  return { pay, commission, payable }
}

function laborTax(monthPayable) {
  const income = Number(monthPayable) || 0
  if (income <= 800) return 0
  const taxable = income <= 4000 ? income - 800 : income * 0.8
  let tax = taxable * 0.2
  if (taxable > 50000) tax = taxable * 0.4 - 7000
  else if (taxable > 20000) tax = taxable * 0.3 - 2000
  return Math.max(0, Math.round(tax * 100) / 100)
}

async function recognizeDoc(kind, imageDataUrl) {
  if (!ecs.hasBase || !ecs.hasBase()) throw new Error('识别服务未连接')
  const res = await ecs.post('/api/meoo-mp-training', {
    action: 'ocrDoc',
    kind,
    imageDataUrl,
  })
  if (!res || res.ok === false) throw new Error((res && res.error) || '识别失败')
  return res.fields || {}
}

async function saveProfile(input) {
  const prev = readProfile() || {}
  if (lecturerState(prev) !== 'approved') throw new Error('讲师申请通过后才能绑定收款账户')
  const profile = {
    ...prev,
    hostId: accountId(),
    kind: input.kind === 'entity' ? 'entity' : 'person',
    name: String(input.name || '').trim(),
    idNo: String(input.idNo || '').trim(),
    bank: String(input.bank || '').trim(),
    bankNo: String(input.bankNo || '').trim(),
    licenseNo: String(input.licenseNo || '').trim(),
    idFront: String(input.idFront || prev.idFront || ''),
    idBack: String(input.idBack || prev.idBack || ''),
    licenseImage: String(input.licenseImage || prev.licenseImage || ''),
    lecturerStatus: 'approved',
    updatedAt: new Date().toISOString(),
  }
  if (!profile.name || !profile.bankNo) throw new Error('请填写户名和账号')
  if (profile.kind === 'entity' && !profile.licenseNo) throw new Error('请填写统一社会信用代码')
  if (ecs.hasBase && ecs.hasBase()) {
    const res = await ecs.post('/api/meoo-mp-training', { action: 'saveProfile', ...profile })
    const saved = (res && res.profile) || profile
    writeProfile(saved)
    return saved
  }
  writeProfile(profile)
  return profile
}

async function myOrders() {
  const hostId = accountId()
  if (ecs.hasBase && ecs.hasBase()) {
    try {
      const res = await ecs.get(`/api/meoo-mp-training?hostId=${encodeURIComponent(hostId)}`)
      if (res && Array.isArray(res.orders)) {
        writeOrders(res.orders)
        if (res.profile) writeProfile(res.profile)
        return res.orders
      }
    } catch (_) {}
  }
  return readOrders().filter((o) => o.hostId === hostId)
}

async function signup() {
  throw new Error('请先完成微信支付后再报名')
}

async function markReview(orderId, evidence) {
  if (ecs.hasBase && ecs.hasBase()) {
    try {
      const res = await ecs.post('/api/meoo-mp-training', { action: 'verify', orderId, evidence })
      if (res && res.order) return res.order
    } catch (_) {}
  }
  const list = readOrders()
  const order = list.find((o) => o.id === orderId)
  if (!order) throw new Error('订单不存在')
  order.status = 'ready'
  order.evidence = evidence || ''
  order.verifiedAt = new Date().toISOString()
  const due = new Date()
  due.setDate(due.getDate() + 1)
  order.settleAt = due.toISOString()
  writeOrders(list)
  return order
}

async function markReady(orderId) {
  if (ecs.hasBase && ecs.hasBase()) {
    try {
      const res = await ecs.post('/api/meoo-mp-training', { action: 'pass', orderId })
      if (res && res.order) return res.order
    } catch (_) {}
  }
  const list = readOrders()
  const order = list.find((o) => o.id === orderId)
  if (!order) throw new Error('订单不存在')
  order.status = 'ready'
  const t = new Date()
  t.setDate(t.getDate() + 1)
  order.settleAt = t.toISOString()
  writeOrders(list)
  return order
}

module.exports = {
  DEPOSIT_YUAN,
  depositPaid,
  syncDeposit,
  walletSummary,
  refundDeposit,
  withdrawSettlement,
  prepay,
  payQuery,
  isAdvancedMember,
  publishBlockReason,
  planId,
  listCourses,
  listMine,
  createCourse,
  updateCourse,
  signup,
  readProfile,
  lecturerState,
  syncProfile,
  applyLecturer,
  recognizeDoc,
  saveProfile,
  myOrders,
  splitFee,
  laborTax,
  markReview,
  markReady,
}

const ecs = require('./ecs.js')
const auth = require('./auth.js')

function sessionHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
}

function phoneFromAccount(account) {
  if (!account) return ''
  return (
    normalizePhone(account.login_name) ||
    normalizePhone(account.phone) ||
    normalizePhone(account.mobile) ||
    ''
  )
}

function statusLabel(status) {
  const map = {
    pending: '待审核',
    active: '已通过',
    rejected: '未通过',
    disabled: '已停用',
  }
  return map[status] || status
}

function applyErrorLabel(error) {
  switch (String(error || '')) {
    case 'already_active':
      return '您已是推广员，请前往「我的推广」查看推广码与数据'
    case 'phone_taken':
      return '该手机号已被其他账号用于推广员申请，请使用注册手机号或联系运营'
    case 'distribution_disabled':
      return '推广员申请暂未开放，请稍后再试'
    case 'invalid_fields':
      return '请填写真实姓名与有效大陆手机号'
    case 'invalid_phone':
      return '请输入有效大陆手机号'
    case 'unauthorized':
      return '请先登录后再申请'
    default:
      return error || '操作失败，请稍后重试'
  }
}

async function applyAffiliate({ realName, phone, note }) {
  const p = normalizePhone(phone)
  if (!p) throw new Error('请输入有效大陆手机号')
  const name = String(realName || '').trim()
  if (!name) throw new Error('请填写真实姓名')
  const body = { realName: name, phone: p, applySource: 'mp' }
  if (note) body.note = String(note).trim()
  const data = await ecs.post('/api/meoo-distribution-affiliate-apply', body, sessionHeaders())
  if (!data || data.ok === false) {
    const err = new Error(applyErrorLabel((data && data.error) || 'submit_failed'))
    if (data && data.affiliate) err.affiliate = data.affiliate
    err.code = data && data.error
    throw err
  }
  return data
}

/** 登录态：按当前小程序账号查询申请记录（与网页版一致） */
async function fetchMyStatus() {
  if (!auth.readSessionToken()) return null
  const data = await ecs.get('/api/meoo-distribution-affiliate-apply', sessionHeaders())
  if (!data || data.ok === false) {
    throw new Error(applyErrorLabel((data && data.error) || 'query_failed'))
  }
  return data.affiliate || null
}

async function fetchStatus(phone) {
  if (auth.readSessionToken()) {
    try {
      return await fetchMyStatus()
    } catch (_) {
      /* fallback phone query */
    }
  }
  const p = normalizePhone(phone)
  if (!p) throw new Error('请输入有效大陆手机号')
  const data = await ecs.get(`/api/meoo-distribution-affiliate-apply?phone=${encodeURIComponent(p)}`)
  if (!data || data.ok === false) throw new Error(applyErrorLabel((data && data.error) || 'query_failed'))
  return data.affiliate || null
}

module.exports = {
  normalizePhone,
  phoneFromAccount,
  statusLabel,
  applyErrorLabel,
  applyAffiliate,
  fetchMyStatus,
  fetchStatus,
}

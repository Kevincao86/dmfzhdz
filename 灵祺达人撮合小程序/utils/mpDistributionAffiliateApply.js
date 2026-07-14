const ecs = require('./ecs.js')

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
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

async function applyAffiliate({ realName, phone, note }) {
  const p = normalizePhone(phone)
  if (!p) throw new Error('请输入有效大陆手机号')
  const name = String(realName || '').trim()
  if (!name) throw new Error('请填写真实姓名')
  const body = { realName: name, phone: p, applySource: 'mp' }
  if (note) body.note = String(note).trim()
  const data = await ecs.post('/api/meoo-distribution-affiliate-apply', body)
  if (!data || data.ok === false) {
    const err = new Error(String((data && data.error) || 'submit_failed'))
    if (data && data.affiliate) err.affiliate = data.affiliate
    throw err
  }
  return data
}

async function fetchStatus(phone) {
  const p = normalizePhone(phone)
  if (!p) throw new Error('请输入有效大陆手机号')
  const data = await ecs.get(`/api/meoo-distribution-affiliate-apply?phone=${encodeURIComponent(p)}`)
  if (!data || data.ok === false) throw new Error(String((data && data.error) || 'query_failed'))
  return data.affiliate || null
}

module.exports = {
  normalizePhone,
  statusLabel,
  applyAffiliate,
  fetchStatus,
}

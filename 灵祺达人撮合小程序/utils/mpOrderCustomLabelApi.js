const api = require('./api.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpApiErrors = require('./mpApiErrors.js')

const PATH = '/api/meoo-ops-mp-order-custom-label'

const LABEL_PRESETS = [
  { text: '重点', color: 'red' },
  { text: '加急', color: 'orange' },
  { text: '待沟通', color: 'violet' },
  { text: '需改期', color: 'pink' },
  { text: '高佣金', color: 'emerald' },
  { text: '同城', color: 'blue' },
  { text: '远程', color: 'slate' },
  { text: '已完成', color: 'slate' },
]

async function call(body) {
  if (!api.hasApi()) throw new Error('网络未配置')
  if (!auth.isLoggedIn()) throw new Error('请先登录后再设置标签')
  const res = await api.post(PATH, body, auth.authHeaders())
  if (!res || res.ok === false) {
    const code = String((res && res.error) || '').trim()
    if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
      throw new Error('登录已过期，请重新登录')
    }
    if (code === 'order_label_db_error') {
      throw new Error('标签功能尚未开通，请联系管理员')
    }
    const detail = String((res && (res.message || res.detail || res.hint || res.error)) || '').trim()
    throw new Error(mpApiErrors.formatMpApiErr(new Error(code), detail))
  }
  return res
}

function readIdentity() {
  return userProfile.readIdentity() || 'talent'
}

function listLabels() {
  return call({ action: 'list', identity: readIdentity() }).then((res) => (res && res.labels) || [])
}

function upsertLabel(input) {
  return call({
    action: 'upsert',
    identity: readIdentity(),
    mpOrderId: input.mpOrderId,
    labelText: input.labelText,
    color: input.color,
  })
}

function deleteLabel(mpOrderId) {
  return call({ action: 'delete', identity: readIdentity(), mpOrderId })
}

module.exports = {
  LABEL_PRESETS,
  listLabels,
  upsertLabel,
  deleteLabel,
}

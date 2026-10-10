const api = require('./api.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpApiErrors = require('./mpApiErrors.js')

const PATH = '/api/meoo-ops-mp-calendar-custom-event'

async function call(body) {
  if (!api.hasApi()) throw new Error('网络未配置')
  if (!auth.isLoggedIn()) throw new Error('请先登录后再登记事件')
  const res = await api.post(PATH, body, auth.authHeaders())
  if (!res || res.ok === false) {
    const code = String((res && res.error) || '').trim()
    if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
      throw new Error('登录已过期，请重新登录')
    }
    if (code === 'calendar_custom_event_db_error') {
      throw new Error('自定义日程还没开通，请联系客服')
    }
    if (code === 'missing_title') throw new Error('请填写事件标题')
    if (code === 'invalid_event_date') throw new Error('请选择有效日期')
    if (code === 'invalid_time_label') throw new Error('时间格式应为 HH:mm')
    const detail = String((res && (res.message || res.detail || res.hint || res.error)) || '').trim()
    throw new Error(mpApiErrors.formatMpApiErr(new Error(code), detail))
  }
  return res
}

function readIdentity() {
  return userProfile.readIdentity() || 'talent'
}

function listEvents() {
  return call({ action: 'list', identity: readIdentity() }).then((res) => (res && res.events) || [])
}

function saveEvent(input) {
  const id = String((input && input.id) || '').trim()
  return call({
    action: id ? 'update' : 'create',
    identity: readIdentity(),
    ...(id ? { id } : {}),
    title: input.title,
    eventDateKey: input.eventDateKey,
    timeLabel: input.timeLabel || '',
    note: input.note || '',
  })
}

function deleteEvent(id) {
  return call({ action: 'delete', identity: readIdentity(), id })
}

module.exports = {
  listEvents,
  saveEvent,
  deleteEvent,
}

const api = require('./api.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const mpApiErrors = require('./mpApiErrors.js')

const PATH = '/api/meoo-ops-mp-calendar-reminder'

async function call(body) {
  if (!api.hasApi()) throw new Error('网络未配置')
  if (!auth.isLoggedIn()) throw new Error('请先登录后再设置提醒')
  const res = await api.post(PATH, body, auth.authHeaders())
  if (!res || res.ok === false) {
    const code = String((res && res.error) || '').trim()
    if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
      throw new Error('登录已过期，请重新登录')
    }
    if (code === 'reminder_exists') {
      throw new Error((res && res.message) || '该提醒已设置')
    }
    if (code === 'remind_at_past') {
      throw new Error('提醒时间已过，请选择更早的提醒')
    }
    if (code === 'calendar_reminder_table_missing') {
      throw new Error('日历提醒功能尚未开通，请联系管理员')
    }
    const detail = String((res && (res.message || res.detail || res.hint || res.error)) || '').trim()
    throw new Error(mpApiErrors.formatMpApiErr(new Error(code), detail))
  }
  return res
}

function readIdentity() {
  return userProfile.readIdentity() || 'talent'
}

function createReminder(input) {
  return call({
    action: 'create',
    identity: String((input && input.identity) || readIdentity()).trim(),
    eventId: input.eventId,
    mpOrderId: input.mpOrderId,
    eventKind: input.eventKind,
    eventDateKey: input.eventDateKey,
    eventTitle: input.eventTitle,
    storeName: input.storeName,
    leadPreset: input.leadPreset,
    remindAt: input.remindAt,
    channels: input.channels,
  })
}

function listReminders() {
  return call({ action: 'list', identity: readIdentity() }).then((res) => (res && res.reminders) || [])
}

function cancelReminder(reminderId) {
  return call({ action: 'cancel', identity: readIdentity(), reminderId })
}

module.exports = {
  createReminder,
  listReminders,
  cancelReminder,
}

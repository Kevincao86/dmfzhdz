const config = require('./config.js')

const SESSION_KEY = 'meoo_support_relay_sid'
const GUEST_FP_KEY = 'meoo_support_relay_gfp'
const POLL_MS = 4000

const DEFAULT_BOT = {
  id: 'welcome-bot',
  role: 'bot',
  text: '您好，我是灵祺客服。我会先回答您的问题；如需人工，请在 9:00–22:00 点击「进入人工客服」。',
  content: '您好，我是灵祺客服。我会先回答您的问题；如需人工，请在 9:00–22:00 点击「进入人工客服」。',
  at: '',
  ts: 0,
}

function randomSid() {
  return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function randomGuestFp() {
  return `lq-mp:gf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateSessionId() {
  try {
    const existing = String(wx.getStorageSync(SESSION_KEY) || '').trim()
    if (/^lq-mp[-:]/i.test(existing) && existing.length >= 12) return existing
    const sid = `lq-mp-${randomSid()}`
    wx.setStorageSync(SESSION_KEY, sid)
    return sid
  } catch (_) {
    return `lq-mp-${randomSid()}`
  }
}

function getOrCreateGuestFingerprint() {
  try {
    const existing = String(wx.getStorageSync(GUEST_FP_KEY) || '').trim()
    if (/^lq-mp:/i.test(existing) && existing.length >= 16) return existing
    const fp = randomGuestFp()
    wx.setStorageSync(GUEST_FP_KEY, fp)
    return fp
  } catch (_) {
    return randomGuestFp()
  }
}

function relayApi(body) {
  const base = String(config.MERCHANT_API_BASE_URL || '').replace(/\/$/, '')
  if (!base) return Promise.reject(new Error('未配置商家后台 API'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}/api/meoo-ops-mp-support-relay`,
      method: 'POST',
      header: { 'Content-Type': 'application/json', Accept: 'application/json' },
      data: body,
      timeout: 20000,
      success(res) {
        const data = res.data && typeof res.data === 'object' ? res.data : {}
        if (res.statusCode >= 200 && res.statusCode < 300 && data.ok !== false) {
          resolve(data)
          return
        }
        const msg = data.detail || data.hint || data.error || data.message || `发送失败 ${res.statusCode}`
        reject(new Error(String(msg)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (_) {
    return ''
  }
}

function relayFromToRole(from) {
  if (from === 'ops') return 'ops'
  if (from === 'system') return 'system'
  if (from === 'agent') return 'agent'
  if (from === 'bot') return 'bot'
  return 'user'
}

function rowToMessage(row) {
  const ts = Number(row.ts) || 0
  return {
    id: String(row.client_msg_id || ''),
    role: relayFromToRole(String(row.from_role || '')),
    text: String(row.text || ''),
    at: formatTime(ts),
    ts,
  }
}

function mergeMessages(prev, rows) {
  const map = new Map()
  for (const m of prev) {
    if (m && m.id) map.set(m.id, m)
  }
  for (const r of rows) {
    const m = rowToMessage(r)
    if (m.id) map.set(m.id, m)
  }
  return [...map.values()].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
}

function readCustomerMeta() {
  let customerId = ''
  let enterpriseName = ''
  try {
    customerId = String(wx.getStorageSync('meoo_login_name') || '').trim()
    enterpriseName = String(wx.getStorageSync('meoo_erp_merchant_display_name') || '').trim()
  } catch (_) {}
  return { customerId, enterpriseName }
}

async function fetchSessionMessages(sessionId) {
  const data = await relayApi({
    action: 'fetch_messages',
    sessionId,
    guestFingerprint: getOrCreateGuestFingerprint(),
  })
  const rows = Array.isArray(data.messages) ? data.messages : []
  return mergeMessages([], rows)
}

async function sendChatLine(from, text, id, sessionId) {
  const meta = readCustomerMeta()
  await relayApi({
    action: 'send_message',
    sessionId,
    guestFingerprint: getOrCreateGuestFingerprint(),
    fromRole: from,
    text,
    clientMsgId: id,
    ts: Date.now(),
    customerId: meta.customerId || '',
    enterpriseName: meta.enterpriseName || '',
  })
  return { ok: true }
}

function newMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

module.exports = {
  SESSION_KEY,
  POLL_MS,
  DEFAULT_BOT,
  getOrCreateSessionId,
  formatTime,
  mergeMessages,
  fetchSessionMessages,
  sendChatLine,
  newMsgId,
  relayFromToRole,
}

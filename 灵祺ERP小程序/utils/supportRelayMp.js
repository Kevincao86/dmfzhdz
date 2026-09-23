const rest = require('./supabaseRest.js')

const SESSION_KEY = 'meoo_support_relay_sid'
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

function getOrCreateSessionId() {
  try {
    const existing = wx.getStorageSync(SESSION_KEY)
    if (existing && String(existing).trim()) return String(existing).trim()
    const sid = randomSid()
    wx.setStorageSync(SESSION_KEY, sid)
    return sid
  } catch (_) {
    return randomSid()
  }
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
  const rows = await rest.fetchSupportRelayMessages(sessionId)
  return mergeMessages([], rows)
}

async function sendChatLine(from, text, id, sessionId) {
  const meta = readCustomerMeta()
  const row = {
    session_id: sessionId,
    customer_id: meta.customerId || null,
    enterprise_name: meta.enterpriseName || null,
    from_role: from,
    text,
    ts: Date.now(),
    client_msg_id: id,
  }
  await rest.insertSupportRelayMessage(row)
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

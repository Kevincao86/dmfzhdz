const merchant = require('./merchantApi.js')
const lingqiIdentity = require('./lingqiIdentity.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const wxAccount = require('./wxAccount.js')

const SESSION_KEY = 'meoo_talent_mp_support_sid'
const GUEST_FP_KEY = 'meoo_talent_mp_support_gfp'
const POLL_MS = 4000

const DEFAULT_BOT = {
  id: 'welcome-bot',
  role: 'bot',
  text: '您好，我是小灵同学。可解答招募、报名与账号问题；如需运营人工处理，请在输入框输入「人工服务」后点击按钮接入。',
  at: '',
  ts: 0,
}

function randomPart() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function useMerchantChannel() {
  return merchant.hasMerchantApi()
}

function canSupport() {
  return useMerchantChannel()
}

function formatSupportError(err) {
  const msg = String((err && err.message) || err || '未知错误')
  if (/admin_not_configured|ecs_proxy|erp_proxy/i.test(msg)) {
    return 'ECS 客服接口未就绪：请执行 bash ~/app/scripts/ecs-redeploy-mp-only.sh'
  }
  if (/support_relay|42P01|does not exist/i.test(msg)) {
    return '请确认已执行 support_relay_messages 相关数据库迁移'
  }
  if (/尚未配置后台|request:fail|url not in domain/i.test(msg)) {
    return `${msg}（请检查 config.local.js 的 MERCHANT_API_BASE_URL 与开发者工具「不校验合法域名」）`
  }
  return msg
}

async function relayApi(payload) {
  const data = await merchant.merchantRequest('POST', '/api/meoo-ops-mp-support-relay', payload)
  if (!data || data.ok === false) {
    const parts = [data && data.detail, data && data.hint, data && data.error].filter(Boolean)
    throw new Error(parts.join(' — ') || '请求失败')
  }
  return data
}

function getOrCreateGuestFingerprint() {
  try {
    const existing = wx.getStorageSync(GUEST_FP_KEY)
    if (existing && String(existing).trim().length >= 16) {
      return `lq-mp:${String(existing).trim()}`
    }
    const raw = `gf_${randomPart()}${Math.random().toString(36).slice(2, 8)}`
    wx.setStorageSync(GUEST_FP_KEY, raw)
    return `lq-mp:${raw}`
  } catch (_) {
    return `lq-mp:gf_${randomPart()}`
  }
}

/** 会话 ID 以 lq-mp- 开头，供运营台「小程序在线客服」筛选 */
function getOrCreateSessionId() {
  try {
    const existing = wx.getStorageSync(SESSION_KEY)
    if (existing && /^lq-mp[-:]/i.test(String(existing).trim())) {
      return String(existing).trim()
    }
    const sid = `lq-mp-${randomPart()}`
    wx.setStorageSync(SESSION_KEY, sid)
    return sid
  } catch (_) {
    return `lq-mp-${randomPart()}`
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
  const identity = userProfile.readIdentity()
  const wx = wxAccount.readWxAccount()
  const nick = String(wx?.wxNickName || '').trim()
  let customerId = ''
  let enterpriseName = '达人招募小程序'

  if (identity === 'pr') {
    const pr = userProfile.readPrProfile()
    enterpriseName = '达人招募·PR'
    customerId =
      (pr && lingqiIdentity.formatPrIdLabel(pr.lingqiPrId)) ||
      String(pr?.contactPhone || '').trim() ||
      nick ||
      'PR'
  } else {
    const member = memberStore.readMember()
    enterpriseName = '达人招募·达人'
    customerId =
      (member && lingqiIdentity.formatTalentIdLabel(member.lingqiTalentId)) ||
      String(member?.contact || '').trim() ||
      nick ||
      '达人'
  }

  return {
    customerId: String(customerId).slice(0, 120),
    enterpriseName: String(enterpriseName).slice(0, 80),
    identityLabel: userProfile.identityLabel(identity),
    wxNick: nick,
  }
}

async function fetchSessionMessages(sessionId) {
  const gfp = getOrCreateGuestFingerprint()
  const data = await relayApi({
    action: 'fetch_messages',
    sessionId,
    guestFingerprint: gfp,
  })
  return mergeMessages([], data.messages || [])
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
    guest_fingerprint: getOrCreateGuestFingerprint(),
  }
  await relayApi({
    action: 'send_message',
    sessionId,
    guestFingerprint: row.guest_fingerprint,
    fromRole: from,
    text,
    clientMsgId: id,
    ts: row.ts,
    customerId: meta.customerId,
    enterpriseName: meta.enterpriseName,
  })
  return { ok: true }
}

function newMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

module.exports = {
  SESSION_KEY,
  GUEST_FP_KEY,
  POLL_MS,
  DEFAULT_BOT,
  canSupport,
  useMerchantChannel,
  formatSupportError,
  getOrCreateSessionId,
  getOrCreateGuestFingerprint,
  formatTime,
  mergeMessages,
  fetchSessionMessages,
  sendChatLine,
  newMsgId,
  readCustomerMeta,
}

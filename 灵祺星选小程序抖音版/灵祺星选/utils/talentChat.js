const api = require('./api.js')
const participant = require('./participant.js')
const chatKeys = require('./talentChatKeys.js')
const opsRegistry = require('./opsRegistryTalentMp.js')

const POLL_MS = 2500
const CHAT_PATH = '/api/meoo-ops-mp-talent-chat'

async function chatRequest(payload) {
  if (!api.hasApi()) {
    throw new Error('未配置 MERCHANT_API_BASE_URL（config.release.js）')
  }
  return api.post(CHAT_PATH, payload)
}

function throwApiError(data) {
  const detail = String((data && data.detail) || '').trim()
  const hint = String((data && data.hint) || '').trim()
  const code = String((data && data.error) || 'request_failed').trim()
  const msg = [detail, hint, code].filter(Boolean).join(' — ')
  const err = new Error(msg || '请求失败')
  err.apiCode = code
  throw err
}

async function viaApi(payload) {
  const data = await chatRequest(payload)
  if (!data || data.ok === false) throwApiError(data)
  return data
}

function sanitizeSnapshot(s) {
  if (!s || typeof s !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(s))
  } catch {
    return null
  }
}

function formatChatError(err) {
  const msg = String((err && err.message) || err || '未知错误')
  if (/42P01|relation .* does not exist|undefined table/i.test(msg)) {
    return 'ECS 数据库表未就绪：请执行迁移 20260528100000_mp_talent_chat.sql'
  }
  if (/fetch failed|ECONNREFUSED|8888|erp-api/i.test(msg)) {
    return (
      'ECS 暂不可用。请在服务器执行：bash ~/app/scripts/ecs-fix-mp-chat-path.sh，' +
      '再上传体验版 mp-20260604-ecs-only 后重试。'
    )
  }
  if (/pr_not_ready/i.test(msg)) {
    return '招募方尚未在小程序「消息」页登录过，请稍后再试，或由 PR 在报名列表点击「私信沟通」先发起会话'
  }
  if (/meoo_ops_mp_talent_chat_failed/i.test(msg)) {
    const inner = msg.replace(/^meoo_ops_mp_talent_chat_failed\s*/i, '').trim()
    if (inner && inner.length > 8) return inner
    return '消息服务暂时不可用，请稍后点「重试」。'
  }
  if (/url not in domain|不在.*合法域名|domain list/i.test(msg)) {
    return '微信合法域名须仅配置 https://mofangdianai.com（request + downloadFile）。\n\n' + msg
  }
  if (/reset|errcode:-101|cronet_error/i.test(msg)) {
    return (
      '网络连接被重置。请确认体验版 mp-20260604-ecs-only、合法域名仅 mofangdianai.com，' +
      '删小程序重扫；ECS 执行 bash scripts/ecs-mp-minimal.sh。\n\n' +
      msg
    )
  }
  if (/request:fail|尚未配置后台/i.test(msg)) {
    return `网络请求失败，请稍后点「重试」。\n\n${msg}`
  }
  return msg
}

function canChat() {
  return api.hasApi()
}

async function syncProfile(p) {
  const part = p || participant.getCurrentParticipant()
  const snap = sanitizeSnapshot(part.memberSnapshot)
  const wxProfileDisplay = require('./wxProfileDisplay.js')
  let avatarUrl = String(part.avatarUrl || '').trim()
  if (avatarUrl && wxProfileDisplay.isLocalTempAvatar(avatarUrl)) {
    avatarUrl = await wxProfileDisplay.persistWxAvatarUrl(avatarUrl)
  }
  await viaApi({
    action: 'sync_profile',
    participantKey: part.participantKey,
    deviceSecret: part.deviceSecret,
    role: part.role,
    displayName: part.displayName,
    avatarUrl,
    memberSnapshot: snap,
  })
}

async function listSessions(part, reg) {
  const p = part || participant.getCurrentParticipant()
  const payload = {
    action: 'list_sessions',
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
  }
  if (p.role === 'talent') {
    Object.assign(payload, chatKeys.talentChatIdentityPayload(reg))
  }
  const data = await viaApi(payload)
  return data.sessions || []
}

function sessionPeerFromRow(session, myKey, reg) {
  const iAmTalent = session.talent_key === myKey
  const talentKey = String((session && session.talent_key) || '')
  const prKey = String((session && session.pr_key) || '')
  return participant.peerDisplay(session, myKey, {
    talentPeerId: iAmTalent ? '' : chatKeys.resolveTalentDisplayId(reg || null, talentKey),
    prPeerId: iAmTalent ? chatKeys.resolvePrDisplayId(prKey) : '',
  })
}

async function listSessionsForMe(part) {
  const base = part || participant.getCurrentParticipant()
  if (base.role === 'pr') {
    let reg = null
    try {
      reg = await opsRegistry.fetchRegistry()
    } catch (_) {
      /* */
    }
    const rows = await listSessions(base, reg)
    return chatKeys.dedupePrTalentSessions(rows, reg)
  }

  let reg = null
  try {
    reg = await opsRegistry.fetchRegistry()
  } catch (_) {
    /* 无 registry 时仍用本地 id 候选 */
  }

  try {
    await syncProfile(base)
    return await listSessions(base, reg)
  } catch (_) {
    /* fallback */
  }

  const merged = new Map()
  const candidates = chatKeys.collectTalentChatKeyCandidates(reg)
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i]
    const p = key === base.participantKey ? base : chatKeys.talentChatParticipantForKey(base, key)
    try {
      await syncProfile(p)
      const rows = await listSessions(p, reg)
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j]
        if (row && row.id) merged.set(String(row.id), row)
      }
    } catch (_) {
      /* 尝试下一个 key */
    }
  }
  return [...merged.values()].sort((a, b) => Number(b.last_ts || 0) - Number(a.last_ts || 0))
}

async function fetchMessages(sessionId, sinceTs, part) {
  const p = part || participant.getCurrentParticipant()
  const data = await viaApi({
    action: 'fetch_messages',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
    sinceTs: sinceTs || 0,
  })
  return data.messages || []
}

async function sendMessage(sessionId, text, clientMsgId, part) {
  const p = part || participant.getCurrentParticipant()
  const ts = Date.now()
  await viaApi({
    action: 'send_message',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
    fromRole: p.role,
    text,
    clientMsgId,
    ts,
  })
  return ts
}

async function markRead(sessionId, part) {
  const p = part || participant.getCurrentParticipant()
  await viaApi({
    action: 'mark_read',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
  })
}

async function ensureSessionRpc(input) {
  const data = await viaApi({
    action: 'ensure_session',
    participantKey: input.callerKey || input.prKey,
    deviceSecret: input.callerSecret || input.prSecret,
    talentKey: input.talentKey,
    prKey: input.prKey,
    talentSecret: input.talentSecret,
    prSecret: input.prSecret,
    talentName: input.talentName,
    prName: input.prName,
    talentAvatar: input.talentAvatar,
    prAvatar: input.prAvatar,
  })
  return String(data.sessionId)
}

async function ensureSessionWithTalent(talent, reg) {
  const me = participant.getCurrentParticipant()
  if (me.role !== 'pr') {
    throw new Error('请切换为 PR 身份后发起沟通')
  }
  const rawId = talent.talentMemberId || talent.id
  const memberId = chatKeys.canonicalTalentMemberIdFromRegistry(reg || null, rawId) || rawId
  const talentKey = participant.talentParticipantKey({ id: memberId })
  const talentSecret = participant.bootstrapTalentSecret(talentKey)
  return ensureSessionRpc({
    talentKey,
    prKey: me.participantKey,
    talentSecret,
    prSecret: me.deviceSecret,
    talentName: talent.name || '达人',
    prName: me.displayName,
    talentAvatar: talent.avatar || '',
    prAvatar: me.avatarUrl || '',
    callerKey: me.participantKey,
    callerSecret: me.deviceSecret,
  })
}

async function ensureSessionWithPr(pr) {
  const me = participant.getCurrentParticipant()
  if (me.role !== 'talent') {
    throw new Error('请切换为达人身份后联系招募方')
  }
  const prKey = String(pr.prParticipantKey || pr.prKey || '').trim()
  if (!prKey) {
    throw new Error('该招募单暂未绑定 PR 私信，请稍后再试')
  }
  const prName = String(pr.prWxNickName || pr.prDisplayName || pr.prName || '招募方').trim() || 'PR'
  const data = await viaApi({
    action: 'ensure_session_from_talent',
    participantKey: me.participantKey,
    deviceSecret: me.deviceSecret,
    talentKey: me.participantKey,
    prKey,
    talentName: me.displayName,
    prName,
    talentAvatar: me.avatarUrl || '',
    prAvatar: String(pr.prWxAvatarUrl || '').trim() || undefined,
  })
  return String(data.sessionId)
}

function totalUnreadCount(sessions, myKey) {
  return (sessions || []).reduce((n, s) => n + participant.unreadForMe(s, myKey), 0)
}

function sessionHasMutualMessages(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return false
  let hasPr = false
  let hasTalent = false
  for (let i = 0; i < msgs.length; i++) {
    const role = msgs[i] && msgs[i].from_role
    if (role === 'pr') hasPr = true
    if (role === 'talent') hasTalent = true
    if (hasPr && hasTalent) return true
  }
  return false
}

function isMissingMutualRpcError(err) {
  const msg = String((err && err.message) || err || '')
  return /PGRST202|could not find the function|schema cache|mp_talent_chat_pr_mutual|unknown_action/i.test(msg)
}

async function listMutualTalentKeysForPr(part) {
  const p = part || participant.getCurrentParticipant()
  if (p.role !== 'pr') return []
  try {
    const data = await viaApi({
      action: 'mutual_talent_keys',
      participantKey: p.participantKey,
      deviceSecret: p.deviceSecret,
    })
    return Array.isArray(data.talentKeys) ? data.talentKeys.map(String) : []
  } catch (e) {
    if (!isMissingMutualRpcError(e)) throw e
  }
  const sessions = await listSessions(p)
  const keys = []
  const my = p.participantKey
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]
    if (!s || s.pr_key !== my) continue
    try {
      const msgs = await fetchMessages(s.id, 0, p)
      if (sessionHasMutualMessages(msgs)) keys.push(String(s.talent_key))
    } catch (_) {}
  }
  return keys
}

function formatTime(ts) {
  try {
    const n = Number(ts)
    if (!Number.isFinite(n) || n <= 0) return ''
    const d = new Date(n)
    if (Number.isNaN(d.getTime())) return ''
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

function rowToUiMessage(row) {
  return {
    id: String(row.client_msg_id || row.id),
    fromRole: row.from_role,
    text: String(row.text || ''),
    ts: Number(row.ts) || 0,
    at: formatTime(row.ts),
  }
}

function mergeMessages(prev, rows) {
  const map = new Map()
  for (const m of prev) {
    if (m && m.id) map.set(m.id, m)
  }
  for (const r of rows) {
    const m = rowToUiMessage(r)
    if (m.id) map.set(m.id, m)
  }
  return [...map.values()].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
}

function newMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 首条往来：己方发过一条后须等对方首次回复，之后可自由互发 */
function canSendNextMessage(messages, myRole) {
  if (!messages || !messages.length) return { ok: true, hint: '' }
  const peerRole = myRole === 'pr' ? 'talent' : 'pr'
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].fromRole === peerRole) return { ok: true, hint: '' }
  }
  for (let j = 0; j < messages.length; j++) {
    if (messages[j].fromRole === myRole) {
      return { ok: false, hint: '等待对方回复后可继续发送' }
    }
  }
  return { ok: true, hint: '' }
}

const CHAT_TURN_HINT =
  '温馨提示：发起方发送首条消息后，需等待对方首次回复，之后即可自由互发。'

function sessionPreviewTime(ts) {
  return formatTime(ts)
}

const TEST_SESSION_KEY = 'meoo_local_test_session_id'
const TEST_PR_KEY = 'pr_local_test'
const TEST_TALENT_KEY = 'talent_mock-preview'

function testPrSecret() {
  const k = 'meoo_test_pr_secret_v1'
  try {
    const v = wx.getStorageSync(k)
    if (v && String(v).length >= 16) return String(v)
    const sec = `test_pr_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
    wx.setStorageSync(k, sec)
    return sec
  } catch {
    return 'test_pr_secret_local_meoo'
  }
}

async function openTestChatDialog() {
  const userProfile = require('./userProfile.js')
  if (!canChat()) {
    throw new Error('请先配置 MERCHANT_API_BASE_URL（开发者工具可用 config.local.js 指向本机 merchant-erp）')
  }
  const identity = userProfile.readIdentity()
  let sessionId = ''
  let peerName = ''
  const peerAvatar = '/images/logo.png'

  if (identity === 'pr') {
    const prSecret = testPrSecret()
    const talentSecret = participant.bootstrapTalentSecret(TEST_TALENT_KEY)
    const data = await viaApi({
      action: 'ensure_session',
      participantKey: TEST_PR_KEY,
      deviceSecret: prSecret,
      talentKey: TEST_TALENT_KEY,
      prKey: TEST_PR_KEY,
      talentSecret,
      prSecret,
      talentName: '小美探店',
      prName: '本地PR测试',
      talentAvatar: '/images/logo.png',
    })
    sessionId = data.sessionId
    try {
      wx.setStorageSync(TEST_SESSION_KEY, sessionId)
    } catch (_) {}
    const prPart = {
      role: 'pr',
      participantKey: TEST_PR_KEY,
      deviceSecret: prSecret,
      displayName: '本地PR测试',
      avatarUrl: '',
      memberSnapshot: null,
    }
    await syncProfile(prPart)
    participant.setParticipantOverride(prPart)
    peerName = '小美探店'
  } else {
    sessionId = wx.getStorageSync(TEST_SESSION_KEY) || ''
    if (!sessionId) {
      throw new Error('请先在「我的」切换为 PR，在消息页点「打开测试对话」创建会话')
    }
    const talentSecret = participant.bootstrapTalentSecret(TEST_TALENT_KEY)
    const talentPart = {
      role: 'talent',
      participantKey: TEST_TALENT_KEY,
      deviceSecret: talentSecret,
      displayName: '小美探店',
      avatarUrl: '/images/logo.png',
      memberSnapshot: null,
    }
    await syncProfile(talentPart)
    participant.setParticipantOverride(talentPart)
    peerName = '本地PR测试'
  }

  return { sessionId, peerName, peerAvatar }
}

module.exports = {
  POLL_MS,
  canChat,
  formatChatError,
  syncProfile,
  listSessions,
  listSessionsForMe,
  sessionPeerFromRow,
  participantForSession: chatKeys.participantForSession,
  sessionAuthKeyForMe: chatKeys.sessionAuthKeyForMe,
  listMutualTalentKeysForPr,
  fetchMessages,
  sendMessage,
  markRead,
  ensureSessionWithTalent,
  ensureSessionWithPr,
  totalUnreadCount,
  openTestChatDialog,
  formatTime,
  mergeMessages,
  newMsgId,
  sessionPreviewTime,
  canSendNextMessage,
  CHAT_TURN_HINT,
}

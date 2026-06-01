const merchant = require('./merchantApi.js')
const supabase = require('./supabaseRest.js')
const participant = require('./participant.js')

const POLL_MS = 2500

function chatRequest(payload) {
  return merchant.merchantRequest('POST', '/api/meoo-ops-mp-talent-chat', payload)
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

/** 体验版/生产：优先 Supabase anon（不依赖 ECS service_role），失败再试 erp-api */
async function chatDual(apiCall, sbCall) {
  const attempts = []
  if (supabase.hasSupabase()) attempts.push(sbCall)
  if (merchant.hasMerchantApi()) attempts.push(apiCall)
  if (!attempts.length) throw new Error('未配置消息服务（SUPABASE 或 MERCHANT_API_BASE_URL）')
  let lastErr
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await attempts[i]()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function viaSupabaseRpc(name, args) {
  return supabase.rpc(name, args)
}

/** 已配置 ERP 时优先走 service_role API，避免 anon 直连 RPC 权限/缓存问题 */
function useMerchantChannel() {
  return merchant.hasMerchantApi()
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
    return '数据库表未就绪：请确认已执行迁移 20260528100000_mp_talent_chat.sql'
  }
  if (/fetch failed|ECONNREFUSED|54321/i.test(msg)) {
    return '无法连接 Supabase：若 .env.local 为 127.0.0.1:54321，请先启动 Docker 并在项目根执行 supabase start；或改为云端 SUPABASE_URL + SERVICE_ROLE_KEY（与已执行迁移的项目一致）'
  }
  if (/supabase_admin_not_configured/i.test(msg)) {
    return '消息接口暂不可用：服务端未配置 Supabase 管理密钥。体验版已尝试直连 Supabase，请确认 config.release.js 中 SUPABASE_URL / ANON_KEY 与 ECS 一致。'
  }
  if (/meoo_ops_mp_talent_chat_failed|chat_supabase_error/i.test(msg)) {
    if (/\.env\.local|npm run dev|127\.0\.0\.1:54321/i.test(msg)) {
      return '本地开发：请启动 merchant-erp npm run dev 并配置 .env.local 中的 Supabase'
    }
    const inner = msg
      .replace(/^meoo_ops_mp_talent_chat_failed\s*/i, '')
      .replace(/^chat_supabase_error\s*/i, '')
      .trim()
    if (inner && inner.length > 8 && !/^meoo_ops|chat_supabase$/i.test(inner)) return inner
    return '消息服务连接失败，请稍后重试或检查网络（需已配置 Supabase 私信迁移）'
  }
  if (/schema cache|PGRST202|could not find the function|mp_talent_chat_ensure_session/i.test(msg)) {
    return (
      'Supabase 缺少私信函数 mp_talent_chat_ensure_session（8 参数）。请在 SQL Editor 执行迁移 ' +
      '20260530150000_mp_talent_chat_pr_avatar_column.sql（或 20260530140000 全文），然后 Dashboard → Settings → API → Reload schema'
    )
  }
  if (/尚未配置后台|url not in domain|request:fail/i.test(msg)) {
    return `${msg}（请检查 config.local.js 的 MERCHANT_API_BASE_URL 与「不校验合法域名」）`
  }
  return msg
}

function canChat() {
  return merchant.hasMerchantApi() || supabase.hasSupabase()
}

async function syncProfile(p) {
  const part = p || participant.getCurrentParticipant()
  const snap = sanitizeSnapshot(part.memberSnapshot)
  await chatDual(
    () =>
      viaApi({
        action: 'sync_profile',
        participantKey: part.participantKey,
        deviceSecret: part.deviceSecret,
        role: part.role,
        displayName: part.displayName,
        avatarUrl: part.avatarUrl,
        memberSnapshot: snap,
      }),
    () =>
      viaSupabaseRpc('mp_talent_chat_upsert_participant', {
        p_key: part.participantKey,
        p_role: part.role,
        p_secret: part.deviceSecret,
        p_display_name: part.displayName,
        p_avatar_url: part.avatarUrl || null,
        p_member_snapshot: snap,
      }),
  )
}

async function listSessions(part) {
  const p = part || participant.getCurrentParticipant()
  return chatDual(
    async () => {
      const data = await viaApi({
        action: 'list_sessions',
        participantKey: p.participantKey,
        deviceSecret: p.deviceSecret,
      })
      return data.sessions || []
    },
    async () => {
      const rows = await viaSupabaseRpc('mp_talent_chat_list_sessions', {
        p_key: p.participantKey,
        p_secret: p.deviceSecret,
      })
      return Array.isArray(rows) ? rows : []
    },
  )
}

async function fetchMessages(sessionId, sinceTs, part) {
  const p = part || participant.getCurrentParticipant()
  return chatDual(
    async () => {
      const data = await viaApi({
        action: 'fetch_messages',
        sessionId,
        participantKey: p.participantKey,
        deviceSecret: p.deviceSecret,
        sinceTs: sinceTs || 0,
      })
      return data.messages || []
    },
    async () => {
      const rows = await viaSupabaseRpc('mp_talent_chat_fetch_messages', {
        p_session_id: sessionId,
        p_key: p.participantKey,
        p_secret: p.deviceSecret,
        p_since_ts: sinceTs || 0,
      })
      return Array.isArray(rows) ? rows : []
    },
  )
}

async function sendMessage(sessionId, text, clientMsgId, part) {
  const p = part || participant.getCurrentParticipant()
  const ts = Date.now()
  await chatDual(
    () =>
      viaApi({
        action: 'send_message',
        sessionId,
        participantKey: p.participantKey,
        deviceSecret: p.deviceSecret,
        fromRole: p.role,
        text,
        clientMsgId,
        ts,
      }),
    () =>
      viaSupabaseRpc('mp_talent_chat_send_message', {
        p_session_id: sessionId,
        p_key: p.participantKey,
        p_secret: p.deviceSecret,
        p_from_role: p.role,
        p_text: text,
        p_client_msg_id: clientMsgId,
        p_ts: ts,
      }),
  )
  return ts
}

async function markRead(sessionId, part) {
  const p = part || participant.getCurrentParticipant()
  await chatDual(
    () =>
      viaApi({
        action: 'mark_read',
        sessionId,
        participantKey: p.participantKey,
        deviceSecret: p.deviceSecret,
      }),
    () =>
      viaSupabaseRpc('mp_talent_chat_mark_read', {
        p_session_id: sessionId,
        p_key: p.participantKey,
        p_secret: p.deviceSecret,
      }),
  )
}

async function ensureSessionViaSupabase(input) {
  const rpc7 = {
    p_talent_key: input.talentKey,
    p_pr_key: input.prKey,
    p_talent_secret: input.talentSecret,
    p_pr_secret: input.prSecret,
    p_talent_name: input.talentName || '达人',
    p_pr_name: input.prName || 'PR',
    p_talent_avatar: input.talentAvatar || null,
  }
  try {
    const id = await viaSupabaseRpc('mp_talent_chat_ensure_session', {
      ...rpc7,
      p_pr_avatar: input.prAvatar || null,
    })
    return String(id)
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (!/Could not find the function|PGRST202|schema cache/i.test(msg)) throw e
    const id = await viaSupabaseRpc('mp_talent_chat_ensure_session', rpc7)
    return String(id)
  }
}

async function ensureSessionRpc(input) {
  const sessionId = await chatDual(
    async () => {
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
      return data.sessionId
    },
    () => ensureSessionViaSupabase(input),
  )
  return String(sessionId)
}

async function ensureSessionWithTalent(talent) {
  const me = participant.getCurrentParticipant()
  if (me.role !== 'pr') {
    throw new Error('请切换为 PR 身份后发起沟通')
  }
  const talentKey = participant.talentParticipantKey({
    id: talent.talentMemberId || talent.id,
  })
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

/** 达人向发单 PR 发起私信（需订单 meta 含 prParticipantKey） */
async function ensureSessionWithPr(pr) {
  const me = participant.getCurrentParticipant()
  if (me.role !== 'talent') {
    throw new Error('请切换为达人身份后联系招募方')
  }
  const prKey = String(pr.prParticipantKey || pr.prKey || '').trim()
  if (!prKey) {
    throw new Error('该招募单暂未绑定 PR 私信，请稍后再试')
  }
  if (!merchant.hasMerchantApi() && !supabase.hasSupabase()) {
    throw new Error('请配置 MERCHANT_API_BASE_URL 或 SUPABASE_URL')
  }
  if (merchant.hasMerchantApi()) {
    try {
      const data = await viaApi({
        action: 'ensure_session_from_talent',
        participantKey: me.participantKey,
        deviceSecret: me.deviceSecret,
        talentKey: me.participantKey,
        prKey,
        talentName: me.displayName,
        prName: String(pr.prWxNickName || pr.prDisplayName || pr.prName || '招募方').trim() || 'PR',
        talentAvatar: me.avatarUrl || '',
        prAvatar: String(pr.prWxAvatarUrl || '').trim() || undefined,
      })
      return data.sessionId
    } catch (e) {
      const msg = String((e && e.message) || e)
      if (!supabase.hasSupabase() || !/supabase_admin|service_role|503/i.test(msg)) throw e
    }
  }
  throw new Error('联系招募方需服务端消息接口，请确认 ECS auth-api 已配置 SUPABASE_SERVICE_ROLE_KEY')
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
  return /PGRST202|could not find the function|schema cache|mp_talent_chat_pr_mutual/i.test(msg)
}

/** PR：双方均发过消息的达人 participant_key（如 talent_xxx） */
async function listMutualTalentKeysForPr(part) {
  const p = part || participant.getCurrentParticipant()
  if (p.role !== 'pr') return []
  if (useMerchantChannel()) {
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
  } else if (supabase.hasSupabase()) {
    try {
      const rows = await viaSupabaseRpc('mp_talent_chat_pr_mutual_talent_keys', {
        p_key: p.participantKey,
        p_secret: p.deviceSecret,
      })
      return Array.isArray(rows) ? rows.map(String) : []
    } catch (e) {
      if (!isMissingMutualRpcError(e)) throw e
    }
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
    const d = new Date(Number(ts) || 0)
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

/** 本地一键打开测试对话框（PR 建会话，达人用同 sessionId 回复） */
async function openTestChatDialog() {
  const userProfile = require('./userProfile.js')
  const participant = require('./participant.js')
  if (!canChat()) {
    throw new Error('请先配置 config.local.js 的 MERCHANT_API_BASE_URL，并启动 merchant-erp npm run dev')
  }
  const identity = userProfile.readIdentity()
  let sessionId = ''
  let peerName = ''
  let peerAvatar = '/images/logo.png'

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
}

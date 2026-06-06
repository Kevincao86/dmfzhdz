const SECRET_KEY = 'meoo_talent_chat_secret_v1'
const OVERRIDE_KEY = 'meoo_chat_participant_override_v1'
const userProfile = require('./userProfile.js')
const talentMember = require('./talentMember.js')
const sessionStore = require('./mpSessionStore.js')

function randomSecret() {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`
}

/** 与 PR 建会话时写入库中的达人密钥（本机固定，换设备需 PR 再次发起） */
function bootstrapTalentSecret(talentKey) {
  const core = String(talentKey || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 48)
  return `boot_${core || 'talent'}_meoo_chat_seed`
}

function getDeviceSecret() {
  try {
    const existing = wx.getStorageSync(SECRET_KEY)
    if (existing && String(existing).length >= 16) return String(existing)
    const sec = randomSecret()
    wx.setStorageSync(SECRET_KEY, sec)
    return sec
  } catch {
    return randomSecret()
  }
}

function resolveTalentMemberId() {
  const member = talentMember.readMember()
  const acc = sessionStore.readAccount()
  return String((acc && acc.registryMemberId) || (member && member.id) || '').trim()
}

function talentParticipantKey(member) {
  const id = String((member && member.id) || resolveTalentMemberId() || '').trim()
  if (id) return `talent_${id}`
  return `talent_guest_${getDeviceSecret().slice(0, 12)}`
}

function prParticipantKey(profile) {
  const phone = profile && String(profile.contactPhone || '').trim()
  if (phone) return `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
  return `pr_device_${getDeviceSecret().slice(0, 12)}`
}

function setParticipantOverride(part) {
  try {
    if (part) wx.setStorageSync(OVERRIDE_KEY, JSON.stringify(part))
    else wx.removeStorageSync(OVERRIDE_KEY)
  } catch (_) {}
}

function clearParticipantOverride() {
  setParticipantOverride(null)
}

/** 当前身份下的会话参与方 */
function getCurrentParticipant() {
  try {
    const raw = wx.getStorageSync(OVERRIDE_KEY)
    if (raw) {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (o && o.participantKey && o.deviceSecret) return o
    }
  } catch (_) {}
  const identity = userProfile.readIdentity()
  const secret = getDeviceSecret()
  if (identity === 'pr') {
    const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
    const wxNick = String(pr.wxNickName || '').trim()
    const name =
      wxNick ||
      String(pr.contactName || pr.companyName || pr.personalName || '').trim() ||
      'PR'
    return {
      role: 'pr',
      participantKey: prParticipantKey(pr),
      deviceSecret: secret,
      displayName: name,
      avatarUrl: String(pr.wxAvatarUrl || (acc && acc.wxAvatarUrl) || '').trim(),
      memberSnapshot: pr,
    }
  }
  const member = talentMember.readMember()
  const memberId = resolveTalentMemberId()
  const key = memberId ? `talent_${memberId}` : talentParticipantKey(member)
  const name = member
    ? String(member.wxNickName || member.douyin?.platformNickname || '').trim() || '达人'
    : '达人'
  return {
    role: 'talent',
    participantKey: key,
    deviceSecret: bootstrapTalentSecret(key),
    displayName: name,
    avatarUrl: String((member && member.wxAvatarUrl) || (acc && acc.wxAvatarUrl) || '').trim(),
    memberSnapshot: member || null,
  }
}

function peerDisplay(session, myKey, opts) {
  const o = opts || {}
  if (!session) return { name: '会话', avatar: '', peerId: '' }
  const iAmTalent = session.talent_key === myKey
  if (iAmTalent) {
    return {
      name: String(session.pr_name || '').trim() || 'PR',
      avatar: String(session.pr_avatar || '').trim(),
      peerId: String(o.prPeerId || '').trim(),
    }
  }
  return {
    name: String(session.talent_name || '').trim() || '达人',
    avatar: String(session.talent_avatar || '').trim(),
    peerId: String(o.talentPeerId || '').trim(),
  }
}

function peerLabel(session, myKey) {
  return peerDisplay(session, myKey).name
}

function peerAvatar(session, myKey) {
  return peerDisplay(session, myKey).avatar
}

function unreadForMe(session, myKey) {
  if (!session) return 0
  if (session.talent_key === myKey) return Number(session.talent_unread) || 0
  return Number(session.pr_unread) || 0
}

module.exports = {
  getDeviceSecret,
  getCurrentParticipant,
  setParticipantOverride,
  clearParticipantOverride,
  resolveTalentMemberId,
  talentParticipantKey,
  prParticipantKey,
  bootstrapTalentSecret,
  peerDisplay,
  peerLabel,
  peerAvatar,
  unreadForMe,
}

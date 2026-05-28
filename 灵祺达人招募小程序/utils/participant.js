const SECRET_KEY = 'meoo_talent_chat_secret_v1'
const OVERRIDE_KEY = 'meoo_chat_participant_override_v1'
const userProfile = require('./userProfile.js')
const talentMember = require('./talentMember.js')

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

function talentParticipantKey(member) {
  if (member && member.id) return `talent_${member.id}`
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
    const name = String(pr.contactName || pr.companyName || '').trim() || 'PR'
    return {
      role: 'pr',
      participantKey: prParticipantKey(pr),
      deviceSecret: secret,
      displayName: name,
      avatarUrl: '',
      memberSnapshot: pr,
    }
  }
  const member = talentMember.readMember()
  const key = talentParticipantKey(member)
  const name = member
    ? String(member.wxNickName || member.douyin?.platformNickname || '').trim() || '达人'
    : '达人'
  return {
    role: 'talent',
    participantKey: key,
    deviceSecret: bootstrapTalentSecret(key),
    displayName: name,
    avatarUrl: member && member.wxAvatarUrl ? member.wxAvatarUrl : '',
    memberSnapshot: member || null,
  }
}

function peerLabel(session, myKey) {
  if (!session) return '会话'
  if (session.talent_key === myKey) return session.pr_name || 'PR'
  return session.talent_name || '达人'
}

function peerAvatar(session, myKey) {
  if (!session) return ''
  if (session.talent_key === myKey) return ''
  return session.talent_avatar || ''
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
  talentParticipantKey,
  prParticipantKey,
  bootstrapTalentSecret,
  peerLabel,
  peerAvatar,
  unreadForMe,
}

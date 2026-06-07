const talentPlatforms = require('./talentPlatformProfiles.js')
const applicationsStore = require('./applicationsStore.js')
const selection = require('./mpApplicantSelection.js')
const mpGroupQr = require('./mpGroupQr.js')
const inboxNoticeState = require('./inboxNoticeState.js')

const SELECTION_NOTICE_KEY = 'meoo_selection_notice_sent_v1'

function contactKey(contact) {
  const digits = String(contact || '').replace(/\D/g, '')
  return digits ? `contact:${digits}` : ''
}

function accountKey(platform, account) {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  const pid = talentPlatforms.platformIdFromName(platform || '抖音')
  return `acct:${pid}:${a}`
}

function looksLikeRegistryMemberId(id) {
  return /^(MTM-|LQ-[TD]-|talent_)/i.test(id)
}

function strictTalentIds(member) {
  const ids = new Set()
  const auth = require('./auth.js')
  const acc = auth.readAccount()
  for (const v of [acc && acc.lingqiTalentId, acc && acc.registryMemberId, member && member.id, member && member.lingqiTalentId]) {
    const s = String(v || '').trim()
    if (s) ids.add(s)
  }
  return ids
}

function userOwnsApplicantId(applicantId) {
  const aid = String(applicantId || '').trim()
  if (!aid) return false
  return applicationsStore.readApplications().some((a) => a && String(a.applicantId || '') === aid)
}

/** PR 写入站内信时用的 talentMemberId（无会员 id 时用手机号/账号兜底） */
function resolveTalentInboxTarget(applicant, reg) {
  const a = applicant || {}
  let talentMemberId = selection.resolveTalentMemberId(a, reg)
  const contact = String(a.contact || '').trim()
  const platformAccount = String(a.platformAccount || '').trim()
  const applicantId = String(a.id || '').trim()
  if (!talentMemberId && contact) talentMemberId = contactKey(contact)
  if (!talentMemberId && platformAccount) talentMemberId = accountKey(a.platform, platformAccount)
  return { talentMemberId, contact, platformAccount, applicantId }
}

function talentMatchKeys(member) {
  const keys = new Set()
  if (!member) return keys
  const auth = require('./auth.js')
  const acc = auth.readAccount()
  if (acc && acc.lingqiTalentId) keys.add(String(acc.lingqiTalentId).trim())
  if (acc && acc.registryMemberId) keys.add(String(acc.registryMemberId).trim())
  if (member.id) keys.add(String(member.id).trim())
  if (member.lingqiTalentId) keys.add(String(member.lingqiTalentId).trim())
  const contact = String(member.contact || '').trim()
  if (contact) {
    keys.add(contact)
    const ck = contactKey(contact)
    if (ck) keys.add(ck)
  }
  const profiles = member.platformProfiles || {}
  for (const p of talentPlatforms.TALENT_PLATFORMS) {
    const prof = profiles[p.id]
    if (!prof || !String(prof.platformAccount || '').trim()) continue
    keys.add(accountKey(p.name, prof.platformAccount))
    keys.add(String(prof.platformAccount).trim().toLowerCase())
  }
  return keys
}

function inboxRowMatchesTalent(row, keys, member) {
  if (!row || !member) return false
  const strictIds = strictTalentIds(member)
  const mid = String(row.talentMemberId || '').trim()
  const applicantId = String(row.applicantId || '').trim()
  const isSelection = row.noticeType === 'selection' || /恭喜入选/.test(String(row.title || ''))

  if (mid && strictIds.has(mid)) return true
  if (mid && looksLikeRegistryMemberId(mid)) return false

  if (applicantId) {
    if (!userOwnsApplicantId(applicantId)) return false
    if (isSelection) return true
  }

  if (mid && keys.has(mid)) {
    if (!applicantId || userOwnsApplicantId(applicantId)) return true
  }

  const contact = String(row.contact || '').trim()
  if (contact && applicantId && userOwnsApplicantId(applicantId)) {
    if (keys.has(contact)) return true
    const ck = contactKey(contact)
    if (ck && keys.has(ck)) return true
    if (String(member.contact || '').trim() === contact) return true
  }

  const plat = row.platform || '抖音'
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  if (acct && applicantId && userOwnsApplicantId(applicantId)) {
    if (keys.has(accountKey(plat, acct))) return true
    if (selection.applicantMatchesLocalMember({ platform: plat, platformAccount: acct }, member)) return true
  }

  if (isSelection) return false
  return false
}

function registryHasSelectionForApplicant(reg, member, mpOrderId, applicantId) {
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const keys = talentMatchKeys(member)
  return inbox.some((row) => {
    if (!row) return false
    if (String(row.mpOrderId || '') !== mpOrderId) return false
    if (String(row.applicantId || '') !== applicantId) return false
    if (row.noticeType !== 'selection' && !/恭喜入选/.test(String(row.title || ''))) return false
    return inboxRowMatchesTalent(row, keys, member)
  })
}

function readSelectionNoticeSent() {
  try {
    const raw = wx.getStorageSync(SELECTION_NOTICE_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

function markSelectionNoticeSent(key) {
  const set = readSelectionNoticeSent()
  set.add(String(key))
  try {
    wx.setStorageSync(SELECTION_NOTICE_KEY, JSON.stringify([...set].slice(-200)))
  } catch (_) {}
}

/** 注册表已选名单 → 本地通知（PR 通知接口失败或 talentMemberId 不一致时仍能提示） */
function buildSelectionNoticeRows(reg, member) {
  if (!reg || !member) return []
  const apps = applicationsStore.readApplications()
  const rows = []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i]
    if (!app || !app.mpOrderId || !app.applicantId) continue
    const mp = mpList.find((o) => o && o.id === app.mpOrderId)
    if (!mp) continue
    const selected = selection.selectedIdsFromMp(mp)
    if (!selected.includes(String(app.applicantId))) continue
    const applicant = (mp.applicants || []).find((a) => a && a.id === app.applicantId)
    if (applicant && !selection.applicantMatchesLocalMember(applicant, member)) continue
    if (registryHasSelectionForApplicant(reg, member, app.mpOrderId, String(app.applicantId))) continue
    const dedupe = `sel-${app.mpOrderId}-${app.applicantId}`
    if (inboxNoticeState.getHandledAction({ dedupeKey: dedupe })) continue
    const qr = mpGroupQr.groupQrFromMp(mp)
    rows.push({
      id: `sel-local-${app.mpOrderId}-${app.applicantId}`,
      title: '恭喜入选招募',
      body: `您已被选入「${mp.title || app.title || app.mpOrderId}」。请扫码加入项目群，二维码见下图。`,
      category: 'business',
      categoryLabel: '业务',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      read: false,
      fromSelection: true,
      noticeType: 'selection',
      mpOrderId: app.mpOrderId,
      applicantId: app.applicantId,
      dedupeKey: dedupe,
      imageUrl: qr || '',
    })
  }
  return rows
}

module.exports = {
  contactKey,
  accountKey,
  resolveTalentInboxTarget,
  talentMatchKeys,
  inboxRowMatchesTalent,
  buildSelectionNoticeRows,
  markSelectionNoticeSent,
}

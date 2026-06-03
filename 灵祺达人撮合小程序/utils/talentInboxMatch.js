const talentMember = require('./talentMember.js')
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
  if (member.id) keys.add(String(member.id).trim())
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
  for (const app of applicationsStore.readApplications()) {
    if (app && app.applicantId) keys.add(`app:${app.applicantId}`)
  }
  return keys
}

function inboxRowMatchesTalent(row, keys, member) {
  if (!row || !keys || !keys.size) return false
  const mid = String(row.talentMemberId || '').trim()
  if (mid && keys.has(mid)) return true
  const contact = String(row.contact || '').trim()
  if (contact) {
    if (keys.has(contact)) return true
    const ck = contactKey(contact)
    if (ck && keys.has(ck)) return true
  }
  const applicantId = String(row.applicantId || '').trim()
  if (applicantId && keys.has(`app:${applicantId}`)) return true
  if (member && contact && String(member.contact || '').trim() === contact) return true
  const plat = row.platform || '抖音'
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  if (acct && keys.has(accountKey(plat, acct))) return true
  if (member && acct && selection.applicantMatchesLocalMember({ platform: plat, platformAccount: acct }, member)) {
    return true
  }
  return false
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
    const dedupe = `sel-${app.mpOrderId}-${app.applicantId}`
    if (inboxNoticeState.getHandledAction({ dedupeKey: dedupe })) continue
    const qr = mpGroupQr.groupQrFromMp(mp)
    rows.push({
      id: `sel-local-${Date.now()}-${i}`,
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

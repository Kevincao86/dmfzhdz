const display = require('./recruitmentDisplay.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const hallFilters = require('./recruitmentHallFilters.js')
const talentContactPrGate = require('./talentContactPrGate.js')
const memberStore = require('./talentMember.js')
const { labels } = require('./platformLabels.js')
const { TALENT_TAGS } = require('./publishFormOptions.js')

const { isIceMpOrder } = require('./iceOrderDetect.js')
const { getIceVerifyMode } = require('./iceOrderStats.js')
const { resolveOrderTypeFromMp } = require('./applicationOrderType.js')
const talentAppStatus = require('./talentApplicationStatus.js')
const deliveryReview = require('./deliveryReviewPlatform.js')
const scriptUpload = require('./recruitmentScriptUpload.js')
const applicantListExtras = require('./applicantListExtras.js')
const mpOrderStatus = require('./mpOrderStatus.js')

const MP_STATUS_LABEL = {
  ...mpOrderStatus.MP_STATUS_LABEL,
  unknown: '未知',
}

function statusLabel(status) {
  return MP_STATUS_LABEL[status] || mpOrderStatus.statusLabel(status) || '—'
}

function hallLabelFromMp(mp) {
  if (!mp) return '—'
  if (mp.hall === 'urgent' || mp.urgent) return '急单大厅'
  if (mp.hall === 'ice' || mp.orderKind === 'ice' || mp.orderKind === 'recruitment_ice') return '云剪任务'
  return '招募大厅'
}

function normalizeProfileUrl(raw) {
  const u = String(raw || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

function resolveApplicantProfileLinkRaw(applicant, reg) {
  if (!applicant) return ''
  const platform = applicant.platform || '抖音'
  const pid = talentPlatforms.platformIdFromName(platform)
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const contact = String(applicant.contact || '').trim()

  const fromRow = String(applicant.profileLink || '').trim()
  if (fromRow) return fromRow

  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  for (const m of members) {
    const prof = m.platformProfiles && m.platformProfiles[pid]
    if (prof) {
      const profAccount = String(prof.platformAccount || '').trim().toLowerCase()
      if (account && profAccount === account) {
        const link = String(prof.profileLink || '').trim()
        if (link) return link
      }
    }
    if (contact && String(m.contact || '').trim() === contact && prof) {
      const link = String(prof.profileLink || '').trim()
      if (link) return link
    }
  }

  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg.talentLibraryEntries : []
  for (const e of lib) {
    if (talentPlatforms.platformIdFromName(e.platform) !== pid) continue
    const entryAccount = String(e.platformAccount || '').trim().toLowerCase()
    if (account && entryAccount === account) {
      const link = String(e.profileLink || '').trim()
      if (link) return link
    }
    if (contact && String(e.contact || '').trim() === contact) {
      const link = String(e.profileLink || '').trim()
      if (link) return link
    }
  }

  return ''
}

/** 复制报名时填写的平台主页链接（整段口令或 URL，不做外链跳转） */
function copyTalentProfileLink(rawLink) {
  const text = String(rawLink || '').trim()
  if (!text) {
    wx.showToast({ title: '未填写主页链接', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: text,
    success() {
      wx.showToast({ title: '已复制主页链接', icon: 'success' })
    },
  })
}

/** @deprecated 小程序内仅复制链接，保留别名避免旧调用报错 */
function openTalentProfileLink(url) {
  copyTalentProfileLink(url)
}

function resolveApplicantAvatar(applicant, reg) {
  if (!applicant) return ''
  if (applicant.avatar || applicant.wxAvatarUrl) {
    return String(applicant.avatar || applicant.wxAvatarUrl || '').trim()
  }
  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const plat = applicant.platform || '抖音'
  const pid = talentPlatforms.platformIdFromName(plat)

  for (const m of members) {
    const prof = m.platformProfiles && m.platformProfiles[pid]
    if (prof && account && String(prof.platformAccount || '').trim().toLowerCase() === account) {
      return String(m.wxAvatarUrl || '').trim()
    }
  }
  const contact = String(applicant.contact || '').trim()
  if (contact) {
    for (const m of members) {
      if (String(m.contact || '').trim() === contact) return String(m.wxAvatarUrl || '').trim()
    }
  }
  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg.talentLibraryEntries : []
  for (const e of lib) {
    if (account && String(e.platformAccount || '').trim().toLowerCase() === account) {
      break
    }
  }
  const self = memberStore.readMember()
  if (self && self.wxAvatarUrl && contact && String(self.contact || '').trim() === contact) {
    return String(self.wxAvatarUrl).trim()
  }
  return ''
}

function normalizeAccountTags(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => String(t || '').trim())
    .filter((t) => t && TALENT_TAGS.includes(t))
}

function resolveApplicantMemberProfile(applicant, reg) {
  if (!applicant || !reg) return null
  const plat = applicant.platform || '抖音'
  const pid = talentPlatforms.platformIdFromName(plat)
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const contact = String(applicant.contact || '').trim()
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []

  const pickFromProf = (prof) => {
    if (!prof) return null
    return {
      douyinSalesLevel: String(prof.douyinSalesLevel || '').trim(),
      talentGrade: String(prof.talentGrade || '').trim(),
      accountTags: normalizeAccountTags(prof.accountTags),
    }
  }

  if (account) {
    for (const m of members) {
      const prof = m.platformProfiles && m.platformProfiles[pid]
      if (prof && String(prof.platformAccount || '').trim().toLowerCase() === account) {
        return pickFromProf(prof)
      }
    }
    const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
    for (const e of lib) {
      if (String(e.platformAccount || '').trim().toLowerCase() === account) {
        return {
          douyinSalesLevel: String(e.douyinSalesLevel || '').trim(),
          talentGrade: String(e.talentGrade || '').trim(),
          accountTags: normalizeAccountTags(e.accountTags || e.tags),
        }
      }
    }
  }
  if (contact) {
    for (const m of members) {
      if (String(m.contact || '').trim() !== contact) continue
      const prof = m.platformProfiles && m.platformProfiles[pid]
      const fromPlat = pickFromProf(prof)
      if (fromPlat) return fromPlat
      const primary = memberStore.primaryPlatformProfile(m)
      if (primary && primary.platform === plat) return pickFromProf(primary.profile)
    }
  }
  return null
}

function resolveApplicantAccountTags(applicant, reg) {
  const onRow = normalizeAccountTags(applicant && applicant.accountTags)
  if (onRow.length) return onRow
  const prof = resolveApplicantMemberProfile(applicant, reg)
  return prof && prof.accountTags ? prof.accountTags : []
}

function resolveDisplaySalesLevel(applicant, reg) {
  const a = applicant || {}
  const platform = a.platform || '抖音'
  const lb = labels(platform)
  const prof = resolveApplicantMemberProfile(a, reg)
  if (lb.showSalesLevel) {
    const level = String(a.douyinSalesLevel || prof?.douyinSalesLevel || '').trim()
    return level || '—'
  }
  if (lb.showTalentGrade) {
    const grade = String(a.talentGrade || prof?.talentGrade || '').trim()
    return grade || '—'
  }
  return '—'
}

function resolveApplicantVideoUploadStatus(applicant) {
  const a = applicant || {}
  const url = String(a.videoUrl || '').trim()
  const status = String(a.videoStatus || '').trim()
  if (!url) return { label: '未上传', tone: 'muted' }
  if (status === 'draft') return { label: '已上传待提交', tone: 'uploaded' }
  if (status === 'passed') return { label: '视频审核通过', tone: 'passed' }
  if (status === 'rejected') return { label: '视频驳回待重新回传', tone: 'rejected' }
  return { label: '已上传待审核', tone: 'uploaded' }
}

function enrichApplicantRow(applicant, index, reg) {
  const a = applicant || {}
  const profileLink = resolveApplicantProfileLinkRaw(a, reg) || String(a.profileLink || '').trim()
  const platform = a.platform || '抖音'
  const followers = a.followers != null ? a.followers : '—'
  let fansText = followers
  const n = Number(followers)
  if (Number.isFinite(n) && n >= 10000) fansText = `${(n / 10000).toFixed(1)}万`
  else if (Number.isFinite(n)) fansText = `${n}`

  const accountTags = resolveApplicantAccountTags(a, reg)
  const displaySalesLevel = resolveDisplaySalesLevel(a, reg)
  const prof = resolveApplicantMemberProfile(a, reg)
  const douyinSalesLevel =
    String(a.douyinSalesLevel || '').trim() ||
    (prof && prof.douyinSalesLevel) ||
    ''
  const videoUpload = resolveApplicantVideoUploadStatus(a)

  return {
    ...a,
    index: index + 1,
    displayName: a.platformNickname || a.name || '未填写昵称',
    displayFollowers: fansText,
    displayPlatform: platform,
    platformIcon: hallFilters.platformIcon(platform),
    displayAppliedAt: a.appliedAt || '—',
    displaySalesLevel,
    accountTags,
    hasAccountTags: accountTags.length > 0,
    douyinSalesLevel: douyinSalesLevel || a.douyinSalesLevel,
    videoUploadLabel: videoUpload.label,
    videoUploadTone: videoUpload.tone,
    avatar: resolveApplicantAvatar(a, reg),
    profileLink,
    hasProfileLink: !!profileLink,
    profileLinkShort: profileLink.length > 36 ? `${profileLink.slice(0, 34)}…` : profileLink,
  }
}

function resolveApplicantOnMp(mp, applicantId) {
  if (!mp || !applicantId) return null
  const list = Array.isArray(mp.applicants) ? mp.applicants : []
  return list.find((a) => a && String(a.id) === String(applicantId)) || null
}

/** 达人「我的报名」列表行 */
function enrichTalentApplicationRow(localApp, mp, reg) {
  const merchant = reg ? display.findMerchantOrder(reg, mp?.sourceMerchantOrderId) : null
  const view = mp ? display.enrichMpOrder(mp, merchant) : null
  const platform = deliveryReview.resolveOrderPlatformFromMp(mp, view?.platform || '抖音')
  let applicantId = String(localApp.applicantId || '').trim()
  if (!applicantId && mp) {
    const found = talentContactPrGate.findMyApplicant(mp, localApp.mpOrderId)
    if (found && found.id) applicantId = String(found.id)
  }
  const me = resolveApplicantOnMp(mp, applicantId) || (mp ? talentContactPrGate.findMyApplicant(mp, localApp.mpOrderId) : null)
  if (me && me.id) applicantId = String(me.id).trim()
  const isIce = mp ? isIceMpOrder(mp) : /^MP-ICE-/i.test(String(localApp.mpOrderId || ''))
  const orderType = resolveOrderTypeFromMp(mp, localApp)
  const isUrgent = !!(mp && mp.urgent && !isIce)
  const videoStatus = me && me.videoStatus ? String(me.videoStatus) : ''
  const videoRejectReason = me && me.videoRejectReason ? String(me.videoRejectReason) : ''
  const visitVideoUrl = me ? String(me.videoUrl || '').trim() : ''
  const canViewVideo = !isIce && !!visitVideoUrl
  const canUploadVideo = talentAppStatus.canTalentUploadRecruitmentVideo(mp, me, isIce)
  const canSubmitVideo = talentAppStatus.canTalentSubmitRecruitmentVideo(mp, me, isIce)
  const canReuploadVideo = talentAppStatus.canTalentReuploadRecruitmentVideo(mp, me, isIce)
  const canSubmitPublishLink = talentAppStatus.canTalentSubmitVisitPublishLink(mp, me, isIce)
  const visitPublishPhase = talentAppStatus.resolveVisitPublishPhase(me)
  const isScript = deliveryReview.isScriptReviewPlatform(platform)
  const scriptStatus = me && me.scriptStatus ? String(me.scriptStatus) : ''
  const scriptRejectReason = me && me.scriptRejectReason ? String(me.scriptRejectReason) : ''
  const scriptUrl = me ? String(me.scriptUrl || '').trim() : ''
  const scriptLinkUrl = me ? String(me.scriptLinkUrl || '').trim() : ''
  const canUploadScript = talentAppStatus.canTalentUploadRecruitmentScript(mp, me, isIce)
  const canSubmitScript = talentAppStatus.canTalentSubmitRecruitmentScript(mp, me, isIce)
  const progress = talentAppStatus.resolveTalentApplicationProgress(mp, me, localApp.mpOrderId)
  const notifiedIds = applicantListExtras.buildNotifiedApplicantIdSet(reg, localApp.mpOrderId, mp)
  const selectionNotified = !!(me && notifiedIds.has(String(me.id || '')))
  const displayStatus = talentAppStatus.resolveApplicationDisplayStatus(mp, me, localApp.mpOrderId, {
    selectionNotified,
    isIce,
  })
  const iceVerifyMode = mp ? getIceVerifyMode(mp) : 'ai'
  let iceActionLabel = ''
  if (isIce) {
    if (progress.id === 'completed') iceActionLabel = ''
    else if (me && me.taskStatus === 'pending_confirm') iceActionLabel = '确认接收'
    else if (me && String(me.assignedVideoDownloadUrl || '').trim() && me.aiVerifyStatus !== 'passed' && me.videoStatus !== 'passed') {
      iceActionLabel = me.aiVerifyStatus === 'failed' || me.videoStatus === 'rejected' ? '重新提交链接' : '提交链接'
    } else iceActionLabel = '查看云剪任务'
  }
  const category = view?.category || mp?.category || '其他'
  return {
    ...localApp,
    mpOrderId: localApp.mpOrderId,
    applicantId,
    title: view?.title || localApp.title || mp?.title || localApp.mpOrderId,
    platform,
    platformIcon: hallFilters.platformIcon(platform),
    region: view?.region || mp?.region || '—',
    category,
    storeName: view?.storeName || mp?.storeName || '—',
    merchantName: view?.merchantName || mp?.customerName || '—',
    budgetText: view?.budgetText || mp?.budgetText || '面议',
    hallLabel: hallLabelFromMp(mp),
    status: mp?.status || 'unknown',
    statusLabel: statusLabel(mp?.status),
    appliedAt: localApp.appliedAt || '—',
    merchantOrderNo: view?.merchantOrderNo || mp?.sourceMerchantOrderId || '',
    videoStatus,
    videoRejectReason,
    visitVideoUrl,
    canViewVideo,
    canUploadVideo,
    canSubmitVideo,
    canReuploadVideo,
    canSubmitPublishLink,
    scriptStatus,
    scriptRejectReason,
    scriptUrl,
    scriptLinkUrl,
    canUploadScript,
    canSubmitScript,
    isScriptOrder: isScript,
    visitPublishPhase,
    isIce,
    isUrgent,
    orderTypeId: orderType.id,
    orderTypeLabel: orderType.label,
    iceActionLabel,
    progressId: progress.id,
    progressLabel: progress.label,
    progressMp: mp || null,
    progressMe: me || null,
    selectionNotified,
    displayTabId: displayStatus.tabId,
    displayStatusLabel: displayStatus.label,
    displayStatusTone: displayStatus.tone,
    showConfirmBtn: displayStatus.showConfirmBtn,
    showAssignConfirmBtn: displayStatus.showAssignConfirmBtn,
    showCheckInBtn: displayStatus.showCheckInBtn,
    checkInReady: displayStatus.checkInReady,
    showConfirmVisitBtn: displayStatus.showConfirmVisitBtn,
    showEditVisitBtn: displayStatus.showEditVisitBtn,
    editVisitMode: displayStatus.editVisitMode,
    visitHint: displayStatus.visitHint,
    videoStatusLabel: isScript
      ? scriptStatus
        ? scriptUpload.scriptStatusLabel(scriptStatus) || displayStatus.label
        : displayStatus.label
      : isIce
      ? progress.id === 'completed'
        ? ''
        : me && me.aiVerifyStatus === 'failed'
          ? 'AI 核查未通过'
          : me && me.videoStatus === 'rejected'
            ? '链接已驳回'
            : me && iceVerifyMode === 'pr' && (me.aiVerifyStatus === 'pending' || me.videoStatus === 'pending')
              ? '待 PR 审核链接'
              : me && iceVerifyMode === 'ai' && me.aiVerifyStatus === 'pending' && String(me.douyinPublishUrl || '').trim()
                ? 'AI 核查中'
                : ''
      : videoStatus
      ? visitPublishPhase === 'awaiting_link'
        ? '待回传链接'
        : visitPublishPhase === 'ai_pending'
          ? 'AI核查中'
          : visitPublishPhase === 'link_failed'
            ? '链接未通过'
            : videoStatus === 'passed'
              ? '视频已通过'
              : videoStatus === 'draft'
                ? '待提交审核'
              : videoStatus === 'rejected'
                ? '视频已驳回'
                : 'PR审核中'
      : '',
    publishLinkBtnLabel: visitPublishPhase === 'link_failed' ? '重新提交链接' : '回传发布链接',
    uploadBtnLabel: isScript
      ? scriptStatus === 'rejected'
        ? '重新上传文稿'
        : '上传文稿'
      : videoStatus === 'rejected'
        ? '重新上传视频'
        : '上传视频',
  }
}

function buildApplicantTalentMeta(row) {
  const parts = []
  const fans = String((row && row.displayFollowers) || '').trim()
  const level = String((row && row.displaySalesLevel) || '').trim()
  if (fans && fans !== '—') parts.push(`粉丝 ${fans}`)
  if (level && level !== '—') parts.push(`带货 ${level}`)
  return parts.join(' · ')
}

module.exports = {
  MP_STATUS_LABEL,
  statusLabel,
  hallLabelFromMp,
  normalizeProfileUrl,
  resolveApplicantProfileLinkRaw,
  copyTalentProfileLink,
  openTalentProfileLink,
  resolveApplicantAvatar,
  enrichApplicantRow,
  enrichTalentApplicationRow,
  buildApplicantTalentMeta,
  resolveApplicantVideoUploadStatus,
}

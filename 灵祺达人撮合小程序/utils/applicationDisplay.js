const display = require('./recruitmentDisplay.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const hallFilters = require('./recruitmentHallFilters.js')
const talentContactPrGate = require('./talentContactPrGate.js')
const memberStore = require('./talentMember.js')
const { labels } = require('./platformLabels.js')
const { TALENT_TAGS } = require('./publishFormOptions.js')

const MP_STATUS_LABEL = {
  open: '招募中',
  collecting: '收集中',
  pending_settlement: '待结算',
  closed: '已停止',
  done: '已完成',
  unknown: '未知',
}

function statusLabel(status) {
  return MP_STATUS_LABEL[status] || status || '—'
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

/** 复制链接并提示（小程序内打开外链受限） */
function openTalentProfileLink(url, platform) {
  const link = normalizeProfileUrl(url)
  if (!link) {
    wx.showToast({ title: '未填写主页链接', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: link,
    success() {
      const plat = platform ? `「${platform}」` : ''
      wx.showModal({
        title: '达人主页',
        content: `${plat}主页链接已复制。请粘贴到微信或${plat || '对应'} App 中打开查看。`,
        showCancel: false,
        confirmText: '知道了',
      })
    },
  })
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

function enrichApplicantRow(applicant, index, reg) {
  const a = applicant || {}
  const profileLink = String(a.profileLink || '').trim()
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
  const platform = view?.platform || mp?.platform || localApp?.platform || '抖音'
  let applicantId = String(localApp.applicantId || '').trim()
  if (!applicantId && mp) {
    const found = talentContactPrGate.findMyApplicant(mp, localApp.mpOrderId)
    if (found && found.id) applicantId = String(found.id)
  }
  const me = resolveApplicantOnMp(mp, applicantId)
  const videoStatus = me && me.videoStatus ? String(me.videoStatus) : ''
  const videoRejectReason = me && me.videoRejectReason ? String(me.videoRejectReason) : ''
  const canUploadVideo = !videoStatus || videoStatus === 'rejected'
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
    canUploadVideo,
    videoStatusLabel: videoStatus
      ? videoStatus === 'passed'
        ? '视频已通过'
        : videoStatus === 'rejected'
          ? '视频已驳回'
          : '视频待审核'
      : '',
    uploadBtnLabel: videoStatus === 'rejected' ? '重新上传视频' : '上传视频',
  }
}

module.exports = {
  MP_STATUS_LABEL,
  statusLabel,
  hallLabelFromMp,
  normalizeProfileUrl,
  openTalentProfileLink,
  resolveApplicantAvatar,
  enrichApplicantRow,
  enrichTalentApplicationRow,
}

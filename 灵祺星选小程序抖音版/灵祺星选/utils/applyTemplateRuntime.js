const { labels } = require('./platformLabels.js')
const { validateRegion } = require('./regionPicker.js')
const memberStore = require('./talentMember.js')
const talentPlatforms = require('./talentPlatformProfiles.js')

function getValue(data, row) {
  if (!row.bindKey.startsWith('custom_')) return data[row.bindKey]
  const cf = data.customFields || {}
  return cf[row.bindKey] != null ? cf[row.bindKey] : cf[row.id]
}

function validateApplyRows(rows, data, platform, options) {
  const isIce = options && options.isIceMode
  const lb = labels(platform)
  for (const row of rows) {
    if (!row.required) continue
    const val = getValue(data, row)
    const s = String(val == null ? '' : val).trim()
    if (row.role === 'followers') {
      const n = Number.parseInt(s.replace(/,/g, ''), 10)
      if (!Number.isFinite(n) || n <= 0) return `请填写有效${row.displayLabel}`
      continue
    }
    if (row.role === 'likesCollects') {
      const n = Number.parseInt(s.replace(/,/g, ''), 10)
      if (!Number.isFinite(n) || n < 0) return `请填写有效${row.displayLabel}`
      continue
    }
    if (!s) return `请填写${row.displayLabel}`
    if (row.role === 'douyinSalesLevel' && lb.showSalesLevel && !s) {
      return '请选择抖音带货等级'
    }
  }
  const hasProv = rows.some((r) => r.role === 'province')
  const hasCity = rows.some((r) => r.role === 'city')
  if (hasProv || hasCity) {
    const regionErr = validateRegion(data.province, data.city)
    if (regionErr) return regionErr
  }
  if (!isIce) {
    const hasVisit = rows.some((r) => r.role === 'visitDate')
    if (hasVisit) {
      if (!data.visitDate || !data.visitTimeStart || !data.visitTimeEnd) {
        return '请选择探店日期与时间段'
      }
      if (data.visitTimeStart >= data.visitTimeEnd) return '探店结束时间须晚于开始时间'
    }
  }
  return null
}

function buildApplicantFromRows(rows, data, meta) {
  const platform = meta.platform
  const lb = labels(platform)
  const isSupplier = !!meta.isSupplierApply
  const teamName = String(data.teamName || '').trim()
  const platformNickname = String(data.platformNickname || '').trim()
  const displayName = isSupplier
    ? teamName || String(data.contact || '').trim() || platformNickname
    : platformNickname
  const portfolioLink = String(data.portfolioLink || data.profileLink || '').trim()
  const followers = Number.parseInt(String(data.followers || '').replace(/,/g, ''), 10)
  const visitTimeSlot = meta.isIceMode
    ? '云剪任务·无需探店'
    : `${data.visitDate || ''} ${data.visitTimeStart || ''}-${data.visitTimeEnd || ''}`.trim()
  const alipayAccount = String(data.alipayAccount || '').trim()
  const customFields = {}
  for (const row of rows) {
    if (!row.bindKey.startsWith('custom_')) continue
    const v = getValue(data, row)
    if (v != null && String(v).trim()) customFields[row.displayLabel || row.id] = String(v).trim()
  }
  const applicant = {
    id: meta.applicantId,
    name: displayName,
    platform: isSupplier
      ? meta.supplierWorkId === 'shoot'
        ? '拍摄团队'
        : '剪辑团队'
      : platform,
    platformAccount: String(data.platformAccount || '').trim(),
    platformNickname: isSupplier ? displayName : platformNickname,
    profileLink: portfolioLink,
    followers: Number.isFinite(followers) ? Math.max(0, followers) : 0,
    contact: String(data.contact || '').trim(),
    wechatId: String(data.wechatId || '').trim(),
    mpOrderId: meta.mpOrderId,
    merchantOrderNo: meta.merchantOrderNo,
    province: String(data.province || '').trim(),
    city: String(data.city || '').trim(),
    appliedAt: meta.appliedAt,
  }
  if (teamName) applicant.teamName = teamName
  if (portfolioLink) applicant.portfolioLink = portfolioLink
  if (data.editStyles != null && String(data.editStyles).trim()) {
    applicant.editStyles = String(data.editStyles).trim()
  }
  if (data.software != null && String(data.software).trim()) {
    applicant.software = String(data.software).trim()
  }
  if (data.deliveryEta != null && String(data.deliveryEta).trim()) {
    applicant.deliveryEta = String(data.deliveryEta).trim()
  }
  if (data.shootTypes != null && String(data.shootTypes).trim()) {
    applicant.shootTypes = String(data.shootTypes).trim()
  }
  if (data.equipment != null && String(data.equipment).trim()) {
    applicant.equipment = String(data.equipment).trim()
  }
  if (data.shootDate != null && String(data.shootDate).trim()) {
    applicant.shootDate = String(data.shootDate).trim()
  }
  if (data.likesCollects != null && String(data.likesCollects).trim()) {
    applicant.likesCollects = Number.parseInt(String(data.likesCollects).replace(/,/g, ''), 10) || 0
  }
  if (lb.showSalesLevel && data.douyinSalesLevel) {
    applicant.douyinSalesLevel = String(data.douyinSalesLevel || '').trim()
  }
  if (data.quotePrice != null && String(data.quotePrice).trim()) {
    applicant.quotePrice = meta.isIceMode ? '云剪' : String(data.quotePrice).trim()
  }
  if (visitTimeSlot && !meta.isIceMode) applicant.visitTimeSlot = visitTimeSlot
  if (!meta.isIceMode && alipayAccount) {
    applicant.alipayAccount = alipayAccount
    applicant.paymentMethod = `支付宝：${alipayAccount}`
  }
  if (meta.isIceMode) {
    applicant.paymentMethod = '云剪任务'
    applicant.quotePrice = applicant.quotePrice || '云剪'
  }
  if (Object.keys(customFields).length) applicant.customFields = customFields
  const member = memberStore.readMember()
  if (member) {
    if (member.id) applicant.talentMemberId = String(member.id).trim()
    if (member.wxAvatarUrl) {
      applicant.avatar = String(member.wxAvatarUrl).trim()
      applicant.wxAvatarUrl = applicant.avatar
    }
    if (!isSupplier) {
      const pid = talentPlatforms.platformIdFromName(platform)
      const prof = member.platformProfiles && member.platformProfiles[pid]
      if (prof) {
        const tags = Array.isArray(prof.accountTags) ? prof.accountTags : []
        if (tags.length) applicant.accountTags = [...tags]
        if (!applicant.douyinSalesLevel && lb.showSalesLevel && prof.douyinSalesLevel) {
          applicant.douyinSalesLevel = String(prof.douyinSalesLevel).trim()
        }
        if (!applicant.talentGrade && lb.showTalentGrade && prof.talentGrade) {
          applicant.talentGrade = String(prof.talentGrade).trim()
        }
      }
    }
  }
  return applicant
}

module.exports = { getValue, validateApplyRows, buildApplicantFromRows }

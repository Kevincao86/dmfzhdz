import { labels } from './platformLabels'
import { validateRegion } from './regionPicker'
import { readMember } from './talentMember'
import { platformIdFromName } from './talentPlatformProfiles'
import type { ApplyRow } from './applyFormTemplates'

function getValue(data: Record<string, unknown>, row: ApplyRow) {
  if (!row.bindKey.startsWith('custom_')) return data[row.bindKey]
  const cf = (data.customFields || {}) as Record<string, unknown>
  return cf[row.bindKey] != null ? cf[row.bindKey] : cf[row.id]
}

export function validateApplyRows(
  rows: ApplyRow[],
  data: Record<string, unknown>,
  platform: string,
  options?: { isIceMode?: boolean; isSupplierApply?: boolean },
): string | null {
  const isIce = options?.isIceMode
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
    const regionErr = validateRegion(String(data.province || ''), String(data.city || ''))
    if (regionErr) return regionErr
  }
  if (!isIce) {
    const hasVisit = rows.some((r) => r.role === 'visitDate')
    if (hasVisit) {
      if (!data.visitDate || !data.visitTimeStart || !data.visitTimeEnd) {
        return '请选择探店日期与时间段'
      }
      if (String(data.visitTimeStart) >= String(data.visitTimeEnd)) {
        return '探店结束时间须晚于开始时间'
      }
    }
  }
  return null
}

export function buildApplicantFromRows(
  rows: ApplyRow[],
  data: Record<string, unknown>,
  meta: {
    platform: string
    isIceMode?: boolean
    isSupplierApply?: boolean
    supplierWorkId?: string
    mpOrderId: string
    merchantOrderNo: string
    applicantId: string
    appliedAt: string
  },
) {
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
  const customFields: Record<string, string> = {}
  for (const row of rows) {
    if (!row.bindKey.startsWith('custom_')) continue
    const v = getValue(data, row)
    if (v != null && String(v).trim()) customFields[row.displayLabel || row.id] = String(v).trim()
  }
  const applicant: Record<string, unknown> = {
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
  if (lb.showSalesLevel && data.douyinSalesLevel) {
    applicant.douyinSalesLevel = String(data.douyinSalesLevel).trim()
  }
  if (data.quotePrice != null && String(data.quotePrice).trim()) {
    applicant.quotePrice = meta.isIceMode ? '云剪' : String(data.quotePrice).trim()
  }
  if (visitTimeSlot && !meta.isIceMode) applicant.visitTimeSlot = visitTimeSlot
  if (!meta.isIceMode && data.alipayAccount) {
    applicant.alipayAccount = String(data.alipayAccount).trim()
    applicant.paymentMethod = `支付宝：${data.alipayAccount}`
  }
  if (meta.isIceMode) {
    applicant.paymentMethod = '云剪任务'
    applicant.quotePrice = applicant.quotePrice || '云剪'
  }
  if (Object.keys(customFields).length) applicant.customFields = customFields
  const member = readMember()
  if (member?.id) applicant.talentMemberId = String(member.id).trim()
  if (member?.wxAvatarUrl) {
    applicant.avatar = String(member.wxAvatarUrl).trim()
    applicant.wxAvatarUrl = applicant.avatar
  }
  if (!isSupplier) {
    const pid = platformIdFromName(platform)
    const prof = member?.platformProfiles?.[pid]
    if (prof) {
      const tags = Array.isArray(prof.accountTags) ? prof.accountTags : []
      if (tags.length) applicant.accountTags = [...tags]
    }
  }
  return applicant
}

const listFilters = require('./recruitmentListFilters.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')
const orderHighlightTag = require('./orderHighlightTag.js')
const recruitmentAiTags = require('./recruitmentAiTags.js')

function buildNotifiedApplicantIdSet(reg, mpOrderId) {
  const inbox = Array.isArray(reg && reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const set = new Set()
  const orderId = String(mpOrderId || '').trim()
  if (!orderId) return set
  for (let i = 0; i < inbox.length; i++) {
    const r = inbox[i]
    if (!r || String(r.mpOrderId || '') !== orderId) continue
    const aid = String(r.applicantId || '').trim()
    if (!aid) continue
    if (r.noticeType === 'selection' || /恭喜入选/.test(String(r.title || ''))) {
      set.add(aid)
    }
  }
  return set
}

function orderMatchPayloadFromMp(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const recruitTarget = recruitTargetFromMp(mp)
  return {
    id: String(mp.id || ''),
    title: String(mp.title || ''),
    platform: String(mp.platform || '抖音'),
    region: String(mp.region || ''),
    category: String(mp.category || ''),
    categoryTagsText: listFilters.resolveRequiredCategoryTagsText(mp, String(mp.category || '')),
    budgetText: String(mp.budgetText || ''),
    fansRequirement: String(mp.fansRequirement || '不限'),
    recruitTarget,
    urgent: !!mp.urgent,
    summary: String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 120),
    talentTags: Array.isArray(meta.talentTags) ? meta.talentTags : [],
    recruitmentInfo: String(mp.recruitmentInfo || ''),
    merchantRequirements: String(mp.merchantRequirements || ''),
    taskDetail: String(mp.taskDetail || ''),
    recruitContent: orderHighlightTag.buildRecruitContentForAi(mp),
  }
}

function applicantTalentProfileFromRow(applicant, recruitTarget) {
  const a = applicant || {}
  const province = String(a.province || '').trim()
  const city = String(a.city || '').trim()
  const region = String(a.region || '').trim()
  const parts = region.split('·').map((s) => s.trim())
  return {
    id: String(a.id || ''),
    platform: String(a.platform || '抖音'),
    followers: a.followers,
    followersRaw: a.followers,
    region: province && city ? `${province}·${city}` : region,
    city: city || parts[1] || parts[0] || '',
    province: province || parts[0] || '',
    accountTags: Array.isArray(a.accountTags) ? a.accountTags : [],
    tags: Array.isArray(a.accountTags) ? a.accountTags : [],
    douyinSalesLevel: String(a.douyinSalesLevel || '').trim(),
  }
}

function enrichApplicantWithExtras(row, notifiedIds, orderPayload) {
  const id = String((row && row.id) || '')
  const recruitTarget = String((orderPayload && orderPayload.recruitTarget) || 'talent')
  const board = recruitTarget === 'shoot' ? 'shoot' : recruitTarget === 'edit' ? 'edit' : 'talent'
  const talent = applicantTalentProfileFromRow(row, recruitTarget)
  const fb = recruitmentAiTags.fallbackTalentScore(talent, [orderPayload], board)
  return {
    ...row,
    selectionNotified: notifiedIds.has(id),
    matchScore: fb.score || 0,
  }
}

function collectApplicantTagOptions(rows) {
  const set = new Set()
  for (let i = 0; i < (rows || []).length; i++) {
    const tags = Array.isArray(rows[i].accountTags) ? rows[i].accountTags : []
    for (let j = 0; j < tags.length; j++) {
      const s = String(tags[j] || '').trim()
      if (s) set.add(s)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function collectSalesLevelOptions(rows) {
  const set = new Set()
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i]
    for (const raw of [r.douyinSalesLevel, r.displaySalesLevel]) {
      const lv = String(raw || '').trim()
      if (lv && lv !== '—') set.add(lv)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function normalizeSearchDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

function salesLevelMatches(row, filterLevel) {
  const want = String(filterLevel || '').trim().toLowerCase()
  if (!want) return true
  for (const raw of [row.douyinSalesLevel, row.displaySalesLevel]) {
    const lv = String(raw || '').trim().toLowerCase()
    if (lv === want || lv.indexOf(want) >= 0) return true
  }
  return false
}

function filterApplicantRows(rows, filters) {
  const f = filters || {}
  const idQ = String(f.searchPlatformAccount || '').trim().toLowerCase()
  const nickQ = String(f.searchNickname || '').trim().toLowerCase()
  const phoneQ = normalizeSearchDigits(f.searchContact || '')
  const salesLv = String(f.filterSalesLevel || '').trim()
  const tag = String(f.filterTag || '').trim()
  const notified = f.filterNotified || ''

  return (rows || []).filter((r) => {
    if (idQ) {
      const acct = String(r.platformAccount || '').trim().toLowerCase()
      if (acct.indexOf(idQ) < 0) return false
    }
    if (nickQ) {
      const name = String(r.displayName || r.platformNickname || r.name || '')
        .trim()
        .toLowerCase()
      if (name.indexOf(nickQ) < 0) return false
    }
    if (phoneQ) {
      const digits = normalizeSearchDigits(String(r.contact || ''))
      if (digits.indexOf(phoneQ) < 0) return false
    }
    if (salesLv && !salesLevelMatches(r, salesLv)) return false
    if (tag) {
      const tags = Array.isArray(r.accountTags) ? r.accountTags : []
      if (tags.indexOf(tag) < 0) return false
    }
    if (notified === 'yes' && !r.selectionNotified) return false
    if (notified === 'no' && r.selectionNotified) return false
    return true
  })
}

function sortApplicantsByMatchScore(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0) ||
      (Number(a.index) || 0) - (Number(b.index) || 0),
  )
}

function enrichAndSortApplicants(rows, reg, mp, mpOrderId) {
  const notifiedIds = buildNotifiedApplicantIdSet(reg, mpOrderId)
  const orderPayload = orderMatchPayloadFromMp(mp)
  const enriched = (rows || []).map((row) => enrichApplicantWithExtras(row, notifiedIds, orderPayload))
  return sortApplicantsByMatchScore(enriched)
}

module.exports = {
  buildNotifiedApplicantIdSet,
  orderMatchPayloadFromMp,
  enrichApplicantWithExtras,
  enrichAndSortApplicants,
  collectApplicantTagOptions,
  collectSalesLevelOptions,
  filterApplicantRows,
  sortApplicantsByMatchScore,
  normalizeSearchDigits,
}

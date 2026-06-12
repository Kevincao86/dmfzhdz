const listFilters = require('./recruitmentListFilters.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')
const orderHighlightTag = require('./orderHighlightTag.js')
const recruitmentAiTags = require('./recruitmentAiTags.js')

function buildNotifiedApplicantIdSet(reg, mpOrderId, mp) {
  const set = new Set()
  const orderId = String(mpOrderId || '').trim()
  if (!orderId) return set

  const fromOrder = mp && mp.notifiedApplicantIds
  if (Array.isArray(fromOrder)) {
    for (let i = 0; i < fromOrder.length; i++) {
      const s = String(fromOrder[i] || '').trim()
      if (s) set.add(s)
    }
  }

  const inbox = Array.isArray(reg && reg.mpTalentInbox) ? reg.mpTalentInbox : []
  for (let i = 0; i < inbox.length; i++) {
    const r = inbox[i]
    if (!r || String(r.mpOrderId || '') !== orderId) continue
    if (r.noticeType !== 'selection' && !/恭喜入选/.test(String(r.title || ''))) continue
    const aid = String(r.applicantId || '').trim()
    if (aid) {
      set.add(aid)
      continue
    }
    const contact = String(r.contact || '').replace(/\D/g, '').slice(-11)
    const acct = String(r.platformAccount || '').trim().toLowerCase()
    const applicants = mp && Array.isArray(mp.applicants) ? mp.applicants : []
    for (let j = 0; j < applicants.length; j++) {
      const a = applicants[j]
      if (!a) continue
      const aContact = String(a.contact || '').replace(/\D/g, '').slice(-11)
      const aAcct = String(a.platformAccount || '').trim().toLowerCase()
      if ((contact && aContact && contact === aContact) || (acct && aAcct && acct === aAcct)) {
        const id = String(a.id || '').trim()
        if (id) set.add(id)
      }
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

function rowMatchesSearchQuery(row, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const phoneQ = normalizeSearchDigits(query)
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  const name = String(row.displayName || row.platformNickname || row.name || '')
    .trim()
    .toLowerCase()
  const contact = normalizeSearchDigits(String(row.contact || ''))
  const wechat = String(row.wechatId || '').trim().toLowerCase()
  if (acct.indexOf(q) >= 0) return true
  if (name.indexOf(q) >= 0) return true
  if (phoneQ && contact.indexOf(phoneQ) >= 0) return true
  if (wechat.indexOf(q) >= 0) return true
  return false
}

function filterApplicantRows(rows, filters) {
  const f = filters || {}
  const searchQ = String(f.searchQuery || '').trim()
  const salesLv = String(f.filterSalesLevel || '').trim()
  const tag = String(f.filterTag || '').trim()
  const notified = f.filterNotified || ''

  return (rows || []).filter((r) => {
    if (searchQ && !rowMatchesSearchQuery(r, searchQ)) return false
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
  const notifiedIds = buildNotifiedApplicantIdSet(reg, mpOrderId, mp)
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

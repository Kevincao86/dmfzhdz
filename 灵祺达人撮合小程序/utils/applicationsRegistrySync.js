/**
 * 从 ECS 注册表回填「我的报名」：详情页能识别已报名但本地列表为空时同步。
 */
const applicationsStore = require('./applicationsStore.js')
const talentContactPrGate = require('./talentContactPrGate.js')
const talentMember = require('./talentMember.js')

function applicationFromMpOrder(mp, applicant) {
  if (!mp || !applicant) return null
  const mpOrderId = String(mp.id || '').trim()
  const applicantId = String(applicant.id || '').trim()
  if (!mpOrderId || !applicantId) return null
  return {
    mpOrderId,
    applicantId,
    title: String(mp.title || mp.sourceMerchantOrderId || mpOrderId).trim(),
    platform: String(applicant.platform || mp.platform || '抖音').trim(),
    appliedAt: String(applicant.appliedAt || mp.updatedAt || '').trim(),
  }
}

function listApplicationsFromRegistry(reg, member) {
  if (!reg) return []
  const m = member || talentMember.readMember()
  if (!m) return []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const rows = []
  const seen = new Set()
  for (let i = 0; i < mpList.length; i++) {
    const mp = mpList[i]
    if (!mp || !mp.id) continue
    const applicant = talentContactPrGate.findMyApplicant(mp, mp.id)
    if (!applicant) continue
    const entry = applicationFromMpOrder(mp, applicant)
    if (!entry || seen.has(entry.mpOrderId)) continue
    seen.add(entry.mpOrderId)
    rows.push(entry)
  }
  return rows
}

/** @returns {{ added: number, updated: number, total: number }} */
function reconcileApplicationsFromRegistry(reg, member) {
  const remote = listApplicationsFromRegistry(reg, member)
  if (!remote.length) {
    return { added: 0, updated: 0, total: applicationsStore.readApplications().length }
  }
  let added = 0
  let updated = 0
  for (let i = 0; i < remote.length; i++) {
    const row = remote[i]
    const r = applicationsStore.upsertApplication(row)
    if (r === 'added') added += 1
    else if (r === 'updated') updated += 1
  }
  return { added, updated, total: applicationsStore.readApplications().length }
}

const talentInboxMatch = require('./talentInboxMatch.js')

function collectMissingApplicationOrderIds(reg, member) {
  if (!reg || !member) return []
  const keys = talentInboxMatch.talentMatchKeys(member)
  const ids = new Set()
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  for (let i = 0; i < inbox.length; i++) {
    const row = inbox[i]
    if (!row || !row.mpOrderId) continue
    if (talentInboxMatch.inboxRowMatchesTalent(row, keys, member)) {
      ids.add(String(row.mpOrderId).trim())
    }
  }
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const loaded = new Set(mpList.filter(Boolean).map((o) => String(o.id)))
  const missing = []
  for (const id of ids) {
    if (id && !loaded.has(id)) missing.push(id)
  }
  return missing.slice(0, 120)
}

/** 拉注册表并回填报名（含站内信关联的历史单） */
async function fetchRegistryAndReconcileApplications(fetchOpts) {
  const ops = require('./opsRegistryTalentMp.js')
  const member = talentMember.readMember()
  let reg = await ops.fetchRegistry(fetchOpts || { includeLocalContext: true })
  reconcileApplicationsFromRegistry(reg, member)
  const extraIds = collectMissingApplicationOrderIds(reg, member)
  if (extraIds.length) {
    reg = await ops.fetchRegistry({
      includeMpOrderIds: extraIds,
      includeLocalContext: true,
    })
    reconcileApplicationsFromRegistry(reg, member)
  }
  return reg
}

module.exports = {
  listApplicationsFromRegistry,
  reconcileApplicationsFromRegistry,
  collectMissingApplicationOrderIds,
  fetchRegistryAndReconcileApplications,
}

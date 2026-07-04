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
    platform: String(mp.platform || mp.recruitmentPlatform || applicant.platform || '抖音').trim(),
    appliedAt: String(applicant.appliedAt || mp.updatedAt || '').trim(),
  }
}

function listApplicationsFromRegistry(reg) {
  if (!reg) return []
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

function collectIceClaimedOrderIds() {
  const ids = []
  try {
    const info = wx.getStorageSync ? wx.getStorageInfoSync() : { keys: [] }
    const prefix = 'meoo_ice_applicant_v1_'
    const keys = Array.isArray(info.keys) ? info.keys : []
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (!k || k.indexOf(prefix) !== 0) continue
      const id = String(k.slice(prefix.length) || '').trim()
      if (id) ids.push(id)
    }
  } catch (_) {}
  return ids
}

/** @returns {{ added: number, updated: number, total: number }} */
function reconcileApplicationsFromRegistry(reg) {
  const remote = listApplicationsFromRegistry(reg)
  const localList = applicationsStore.readApplications()
  let added = 0
  let updated = 0
  for (let i = 0; i < remote.length; i++) {
    const row = remote[i]
    const local = localList.find((a) => a && String(a.mpOrderId || '').trim() === String(row.mpOrderId || '').trim())
    if (local && String(local.withdrawnAt || '').trim()) continue
    const r = applicationsStore.upsertApplication(row)
    if (r === 'added') added += 1
    else if (r === 'updated') updated += 1
  }
  return { added, updated, total: applicationsStore.readApplications().length }
}

function syncWithdrawnApplicationsFromRegistry(reg) {
  const mpList = Array.isArray(reg && reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const localList = applicationsStore.readApplications()
  for (let i = 0; i < localList.length; i++) {
    const local = localList[i]
    if (!local || String(local.withdrawnAt || '').trim()) continue
    const id = String(local.mpOrderId || '').trim()
    if (!id) continue
    const mp = mpList.find((o) => o && String(o.id) === id)
    if (!mp) continue
    if (!talentContactPrGate.findMyApplicant(mp, id)) {
      applicationsStore.markApplicationWithdrawn(id)
    }
  }
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
  const baseOpts = fetchOpts || { includeLocalContext: true }
  const iceIds = collectIceClaimedOrderIds()
  const mergedIds = [
    ...new Set([
      ...((baseOpts && baseOpts.includeMpOrderIds) || []),
      ...iceIds,
    ]),
  ].slice(0, 120)
  const firstOpts =
    mergedIds.length > 0
      ? { ...baseOpts, includeMpOrderIds: mergedIds, includeLocalContext: true }
      : baseOpts
  let reg = await ops.fetchRegistry(firstOpts)
  reconcileApplicationsFromRegistry(reg)
  syncWithdrawnApplicationsFromRegistry(reg)
  const extraIds = [
    ...new Set([...collectMissingApplicationOrderIds(reg, member), ...iceIds]),
  ].filter((id) => {
    const loaded = new Set((reg.mpRecruitmentOrders || []).filter(Boolean).map((o) => String(o.id)))
    return id && !loaded.has(id)
  })
  if (extraIds.length) {
    reg = await ops.fetchRegistry({
      includeMpOrderIds: extraIds.slice(0, 120),
      includeLocalContext: true,
    })
    reconcileApplicationsFromRegistry(reg)
    syncWithdrawnApplicationsFromRegistry(reg)
  }
  reg = await ops.enrichRegistryWithTalentInbox(reg)
  return reg
}

module.exports = {
  applicationFromMpOrder,
  listApplicationsFromRegistry,
  reconcileApplicationsFromRegistry,
  collectIceClaimedOrderIds,
  collectMissingApplicationOrderIds,
  fetchRegistryAndReconcileApplications,
}

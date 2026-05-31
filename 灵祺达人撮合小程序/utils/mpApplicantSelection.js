const talentPlatforms = require('./talentPlatformProfiles.js')
const mpOrderRegistryOps = require('./mpOrderRegistryOps.js')

const LOCAL_KEY_PREFIX = 'meoo_mp_selected_v1_'

function readLocalSelectedIds(mpOrderId) {
  try {
    const raw = wx.getStorageSync(`${LOCAL_KEY_PREFIX}${mpOrderId}`)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

function writeLocalSelectedIds(mpOrderId, ids) {
  try {
    wx.setStorageSync(`${LOCAL_KEY_PREFIX}${mpOrderId}`, JSON.stringify(ids || []))
  } catch (_) {}
}

function normalizeSelectedIds(raw) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))]
}

function selectedIdsFromMp(mp) {
  if (!mp) return []
  return normalizeSelectedIds(mp.selectedApplicantIds)
}

function stampApplicantsSelected(applicants, selectedIds) {
  const set = new Set(normalizeSelectedIds(selectedIds))
  return (applicants || []).map((a) => ({
    ...a,
    selected: a && a.id ? set.has(String(a.id)) : false,
  }))
}

function filterSelectedApplicants(applicants, selectedIds) {
  const set = new Set(normalizeSelectedIds(selectedIds))
  return (applicants || []).filter((a) => a && a.id && set.has(String(a.id)))
}

function resolveTalentMemberId(applicant, reg) {
  const a = applicant || {}
  if (a.talentMemberId) return String(a.talentMemberId).trim()
  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  const account = String(a.platformAccount || '').trim().toLowerCase()
  const contact = String(a.contact || '').trim()
  const plat = talentPlatforms.platformIdFromName(a.platform || '抖音')
  for (const m of members) {
    const prof = m.platformProfiles && m.platformProfiles[plat]
    if (account && prof && String(prof.platformAccount || '').trim().toLowerCase() === account) {
      return String(m.id || '').trim()
    }
  }
  if (contact) {
    for (const m of members) {
      if (String(m.contact || '').trim() === contact) return String(m.id || '').trim()
    }
  }
  return ''
}

async function persistSelectedIds(mpOrderId, selectedIds) {
  const ids = normalizeSelectedIds(selectedIds)
  writeLocalSelectedIds(mpOrderId, ids)
  return mpOrderRegistryOps.patchSelectedApplicantIds(mpOrderId, ids)
}

module.exports = {
  readLocalSelectedIds,
  writeLocalSelectedIds,
  normalizeSelectedIds,
  selectedIdsFromMp,
  stampApplicantsSelected,
  filterSelectedApplicants,
  resolveTalentMemberId,
  persistSelectedIds,
}

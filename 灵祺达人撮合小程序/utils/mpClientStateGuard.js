function digits11(raw) {
  const d = String(raw == null ? '' : raw).replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

function talentDraftBelongsToAccount(draft, account) {
  if (!draft || typeof draft !== 'object' || !account) return false
  const accTalentId = String(account.lingqiTalentId || '').trim()
  const draftTalentId = String(draft.lingqiTalentId || '').trim()
  if (accTalentId && draftTalentId && accTalentId !== draftTalentId) return false
  const loginPhone = digits11(account.loginName)
  if (!loginPhone) return true
  const contact = digits11(draft.contact)
  const wechat = digits11(draft.wechatId)
  if (contact && contact !== loginPhone) return false
  if (wechat && wechat !== loginPhone && contact && contact !== loginPhone) return false
  return true
}

function prDraftBelongsToAccount(draft, account) {
  if (!draft || typeof draft !== 'object' || !account) return false
  const accPrId = String(account.lingqiPrId || '').trim()
  const draftPrId = String(draft.lingqiPrId || '').trim()
  if (accPrId && draftPrId && accPrId !== draftPrId) return false
  const loginPhone = digits11(account.loginName)
  if (!loginPhone) return true
  const contact = digits11(draft.contactPhone)
  if (contact && contact !== loginPhone) return false
  return true
}

module.exports = {
  talentDraftBelongsToAccount,
  prDraftBelongsToAccount,
}

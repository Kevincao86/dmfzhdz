import type { MpAccount } from './mpSession'

function digits11(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

/** 云端/本机草稿是否与当前登录账号一致，防止串号资料写回 */
export function talentDraftBelongsToAccount(
  draft: Record<string, unknown> | null | undefined,
  account: MpAccount | null | undefined,
): boolean {
  if (!draft || typeof draft !== 'object' || !account) return false
  const accTalentId = String(account.lingqiTalentId || '').trim()
  const draftTalentId = String(draft.lingqiTalentId || '').trim()
  const loginPhone = digits11(account.loginName)
  if (accTalentId && draftTalentId && accTalentId !== draftTalentId) {
    const contact = digits11(draft.contact)
    const wechat = digits11(draft.wechatId)
    const phoneOk =
      !!loginPhone && (contact === loginPhone || wechat === loginPhone || (!contact && !wechat))
    if (!phoneOk) return false
  }
  if (!loginPhone) return true
  const contact = digits11(draft.contact)
  const wechat = digits11(draft.wechatId)
  if (contact && contact !== loginPhone) return false
  if (wechat && wechat !== loginPhone && contact && contact !== loginPhone) return false
  return true
}

export function prDraftBelongsToAccount(
  draft: Record<string, unknown> | null | undefined,
  account: MpAccount | null | undefined,
): boolean {
  if (!draft || typeof draft !== 'object' || !account) return false
  const accPrId = String(account.lingqiPrId || '').trim()
  const draftPrId = String(draft.lingqiPrId || '').trim()
  const loginPhone = digits11(account.loginName)
  const contact = digits11(draft.contactPhone)
  if (accPrId && draftPrId && accPrId !== draftPrId) {
    if (loginPhone && contact === loginPhone) return true
    return false
  }
  if (!loginPhone) return true
  if (contact && contact !== loginPhone) return false
  return true
}

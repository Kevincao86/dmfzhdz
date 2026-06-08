import type { RegistryFile, RegistryMpPrUser } from './opsRegistryTypes.js'
import { allocateLingqiPrId } from './lingqiIdentity.js'

function PR_ID_VALID(id: string): boolean {
  return /^LQ-P-\d{6}$/i.test(String(id || '').trim())
}

function phoneKey(v: string | undefined): string {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 与达人 wxOpenId 锁 ID 一致：小程序用 openid，履约 Web 用手机号 */
export function normalizePrPlatformFields(user: RegistryMpPrUser): RegistryMpPrUser {
  const openId = String(user.wxOpenId || '').trim()
  const phone = phoneKey(user.contactPhone || user.wechatId)
  if (openId) {
    return { ...user, wxOpenId: openId, platformAccount: openId, sourceChannel: 'mp' }
  }
  if (phone.length >= 11) {
    return {
      ...user,
      platformAccount: String(user.platformAccount || phone).trim(),
      sourceChannel: user.sourceChannel || 'web',
    }
  }
  return user
}

function prDedupeKey(user: RegistryMpPrUser): string {
  const normalized = normalizePrPlatformFields(user)
  const openId = String(normalized.wxOpenId || '').trim()
  if (openId) return `openid:${openId}`
  const platformAccount = String(normalized.platformAccount || '').trim()
  if (platformAccount) return `platform:${platformAccount.toLowerCase()}`
  const phone = phoneKey(normalized.contactPhone)
  if (phone.length >= 11) return `phone:${phone}`
  const wx = String(normalized.wechatId || normalized.wxNickName || '')
    .trim()
    .toLowerCase()
  return wx ? `wx:${wx}` : ''
}

export function upsertMpPrUser(data: RegistryFile, user: RegistryMpPrUser): RegistryMpPrUser {
  const list = [...(data.mpPrUsers ?? [])]
  const normalized = normalizePrPlatformFields(user)
  const openId = String(normalized.wxOpenId || '').trim()
  const userId = String(normalized.id || '').trim()
  const lingqiId = String(normalized.lingqiPrId || '').trim()
  const platformAccount = String(normalized.platformAccount || '').trim()
  const phone = phoneKey(normalized.contactPhone)
  const idx = list.findIndex((u) => {
    if (openId && String(u.wxOpenId || '').trim() === openId) return true
    if (platformAccount && String(u.platformAccount || '').trim() === platformAccount) return true
    if (userId && String(u.id || '').trim() === userId) return true
    if (lingqiId && PR_ID_VALID(lingqiId) && String(u.lingqiPrId || '').trim() === lingqiId) return true
    if (phone.length >= 11 && phoneKey(u.contactPhone) === phone) return true
    return false
  })
  const key = prDedupeKey(normalized)
  const keyIdx =
    idx < 0 && key ? list.findIndex((u) => prDedupeKey(u) === key) : idx
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const prev = keyIdx >= 0 ? list[keyIdx]! : null
  const lingqiPrId =
    prev?.lingqiPrId ||
    (normalized.lingqiPrId && PR_ID_VALID(normalized.lingqiPrId) ? normalized.lingqiPrId : '') ||
    allocateLingqiPrId(data, normalized.lingqiPrId)
  const next: RegistryMpPrUser = normalizePrPlatformFields({
    ...prev,
    ...normalized,
    id: prev?.id || normalized.id || `MPR-${Date.now()}`,
    lingqiPrId,
    wxOpenId: openId || prev?.wxOpenId || normalized.wxOpenId,
    platformAccount: platformAccount || prev?.platformAccount || normalized.platformAccount,
    sourceChannel: normalized.sourceChannel || prev?.sourceChannel,
    updatedAt: now,
    registeredAt: prev?.registeredAt || normalized.registeredAt || now,
  })
  if (keyIdx >= 0) list[keyIdx] = next
  else list.unshift(next)
  data.mpPrUsers = list.slice(0, 5000)
  return next
}

/** 同一微信 openid 仅保留一条 PR 用户，合并灵祺 PRID 避免重复建档 */
export function dedupeMpPrUsersByOpenId(
  data: RegistryFile,
  openId: string,
  keepUserId: string,
): void {
  const oid = String(openId || '').trim()
  const keepId = String(keepUserId || '').trim()
  if (!oid || !keepId) return
  const list = [...(data.mpPrUsers ?? [])]
  const keepIdx = list.findIndex((u) => u.id === keepId)
  if (keepIdx < 0) return
  let keep = normalizePrPlatformFields({ ...list[keepIdx]!, wxOpenId: oid })
  for (const u of list) {
    if (u.id === keepId) continue
    const uOid = String(u.wxOpenId || '').trim()
    const uPlatform = String(u.platformAccount || '').trim()
    if (uOid !== oid && uPlatform !== oid) continue
    if (!keep.lingqiPrId && u.lingqiPrId) keep.lingqiPrId = u.lingqiPrId
    if (!keep.contactPhone && u.contactPhone) keep.contactPhone = u.contactPhone
    if (!keep.contactName && u.contactName) keep.contactName = u.contactName
    if (!keep.personalName && u.personalName) keep.personalName = u.personalName
    if (!keep.companyName && u.companyName) keep.companyName = u.companyName
    if (!keep.wechatId && u.wechatId) keep.wechatId = u.wechatId
    if (!keep.province && u.province) keep.province = u.province
    if (!keep.city && u.city) keep.city = u.city
    if (!keep.intro && u.intro) keep.intro = u.intro
    if (!keep.wxNickName && u.wxNickName) keep.wxNickName = u.wxNickName
    if (!keep.wxAvatarUrl && u.wxAvatarUrl) keep.wxAvatarUrl = u.wxAvatarUrl
  }
  data.mpPrUsers = list
    .filter((u) => {
      const uOid = String(u.wxOpenId || '').trim()
      const uPlatform = String(u.platformAccount || '').trim()
      return u.id === keepId || (uOid !== oid && uPlatform !== oid)
    })
    .slice(0, 5000)
  keep = normalizePrPlatformFields(keep)
  const finalIdx = data.mpPrUsers.findIndex((u) => u.id === keepId)
  if (finalIdx >= 0) data.mpPrUsers[finalIdx] = keep
  else data.mpPrUsers.unshift(keep)
}

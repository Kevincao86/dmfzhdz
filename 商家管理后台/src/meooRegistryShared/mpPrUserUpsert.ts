import type { RegistryFile, RegistryMpPrUser } from './opsRegistryTypes.js'
import { allocateLingqiPrId } from './lingqiIdentity.js'

function prDedupeKey(user: RegistryMpPrUser): string {
  const phone = String(user.contactPhone || '')
    .replace(/\D/g, '')
    .slice(-11)
  if (phone.length >= 8) return `phone:${phone}`
  const wx = String(user.wxOpenId || user.wechatId || user.wxNickName || '')
    .trim()
    .toLowerCase()
  return wx ? `wx:${wx}` : ''
}

export function upsertMpPrUser(data: RegistryFile, user: RegistryMpPrUser): RegistryMpPrUser {
  const list = [...(data.mpPrUsers ?? [])]
  const key = prDedupeKey(user)
  const idx = key
    ? list.findIndex((u) => prDedupeKey(u) === key)
    : list.findIndex((u) => u.id === user.id)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const prev = idx >= 0 ? list[idx]! : null
  const lingqiPrId =
    prev?.lingqiPrId ||
    (user.lingqiPrId && PR_ID_VALID(user.lingqiPrId) ? user.lingqiPrId : '') ||
    allocateLingqiPrId(data, user.lingqiPrId)
  const next: RegistryMpPrUser = {
    ...user,
    id: prev?.id || user.id || `MPR-${Date.now()}`,
    lingqiPrId,
    updatedAt: now,
    registeredAt: prev?.registeredAt || user.registeredAt || now,
  }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  data.mpPrUsers = list.slice(0, 5000)
  return next
}

function PR_ID_VALID(id: string): boolean {
  return /^LQ-P-\d{6}$/i.test(String(id || '').trim())
}

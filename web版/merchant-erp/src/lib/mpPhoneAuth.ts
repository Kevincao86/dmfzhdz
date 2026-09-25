import { normalizeCnMobile } from '../../vite-plugins/authRegistrationOtp.js'

/** 履约/小程序账号：优先大陆手机号作为 login_name */
export function normalizeMpLoginPhone(raw: string): string | null {
  return normalizeCnMobile(raw)
}

export function isValidMpLoginPhone(phone: string): boolean {
  return !!normalizeMpLoginPhone(phone)
}

/** 邮箱作为登录名（与商家 ERP 绑定邮箱同一格式） */
export function normalizeMpLoginEmail(raw: string): string | null {
  const t = String(raw || '').trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return null
  if (t.endsWith('@users.meoo.test')) return null
  return t
}

export function isMpContactBound(loginName: string): boolean {
  return isValidMpLoginPhone(loginName) || !!normalizeMpLoginEmail(loginName)
}

/** 手机号、邮箱，或已存在的字母数字登录名 */
export function normalizeMpLoginName(raw: string): string | null {
  const phone = normalizeMpLoginPhone(raw)
  if (phone) return phone
  const email = normalizeMpLoginEmail(raw)
  if (email) return email
  const legacy = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (/^[a-z0-9]{2,32}$/.test(legacy)) return legacy
  return null
}

export function isNewAccountLoginPhoneOnly(raw: string): boolean {
  return isValidMpLoginPhone(raw)
}

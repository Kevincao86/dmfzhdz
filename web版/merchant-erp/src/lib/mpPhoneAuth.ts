import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'

/** 履约/小程序账号：优先大陆手机号作为 login_name */
export function normalizeMpLoginPhone(raw: string): string | null {
  return normalizeCnMobile(raw)
}

export function isValidMpLoginPhone(phone: string): boolean {
  return !!normalizeMpLoginPhone(phone)
}

/** 新账号仅允许手机号；已存在字母数字登录名仍可登录 */
export function normalizeMpLoginName(raw: string): string | null {
  const phone = normalizeMpLoginPhone(raw)
  if (phone) return phone
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

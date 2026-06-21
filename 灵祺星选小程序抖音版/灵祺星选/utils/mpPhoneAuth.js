function normalizeCnMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (/^1\d{10}$/.test(digits)) return digits
  return null
}

function normalizeMpLoginPhone(raw) {
  return normalizeCnMobile(raw)
}

function sanitizePhoneInput(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 11)
}

function validatePhoneAccount(phone) {
  const p = normalizeMpLoginPhone(phone)
  if (!p) return '请输入有效大陆手机号'
  return ''
}

module.exports = {
  normalizeCnMobile,
  normalizeMpLoginPhone,
  sanitizePhoneInput,
  validatePhoneAccount,
}

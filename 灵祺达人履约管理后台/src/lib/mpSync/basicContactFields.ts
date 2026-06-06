/** 各身份资料页共用：昵称、联系电话、微信号 */
export type BasicContactInput = {
  wxNickName?: string
  contact?: string
  contactPhone?: string
  wechatId?: string
}

export function validateBasicContactFields(fields: BasicContactInput): string | null {
  if (!String(fields.wxNickName || '').trim()) return '请填写昵称'
  const phone = String(fields.contact ?? fields.contactPhone ?? '').trim()
  if (!phone) return '请填写联系电话'
  if (!String(fields.wechatId || '').trim()) return '请填写微信号'
  return null
}

/** 各身份资料页共用：昵称、联系电话、微信号 */
function validateBasicContactFields(fields) {
  if (!String(fields.wxNickName || '').trim()) return '请填写昵称'
  const phone = String(fields.contact != null ? fields.contact : fields.contactPhone || '').trim()
  if (!phone) return '请填写联系电话'
  if (!String(fields.wechatId || '').trim()) return '请填写微信号'
  return null
}

module.exports = { validateBasicContactFields }

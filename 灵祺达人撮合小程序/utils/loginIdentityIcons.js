/** 登录页身份选择 · 商务线型图标（按身份区分） */
const LOGIN_IDENTITY_ICONS = {
  talent: '/images/identity/identity-talent.png',
  shoot: '/images/identity/identity-shoot.png',
  edit: '/images/identity/identity-edit.png',
  pr: '/images/identity/identity-pr.png',
}

function loginIdentityIcon(id) {
  return LOGIN_IDENTITY_ICONS[id] || LOGIN_IDENTITY_ICONS.talent
}

function attachLoginIdentityIcons(options) {
  return (options || []).map((item) => ({
    ...item,
    icon: loginIdentityIcon(item.id),
  }))
}

module.exports = {
  LOGIN_IDENTITY_ICONS,
  loginIdentityIcon,
  attachLoginIdentityIcons,
}

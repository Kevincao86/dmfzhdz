/** 商务风线性图标区：用单字/符号代替 emoji，全站菜单与空状态复用 */
const MENU_GLYPH = {
  info: '档',
  list: '单',
  bell: '讯',
  chart: '数',
  support: '服',
  tpl: '模',
}

const IDENTITY_GLYPH = {
  talent: '达',
  shoot: '拍',
  edit: '剪',
  pr: 'PR',
}

function menuGlyph(icon) {
  return MENU_GLYPH[icon] || '项'
}

function identityGlyph(id) {
  return IDENTITY_GLYPH[id] || '身'
}

function attachMenuGlyphs(menus) {
  return (menus || []).map((item) => ({
    ...item,
    glyph: menuGlyph(item.icon),
  }))
}

module.exports = {
  MENU_GLYPH,
  IDENTITY_GLYPH,
  menuGlyph,
  identityGlyph,
  attachMenuGlyphs,
}

/** 「我的」页菜单：商务简约线型符号（仅本页使用，不改全局主题） */
const ICON_GLYPH = {
  info: '◫',
  list: '☰',
  bell: '◉',
  chart: '▥',
  support: '⌁',
  tpl: '▦',
}

function menuGlyph(icon) {
  return ICON_GLYPH[icon] || '◫'
}

function attachMenuGlyphs(menus) {
  return (menus || []).map((item) => ({
    ...item,
    glyph: menuGlyph(item.icon),
  }))
}

module.exports = {
  ICON_GLYPH,
  menuGlyph,
  attachMenuGlyphs,
}

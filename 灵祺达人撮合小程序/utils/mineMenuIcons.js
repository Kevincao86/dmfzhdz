/** 「我的」页菜单图标在 OSS，不打进主包。 */
const MINE_ICON_OSS = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/mine-icons'
const MINE_ICON_VER = '20261023a'

function mineIcon(file) {
  return `${MINE_ICON_OSS}/${file}?v=${MINE_ICON_VER}`
}

const ICON_GLYPH = {
  info: '◫',
  list: '☰',
  bell: '◉',
  chart: '▥',
  support: '⌁',
  tpl: '▦',
  addon: '✦',
  star: '★',
  manual: '◰',
  quote: '¥',
}

const MENU_KEY_ICON = {
  profile: mineIcon('info.png'),
  prProfile: mineIcon('pr-profile.png'),
  accountBind: mineIcon('account-bind.png'),
  wechatOaBind: mineIcon('wechat-oa.png'),
  applications: mineIcon('list.png'),
  targetedInvites: mineIcon('invite.png'),
  orderCalendar: mineIcon('calendar.png'),
  favorites: mineIcon('star.png'),
  talentCredit: mineIcon('credit.png'),
  prQuotes: mineIcon('quote.png'),
  subscriptions: mineIcon('subscribe.png'),
  wallet: mineIcon('wallet.png'),
  myOrders: mineIcon('orders.png'),
  prOrders: mineIcon('pr-orders.png'),
  affiliatePortal: mineIcon('affiliate.png'),
  affiliateApply: mineIcon('affiliate.png'),
  training: mineIcon('training.png'),
  briefGen: mineIcon('brief-gen.png'),
  aiReview: mineIcon('ai-review.png'),
  addonsHub: mineIcon('addons.png'),
  myCourses: mineIcon('courses.png'),
  analytics: mineIcon('chart.png'),
  talentCheck: mineIcon('talent-check.png'),
  templates: mineIcon('tpl.png'),
  briefTemplates: mineIcon('brief.png'),
  cooperation: mineIcon('cooperation.png'),
  talentWatchlist: mineIcon('watchlist.png'),
  formRelay: mineIcon('relay.png'),
  funnel: mineIcon('funnel.png'),
  manual: mineIcon('manual.png'),
  support: mineIcon('support.png'),
}

const ICON_TYPE_ICON = {
  info: mineIcon('info.png'),
  list: mineIcon('list.png'),
  star: mineIcon('star.png'),
  chart: mineIcon('chart.png'),
  support: mineIcon('support.png'),
  tpl: mineIcon('tpl.png'),
  manual: mineIcon('manual.png'),
  quote: mineIcon('quote.png'),
  bell: mineIcon('subscribe.png'),
}

function menuGlyph(icon) {
  return ICON_GLYPH[icon] || '◫'
}

function menuIconSrc(item) {
  if (!item) return MENU_KEY_ICON.profile
  if (item.key && MENU_KEY_ICON[item.key]) return MENU_KEY_ICON[item.key]
  if (item.icon && ICON_TYPE_ICON[item.icon]) return ICON_TYPE_ICON[item.icon]
  return MENU_KEY_ICON.profile
}

function attachMenuGlyphs(menus) {
  return (menus || []).map((item) => ({
    ...item,
    glyph: menuGlyph(item.icon),
    iconSrc: menuIconSrc(item),
  }))
}

module.exports = {
  ICON_GLYPH,
  MENU_KEY_ICON,
  menuGlyph,
  menuIconSrc,
  attachMenuGlyphs,
}

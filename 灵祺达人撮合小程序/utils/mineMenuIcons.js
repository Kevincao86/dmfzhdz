/** 「我的」页圆角正方形线稿，打进主包，约 12KB。 */
function mineIcon(file) {
  return `/images/mine-line/${file}`
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
  profile: mineIcon('profile.png'),
  prProfile: mineIcon('profile.png'),
  accountBind: mineIcon('account-bind.png'),
  wechatOaBind: mineIcon('subscribe.png'),
  applications: mineIcon('applications.png'),
  targetedInvites: mineIcon('invite.png'),
  orderCalendar: mineIcon('calendar.png'),
  favorites: mineIcon('favorites.png'),
  talentCredit: mineIcon('credit.png'),
  prQuotes: mineIcon('quote.png'),
  subscriptions: mineIcon('subscribe.png'),
  wallet: mineIcon('wallet.png'),
  myOrders: mineIcon('orders.png'),
  prOrders: mineIcon('applications.png'),
  affiliatePortal: mineIcon('affiliate.png'),
  affiliateApply: mineIcon('affiliate.png'),
  training: mineIcon('training.png'),
  briefGen: mineIcon('brief-gen.png'),
  aiReview: mineIcon('ai-review.png'),
  addonsHub: mineIcon('addons.png'),
  myCourses: mineIcon('manual.png'),
  analytics: mineIcon('analytics.png'),
  talentCheck: mineIcon('user.png'),
  accountEval: mineIcon('recommend.png'),
  templates: mineIcon('quote.png'),
  briefTemplates: mineIcon('brief.png'),
  cooperation: mineIcon('affiliate.png'),
  talentWatchlist: mineIcon('credit.png'),
  formRelay: mineIcon('subscribe.png'),
  funnel: mineIcon('analytics.png'),
  manual: mineIcon('manual.png'),
  support: mineIcon('support.png'),
}

const ICON_TYPE_ICON = {
  info: mineIcon('profile.png'),
  list: mineIcon('applications.png'),
  star: mineIcon('favorites.png'),
  chart: mineIcon('analytics.png'),
  support: mineIcon('support.png'),
  tpl: mineIcon('brief.png'),
  manual: mineIcon('manual.png'),
  quote: mineIcon('quote.png'),
  bell: mineIcon('subscribe.png'),
  wallet: mineIcon('wallet.png'),
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

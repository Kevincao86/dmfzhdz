/** 「我的」页菜单：方案 A 柔和 3D 图标（/images/mine-icons） */
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
  profile: '/images/mine-icons/info.png',
  prProfile: '/images/mine-icons/pr-profile.png',
  accountBind: '/images/mine-icons/account-bind.png',
  wechatOaBind: '/images/mine-icons/wechat-oa.png',
  applications: '/images/mine-icons/list.png',
  targetedInvites: '/images/mine-icons/invite.png',
  orderCalendar: '/images/mine-icons/calendar.png',
  favorites: '/images/mine-icons/star.png',
  talentCredit: '/images/mine-icons/credit.png',
  prQuotes: '/images/mine-icons/quote.png',
  subscriptions: '/images/mine-icons/subscribe.png',
  wallet: '/images/mine-icons/wallet.png',
  myOrders: '/images/mine-icons/orders.png',
  prOrders: '/images/mine-icons/pr-orders.png',
  affiliatePortal: '/images/mine-icons/affiliate.png',
  affiliateApply: '/images/mine-icons/affiliate.png',
  training: '/images/mine-icons/training.png',
  briefGen: '/images/mine-icons/brief-gen.png',
  aiReview: '/images/mine-icons/ai-review.png',
  addonsHub: '/images/mine-icons/addons.png',
  myCourses: '/images/mine-icons/courses.png',
  analytics: '/images/mine-icons/chart.png',
  templates: '/images/mine-icons/tpl.png',
  briefTemplates: '/images/mine-icons/brief.png',
  cooperation: '/images/mine-icons/cooperation.png',
  talentWatchlist: '/images/mine-icons/watchlist.png',
  formRelay: '/images/mine-icons/relay.png',
  funnel: '/images/mine-icons/funnel.png',
  manual: '/images/mine-icons/manual.png',
  support: '/images/mine-icons/support.png',
}

const ICON_TYPE_ICON = {
  info: '/images/mine-icons/info.png',
  list: '/images/mine-icons/list.png',
  star: '/images/mine-icons/star.png',
  chart: '/images/mine-icons/chart.png',
  support: '/images/mine-icons/support.png',
  tpl: '/images/mine-icons/tpl.png',
  manual: '/images/mine-icons/manual.png',
  quote: '/images/mine-icons/quote.png',
  bell: '/images/mine-icons/subscribe.png',
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

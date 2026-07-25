/**
 * 与 Web merchantPlatforms.ts + platformBranding 对齐：团购 / 外卖分组 + 同源 Logo。
 * Logo 走 CDN/OSS（见 mpStaticAssets.js）
 */
const { readPlatformToken } = require('./platformTokensMp.js')
const { assetUrl } = require('./mpStaticAssets.js')
const devAuth = require('./devAuth.js')

const PLATFORM_DESC = {
  douyin: '在抖音提供商品/服务，触达海量用户',
  meituan: '在美团提供商品/服务，获取本地客流',
  xiaohongshu: '在小红书种草商品，激发用户购买',
  kuaishou: '在快手团购触达本地消费者',
  eleme: '在淘宝闪购上架外卖商品',
  meituan_waimai: '在美团外卖覆盖到家场景',
  jd_waimai: '在京东外卖拓展到家渠道',
}

/**
 * @typedef {'groupbuy'|'waimai'} PlatformChannelKind
 * @typedef {{ id: string, name: string, letter: string, channel: PlatformChannelKind, wizard: 'douyin'|'draft'|'none', logo?: string, comingSoon?: boolean }} CreatePlatformOpt
 */

/** @type {CreatePlatformOpt[]} 团购（到店）——与用户需求一致 */
const GROUPBUY_OPTIONS = [
  {
    id: 'douyin',
    name: '抖音来客',
    letter: '抖',
    channel: 'groupbuy',
    wizard: 'douyin',
    logo: assetUrl('platforms/douyin-laike.png'),
  },
  {
    id: 'meituan',
    name: '美团团购',
    letter: '美',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: assetUrl('platforms/dianping.png'),
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    letter: '红',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: assetUrl('platforms/xiaohongshu.png'),
  },
  {
    id: 'kuaishou',
    name: '快手团购',
    letter: '快',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: assetUrl('platforms/kuaishou-local.png'),
  },
  {
    id: 'jd',
    name: '京东本地生活',
    letter: '京',
    channel: 'groupbuy',
    wizard: 'none',
    logo: '',
    comingSoon: true,
  },
]

/** @type {CreatePlatformOpt[]} 外卖（到家） */
const WAIMAI_OPTIONS = [
  {
    id: 'eleme',
    name: '淘宝闪购',
    letter: '闪',
    channel: 'waimai',
    wizard: 'draft',
    logo: assetUrl('platforms/eleme-shangou.png'),
  },
  {
    id: 'meituan_waimai',
    name: '美团外卖',
    letter: '外',
    channel: 'waimai',
    wizard: 'draft',
    logo: assetUrl('platforms/meituan-waimai.png'),
  },
  {
    id: 'jd_waimai',
    name: '京东外卖',
    letter: '京',
    channel: 'waimai',
    wizard: 'draft',
    logo: assetUrl('platforms/jd-waimai.png'),
  },
]

const ALL_OPTIONS = GROUPBUY_OPTIONS.concat(WAIMAI_OPTIONS)

/** @deprecated 仅兼容旧引用：全量扁平 */
const OPTIONS = ALL_OPTIONS

/**
 * @param {PlatformChannelKind} channelKind
 */
function isPreviewConnected(id) {
  return devAuth.isDevSkipLogin() && ['douyin', 'meituan', 'xiaohongshu', 'kuaishou'].includes(id)
}

function selectablePlatformRows(channelKind) {
  const list = channelKind === 'waimai' ? WAIMAI_OPTIONS : GROUPBUY_OPTIONS
  return list.map((p) => {
    const connected = Boolean(readPlatformToken(p.id)) || isPreviewConnected(p.id)
    const selectable = connected && !p.comingSoon
    let hint = PLATFORM_DESC[p.id] || ''
    if (p.comingSoon) hint = '暂未开放'
    else if (!connected) hint = '未绑定 · 请到电脑端系统设置授权'
    return {
      ...p,
      logo: p.logo || '',
      desc: hint,
      selectable,
      connected,
      hint: connected && !p.comingSoon ? '已接通' : hint,
    }
  })
}

/** @param {string} id */
function findPlatformOption(id) {
  return ALL_OPTIONS.find((x) => x.id === id) || null
}

module.exports = {
  OPTIONS,
  ALL_OPTIONS,
  GROUPBUY_OPTIONS,
  WAIMAI_OPTIONS,
  selectablePlatformRows,
  findPlatformOption,
}

/**
 * 与 Web merchantPlatforms.ts + platformBranding 对齐：团购 / 外卖分组 + 同源 Logo。
 * 小程序 Logo 拷贝自 web版/merchant-erp/public/platforms → images/platforms
 */
const { readPlatformToken } = require('./platformTokensMp.js')

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
    logo: '/images/platforms/douyin-laike.png',
  },
  {
    id: 'meituan',
    name: '美团团购',
    letter: '美',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: '/images/platforms/dianping.png',
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    letter: '红',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: '/images/platforms/xiaohongshu.png',
  },
  {
    id: 'kuaishou',
    name: '快手团购',
    letter: '快',
    channel: 'groupbuy',
    wizard: 'draft',
    logo: '/images/platforms/kuaishou-local.png',
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
    logo: '/images/platforms/eleme-shangou.png',
  },
  {
    id: 'meituan_waimai',
    name: '美团外卖',
    letter: '外',
    channel: 'waimai',
    wizard: 'draft',
    logo: '/images/platforms/meituan-waimai.png',
  },
  {
    id: 'jd_waimai',
    name: '京东外卖',
    letter: '京',
    channel: 'waimai',
    wizard: 'draft',
    logo: '/images/platforms/jd-waimai.png',
  },
]

const ALL_OPTIONS = GROUPBUY_OPTIONS.concat(WAIMAI_OPTIONS)

/** @deprecated 仅兼容旧引用：全量扁平 */
const OPTIONS = ALL_OPTIONS

/**
 * @param {PlatformChannelKind} channelKind
 */
function selectablePlatformRows(channelKind) {
  const list = channelKind === 'waimai' ? WAIMAI_OPTIONS : GROUPBUY_OPTIONS
  return list.map((p) => {
    const connected = Boolean(readPlatformToken(p.id))
    const selectable = connected && !p.comingSoon
    let hint = ''
    if (p.comingSoon) hint = '暂未开放'
    else if (!connected) hint = '未绑定 · 请到电脑端系统设置授权'
    else hint = '已接通'
    return {
      ...p,
      logo: p.logo || '',
      selectable,
      connected,
      hint,
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

const { allCitiesFlat } = require('./chinaRegion.js')

const DELIVERY_WINDOWS = [
  { id: 'normal', label: '招募大厅', sub: '常规曝光，自行设置报名截止' },
  { id: 'urgent', label: '急单大厅', sub: '发布后 24 小时内截止报名' },
]

/** PR 发单：先选招募对象 */
const RECRUIT_TARGETS = [
  { id: 'talent', label: '达人', sub: '探店 · 品宣 · 直播 · 达人报名', iconKey: 'talent', iconGlyph: '★' },
  { id: 'shoot', label: '拍摄', sub: '跟拍探店 · 活动 · 产品拍摄', iconKey: 'shoot', iconGlyph: '📷' },
  { id: 'edit', label: '剪辑', sub: '探店成片 · 品宣包装 · 云剪', iconKey: 'edit', iconGlyph: '✂' },
]

const RECRUIT_MODES = [
  { id: 'visit', label: '探店', sub: '到店体验 · 种草内容', hall: 'normal', category: '探店', target: 'talent', iconKey: 'visit', iconGlyph: '📍' },
  { id: 'brand', label: '品宣', sub: '品牌曝光 · 内容传播', hall: 'normal', category: '品宣', target: 'talent', iconKey: 'brand', iconGlyph: '📢' },
  { id: 'live', label: '直播达人', sub: '直播带货 · 专场种草', hall: 'normal', category: '直播', target: 'talent', iconKey: 'live', iconGlyph: '📺' },
  { id: 'shoot_visit', label: '探店跟拍', sub: '到店拍摄达人探店素材', hall: 'normal', category: '拍摄', target: 'shoot' },
  { id: 'shoot_event', label: '活动拍摄', sub: '发布会 · 门店活动', hall: 'normal', category: '拍摄', target: 'shoot' },
  { id: 'shoot_product', label: '产品静物', sub: '菜品 · 商品特写', hall: 'normal', category: '拍摄', target: 'shoot' },
  { id: 'edit_visit', label: '探店成片', sub: '探店素材剪辑包装', hall: 'normal', category: '剪辑', target: 'edit' },
  { id: 'edit_brand', label: '品宣包装', sub: '品牌向精剪', hall: 'normal', category: '剪辑', target: 'edit' },
  { id: 'edit_ice', label: '云剪合成', sub: '素材链接 → 云端成片', hall: 'ice', category: '云剪', target: 'edit' },
]

const ICE_VERIFY_MODES = [
  { id: 'ai', label: 'AI 核查' },
  { id: 'pr', label: 'PR 审核' },
]

function modesForTarget(targetId) {
  const tid = targetId || 'talent'
  return RECRUIT_MODES.filter((m) => (m.target || 'talent') === tid)
}

function targetById(id) {
  return RECRUIT_TARGETS.find((t) => t.id === id) || null
}

const PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号']

const TALENT_TAGS = [
  '美食',
  '母婴',
  '家居家装',
  '生活记录',
  '美妆时尚',
  '健康养生',
  '运动健身',
  '教育',
  '摄影',
  '酒店旅游',
  '文化艺术',
  '兴趣爱好',
  '科技数码',
  '影视综艺',
  '宠物',
  '情感',
  '搞笑',
  '娱乐资讯',
  '汽车',
  '商业财经',
  '游戏',
  '民生资讯',
  '体育赛事',
  '知识',
  '其它',
]

const DOUYIN_SALES_LEVELS = ['不限', 'Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', 'Lv7', 'Lv8']

/** 任务金阶梯用（不含「不限」） */
const DOUYIN_TIER_LEVELS = ['Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', 'Lv7', 'Lv8']

const FANS_TIER_RANGES = ['1万以下', '1-5万', '5-10万', '10-50万', '50万以上']

const FEE_TYPES = [
  {
    id: 'fixed',
    label: '一口价',
    desc: '为所有报名达人设置统一酬劳（填写金额）',
  },
  {
    id: 'self_quote',
    label: '自报价',
    desc: '不设置固定价格，由达人根据要求自行报价',
  },
  {
    id: 'exchange_only',
    label: '纯置换',
    desc: '无现金报酬，以产品/服务/体验置换为主',
  },
  {
    id: 'level_tier',
    label: '等级阶梯型',
    desc: '按达人带货等级分档设置酬劳（可填 0 表示该档置换）',
  },
  {
    id: 'fans_tier',
    label: '粉丝阶梯型',
    desc: '按达人粉丝量分档设置酬劳（可填 0 表示该档置换）',
  },
]

function feeTypeLabel(id) {
  if (!id) return '请选择'
  return FEE_TYPES.find((f) => f.id === id)?.label || '请选择'
}

function modeById(id) {
  return RECRUIT_MODES.find((m) => m.id === id) || RECRUIT_MODES[0]
}

function filterCities(keyword, selectedSet) {
  const k = String(keyword || '').trim()
  const all = allCitiesFlat()
  return all.filter((c) => {
    if (k && !c.includes(k)) return false
    return true
  })
}

function newLevelTier(id) {
  return {
    id: id || `lt-${Date.now()}`,
    levels: [],
    levelsText: '请选择等级',
    price: '',
    priceMode: 'fixed',
  }
}

function newFansTier(id) {
  return {
    id: id || `ft-${Date.now()}`,
    fansRange: '',
    fansRangeText: '请选择粉丝档位',
    price: '',
    priceMode: 'fixed',
  }
}

module.exports = {
  DELIVERY_WINDOWS,
  RECRUIT_TARGETS,
  RECRUIT_MODES,
  ICE_VERIFY_MODES,
  modesForTarget,
  PLATFORMS,
  TALENT_TAGS,
  DOUYIN_SALES_LEVELS,
  DOUYIN_TIER_LEVELS,
  FANS_TIER_RANGES,
  newLevelTier,
  newFansTier,
  FEE_TYPES,
  feeTypeLabel,
  modeById,
  targetById,
  filterCities,
  allCitiesFlat,
  TIER_PRICE_MODES: require('./mpRecruitmentTierQuote.js').TIER_PRICE_MODES,
}

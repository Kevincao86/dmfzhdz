import { allCitiesFlat } from './chinaRegion'

export const DELIVERY_WINDOWS = [
  { id: 'normal', label: '招募大厅', sub: '常规曝光，自行设置报名截止' },
  { id: 'urgent', label: '急单大厅', sub: '发布后 24 小时内截止报名' },
] as const

export const RECRUIT_TARGETS = [
  { id: 'talent', label: '达人', sub: '探店 · 品宣 · 达人报名' },
  { id: 'shoot', label: '拍摄', sub: '拍摄任务表单筹备中', placeholder: true },
  { id: 'edit', label: '剪辑', sub: '剪辑任务表单筹备中', placeholder: true },
] as const

export const RECRUIT_MODES = [
  { id: 'visit', label: '探店', sub: '到店体验 · 种草内容', hall: 'normal' as const, category: '探店', disabled: false },
  { id: 'brand', label: '品宣', sub: '品牌曝光 · 内容传播', hall: 'normal' as const, category: '品宣', disabled: false },
] as const

export function targetById(id: string) {
  return RECRUIT_TARGETS.find((t) => t.id === id) ?? null
}

export const PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号'] as const

export const TALENT_TAGS = [
  '美食', '母婴', '家居家装', '生活记录', '美妆时尚', '健康养生', '运动健身', '教育', '摄影',
  '酒店旅游', '文化艺术', '兴趣爱好', '科技数码', '影视综艺', '宠物', '情感', '搞笑',
  '娱乐资讯', '汽车', '商业财经', '游戏', '民生资讯', '体育赛事', '知识', '其它',
] as const

export const DOUYIN_SALES_LEVELS = ['不限', 'Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', 'Lv7', 'Lv8'] as const

export const DOUYIN_TIER_LEVELS = ['Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', 'Lv7', 'Lv8'] as const

export const FANS_TIER_RANGES = ['1万以下', '1-5万', '5-10万', '10-50万', '50万以上'] as const

export const FEE_TYPES = [
  { id: 'fixed', label: '一口价', desc: '为所有报名达人设置统一酬劳（填写金额）' },
  { id: 'self_quote', label: '自报价', desc: '不设置固定价格，由达人根据要求自行报价' },
  { id: 'exchange_only', label: '纯置换', desc: '无现金报酬，以产品/服务/体验置换为主' },
  { id: 'level_tier', label: '等级阶梯型', desc: '按达人带货等级分档设置酬劳（可填 0 表示该档置换）' },
  { id: 'fans_tier', label: '粉丝阶梯型', desc: '按达人粉丝量分档设置酬劳（可填 0 表示该档置换）' },
] as const

export const ALL_CITIES = allCitiesFlat()

export function feeTypeLabel(id: string) {
  if (!id) return '请选择'
  return FEE_TYPES.find((f) => f.id === id)?.label || '请选择'
}

export function modeById(id: string) {
  return RECRUIT_MODES.find((m) => m.id === id) || RECRUIT_MODES[0]
}

export type LevelTier = { id: string; levels: string[]; levelsText: string; price: string }
export type FansTier = { id: string; fansRange: string; fansRangeText: string; price: string }

export function newLevelTier(id?: string): LevelTier {
  return { id: id || `lt-${Date.now()}`, levels: [], levelsText: '请选择等级', price: '' }
}

export function newFansTier(id?: string): FansTier {
  return { id: id || `ft-${Date.now()}`, fansRange: '', fansRangeText: '请选择粉丝档位', price: '' }
}

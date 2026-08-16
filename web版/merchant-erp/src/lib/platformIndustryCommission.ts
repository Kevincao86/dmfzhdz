/**
 * 各行业 × 各平台技术服务费（佣金）参考费率（%）。
 *
 * 口径说明（报税粗算，非合同费率；正式结算以各平台后台「费率查询」为准）：
 * - 抖音来客团购：对齐近年生活服务软件服务费公开参考（美食/丽人/休闲等约 2.5%，酒旅/亲子约 2%，婚庆等更高）。
 * - 美团点评团购：到店交易佣金常见区间（餐饮约 5%–10%，丽人/休闲偏高，医美/婚庆更高）。
 * - 小红书本地生活：公开披露少，取行业常见团购抽成参考。
 * - 外卖（淘宝闪购/美团外卖/京东外卖）：综合抽成参考（含履约感知区间），餐饮业态为主。
 *
 * 匹配顺序：绑定账号业态关键词 → 精确 industryCode → 经营类目路径 → 未识别（禁止默默当成餐饮）。
 */
import type { FinancePlatformId } from '../services/financeReconcileApi'

export type GroupbuyCommissionPct = {
  douyin: number
  meituan: number
  xhs: number
}

export type WaimaiCommissionPct = {
  eleme: number
  meituan_waimai: number
  jd_waimai: number
}

export type IndustryPlatformCommissionPreset = {
  industryName: string
  industryPath: string
  groupbuy: GroupbuyCommissionPct
  waimai: WaimaiCommissionPct
}

/** 外卖综合抽成参考（餐饮为主；非餐饮门店仍展示参考值） */
const WAIMAI_FOOD: WaimaiCommissionPct = {
  eleme: 22,
  meituan_waimai: 23,
  jd_waimai: 20,
}

const WAIMAI_FOOD_FAST: WaimaiCommissionPct = {
  eleme: 20,
  meituan_waimai: 21,
  jd_waimai: 19,
}

const WAIMAI_NON_FOOD: WaimaiCommissionPct = {
  eleme: 18,
  meituan_waimai: 19,
  jd_waimai: 17,
}

function row(
  industryName: string,
  industryPath: string,
  groupbuy: GroupbuyCommissionPct,
  waimai: WaimaiCommissionPct = WAIMAI_FOOD,
): IndustryPlatformCommissionPreset {
  return { industryName, industryPath, groupbuy, waimai }
}

/**
 * 一级业态佣金表（与来客一级类目对齐，供路径匹配与默认兜底）。
 * douyin = 来客团购技术服务费；meituan = 美团点评团购；xhs = 小红书本地生活。
 */
export const INDUSTRY_L1_COMMISSION_TABLE: Record<string, IndustryPlatformCommissionPreset> = {
  food: row('餐饮', '餐饮 > 美食', { douyin: 2.5, meituan: 8, xhs: 5 }, WAIMAI_FOOD),
  food_fast: row('餐饮', '餐饮 > 快餐小吃', { douyin: 2.5, meituan: 6, xhs: 4 }, WAIMAI_FOOD_FAST),
  beauty: row('丽人', '丽人 > 美发/美甲', { douyin: 2.5, meituan: 12, xhs: 8 }, WAIMAI_NON_FOOD),
  leisure: row('休闲娱乐', '休闲娱乐 > 玩乐', { douyin: 2.5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  sport: row('运动健身', '运动健身 > 健身房', { douyin: 2.5, meituan: 10, xhs: 7 }, WAIMAI_NON_FOOD),
  kids: row('亲子', '亲子 > 亲子活动', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  life: row('生活服务', '生活服务 > 到家服务', { douyin: 5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  car: row('爱车', '爱车 > 洗车养护', { douyin: 5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  shopping: row('购物', '购物 > 商超便利', { douyin: 3, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  edu: row('学习培训', '学习培训 > 课程体验', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  pet: row('宠物', '宠物 > 宠物服务', { douyin: 5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  med_beauty: row('医疗医美', '医疗医美 > 轻医美', { douyin: 8, meituan: 15, xhs: 10 }, WAIMAI_NON_FOOD),
  hotel: row('酒旅住宿', '酒旅 > 住宿', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  travel: row('游玩', '游玩 > 门票景区', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  wedding: row('结婚', '结婚 > 婚庆摄影', { douyin: 8, meituan: 15, xhs: 10 }, WAIMAI_NON_FOOD),
}

/** 未匹配到业态时禁止当成餐饮，佣金记 0 */
const WAIMAI_ZERO: WaimaiCommissionPct = {
  eleme: 0,
  meituan_waimai: 0,
  jd_waimai: 0,
}

export const UNMATCHED_INDUSTRY_COMMISSION: IndustryPlatformCommissionPreset = row(
  '未识别行业',
  '未识别（须用绑定账号业态匹配）',
  { douyin: 0, meituan: 0, xhs: 0 },
  WAIMAI_ZERO,
)

/**
 * 精确 industryCode / 历史预设编码 → 费率行。
 * 含 gross-margin-advisor、类目 mock leaf、来客二级习惯编码。
 */
export const INDUSTRY_PLATFORM_COMMISSION_PRESETS: Record<string, IndustryPlatformCommissionPreset> = {
  // 空编码不再映射餐饮，避免未配置时把洗衣等业态算成 2.5%

  // —— 餐饮 ——
  life_food_general: INDUSTRY_L1_COMMISSION_TABLE.food!,
  life_food_hotpot: row('餐饮', '餐饮 > 火锅/汤锅', { douyin: 2.5, meituan: 8, xhs: 5 }),
  life_food_bbq: row('餐饮', '餐饮 > 烧烤', { douyin: 2.5, meituan: 8, xhs: 5 }),
  life_food_fast: INDUSTRY_L1_COMMISSION_TABLE.food_fast!,
  l1_food: INDUSTRY_L1_COMMISSION_TABLE.food!,
  l2_hotpot: row('餐饮', '餐饮 > 火锅/汤锅', { douyin: 2.5, meituan: 8, xhs: 5 }),
  l2_bbq: row('餐饮', '餐饮 > 烧烤/烤肉', { douyin: 2.5, meituan: 8, xhs: 5 }),
  l2_fast: INDUSTRY_L1_COMMISSION_TABLE.food_fast!,
  l2_buffet: row('餐饮', '餐饮 > 自助餐', { douyin: 2.5, meituan: 8, xhs: 5 }),
  l2_drink_shop: row('餐饮', '餐饮 > 饮品店', { douyin: 2.5, meituan: 7, xhs: 4 }, WAIMAI_FOOD_FAST),
  l2_bakery: row('餐饮', '餐饮 > 面包蛋糕甜品', { douyin: 2.5, meituan: 7, xhs: 4 }, WAIMAI_FOOD_FAST),

  // —— 丽人 ——
  life_beauty_hair: INDUSTRY_L1_COMMISSION_TABLE.beauty!,
  life_beauty_nail: row('丽人', '丽人 > 美甲美睫', { douyin: 2.5, meituan: 12, xhs: 8 }, WAIMAI_NON_FOOD),
  l1_beauty: INDUSTRY_L1_COMMISSION_TABLE.beauty!,

  // —— 休闲 / 运动 ——
  life_leisure_ktv: row('休闲娱乐', '休闲娱乐 > KTV', { douyin: 2.5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  life_sport_gym: INDUSTRY_L1_COMMISSION_TABLE.sport!,
  l1_leisure: INDUSTRY_L1_COMMISSION_TABLE.leisure!,
  l1_sport: INDUSTRY_L1_COMMISSION_TABLE.sport!,

  // —— 亲子 / 生活 / 爱车 / 购物 / 教育 / 宠物 / 医美 ——
  l1_kids: INDUSTRY_L1_COMMISSION_TABLE.kids!,
  l1_life: INDUSTRY_L1_COMMISSION_TABLE.life!,
  l1_car: INDUSTRY_L1_COMMISSION_TABLE.car!,
  l1_shopping: INDUSTRY_L1_COMMISSION_TABLE.shopping!,
  l1_edu: INDUSTRY_L1_COMMISSION_TABLE.edu!,
  l1_pet: INDUSTRY_L1_COMMISSION_TABLE.pet!,
  l1_med_beauty: INDUSTRY_L1_COMMISSION_TABLE.med_beauty!,

  // —— 毛利顾问 leaf 示例编码 ——
  l3_supermarket_voucher: row('购物', '购物 > 商超便利 > 商超代金券', { douyin: 3, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  l3_supermarket_pkg: row('购物', '购物 > 商超便利 > 到店自提套餐', { douyin: 3, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  l3_dept_giftcard: row('购物', '购物 > 百货零售 > 礼品卡/提货券', { douyin: 3, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  l3_lang_trial: row('学习培训', '学习培训 > 语言培训 > 体验课', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  l3_vocational_intro: row('学习培训', '学习培训 > 职业技能 > 入门课包', { douyin: 2, meituan: 8, xhs: 5 }, WAIMAI_NON_FOOD),
  l3_pet_bath: row('宠物', '宠物 > 宠物服务 > 洗护套餐', { douyin: 5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  l3_pet_snack: row('宠物', '宠物 > 宠物商品 > 零食礼包', { douyin: 5, meituan: 10, xhs: 6 }, WAIMAI_NON_FOOD),
  l3_skin_care: row('医疗医美', '医疗医美 > 轻医美 > 皮肤护理', { douyin: 8, meituan: 15, xhs: 10 }, WAIMAI_NON_FOOD),
}

type IndustryBucket = keyof typeof INDUSTRY_L1_COMMISSION_TABLE

/** 按经营类目路径/名称识别一级业态 */
export function resolveIndustryBucketFromPath(industryPath?: string): IndustryBucket | null {
  const blob = (industryPath ?? '').trim()
  if (!blob) return null

  if (/婚庆|婚礼|结婚|婚纱|司仪/.test(blob)) return 'wedding'
  if (/医美|医疗|口腔|眼科|体检|轻医美|皮肤护理/.test(blob)) return 'med_beauty'
  if (/酒店|民宿|住宿|客栈|宾馆|酒旅/.test(blob)) return 'hotel'
  if (/景区|门票|游玩|旅游|度假|乐园门票/.test(blob) && !/亲子|儿童乐园/.test(blob)) return 'travel'
  if (/宠物|猫|狗|洗护套餐|宠物服务/.test(blob)) return 'pet'
  if (/培训|教育|课程|语言|职业技能|学习/.test(blob)) return 'edu'
  if (/商超|购物|百货|便利|零售|数码家电/.test(blob)) return 'shopping'
  if (/爱车|洗车|汽车|汽修|保养/.test(blob)) return 'car'
  if (/家政|保洁|搬家|维修|开锁|洗衣|干洗|洗染|洗涤|洗护|洗爱|洗鞋|熨烫|月嫂|生活服务|甲醛|装修/.test(blob)) {
    return 'life'
  }
  if (/亲子|早教|托育|儿童乐园|婴儿游泳|绘本/.test(blob)) return 'kids'
  if (/健身|瑜伽|游泳|球馆|攀岩|运动|私教|团操/.test(blob)) return 'sport'
  if (/KTV|酒吧|影院|剧本杀|密室|棋牌|网吧|桌游|轰趴|温泉|桑拿|休闲娱乐|玩乐/.test(blob)) {
    return 'leisure'
  }
  if (/美发|美甲|美睫|美容|丽人|纹绣|纹身|SPA|美体|养发/.test(blob)) return 'beauty'
  if (/快餐|小吃|饮品|茶饮|咖啡|面包|蛋糕|甜品|早餐|食堂/.test(blob)) return 'food_fast'
  if (/餐饮|美食|火锅|烧烤|烤肉|自助|料理|正餐|烘焙|地方小吃/.test(blob)) return 'food'
  if (/life_food_fast|l2_fast|l2_drink|l2_bakery|l2_breakfast/.test(blob)) return 'food_fast'
  if (/life_food_|l1_food|l2_hotpot|l2_bbq/.test(blob)) return 'food'

  return null
}

function clampCommissionPct(n: number): number {
  const x = Math.round(Number(n) * 10) / 10
  if (!Number.isFinite(x)) return 0
  return Math.min(40, Math.max(0, x))
}

export function resolveIndustryCommissionPreset(
  industryCode: string,
  industryPath?: string,
): IndustryPlatformCommissionPreset {
  const code = (industryCode ?? '').trim()
  if (code && INDUSTRY_PLATFORM_COMMISSION_PRESETS[code]) {
    return INDUSTRY_PLATFORM_COMMISSION_PRESETS[code]!
  }

  // 来客类目 id 前缀兜底（如 l2bm_xxx / l2ls_xxx）
  if (/^l1_food|^l2_(hotpot|bbq|buffet|fast|snack|drink|bakery|breakfast|canteen|jp|kr)/i.test(code)) {
    if (/fast|snack|drink|bakery|breakfast|canteen/i.test(code)) {
      return INDUSTRY_L1_COMMISSION_TABLE.food_fast!
    }
    return INDUSTRY_L1_COMMISSION_TABLE.food!
  }
  if (/^l1_beauty|^l2bm/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.beauty!
  if (/^l1_leisure|^l2ls/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.leisure!
  if (/^l1_sport|^l2sp/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.sport!
  if (/^l1_kids|^l2kd/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.kids!
  if (/^l1_life|^l2lf/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.life!
  if (/^l1_car|^l2cr/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.car!
  if (/^l1_shopping|^l2sh/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.shopping!
  if (/^l1_edu|^l2ed/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.edu!
  if (/^l1_pet|^l2pt/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.pet!
  if (/^l1_med|^l2md/i.test(code)) return INDUSTRY_L1_COMMISSION_TABLE.med_beauty!

  const bucket = resolveIndustryBucketFromPath(`${code} ${industryPath ?? ''}`)
  if (bucket && INDUSTRY_L1_COMMISSION_TABLE[bucket]) {
    return INDUSTRY_L1_COMMISSION_TABLE[bucket]!
  }

  return UNMATCHED_INDUSTRY_COMMISSION
}

/** 绑定账号业态能识别时优先于毛利配置（避免空配置默认餐饮 2.5%） */
export function resolveIndustryHintForTax(
  industryCode: string,
  industryPath: string,
  boundAccountHint: string,
): { code: string; path: string } {
  const bound = boundAccountHint.trim()
  if (bound && resolveIndustryBucketFromPath(bound)) {
    return { code: '', path: bound }
  }
  return { code: (industryCode ?? '').trim(), path: (industryPath ?? '').trim() }
}

/** 按门店/绑定账号业态与平台返回佣金率（%，核销额口径粗算） */
export function platformCommissionPctForTax(
  industryCode: string,
  platformId: FinancePlatformId,
  industryPath?: string,
): number {
  const preset = resolveIndustryCommissionPreset(industryCode, industryPath)
  if (platformId === 'douyin') return clampCommissionPct(preset.groupbuy.douyin)
  if (platformId === 'meituan') return clampCommissionPct(preset.groupbuy.meituan)
  if (platformId === 'xhs') return clampCommissionPct(preset.groupbuy.xhs)
  if (platformId === 'eleme') return clampCommissionPct(preset.waimai.eleme)
  if (platformId === 'meituan_waimai') return clampCommissionPct(preset.waimai.meituan_waimai)
  if (platformId === 'jd_waimai') return clampCommissionPct(preset.waimai.jd_waimai)
  return 0
}

export function estimatePlatformCommissionYuan(verifyAmountYuan: number, commissionPct: number): number {
  const base = Number(verifyAmountYuan)
  const pct = Number(commissionPct)
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct) || pct <= 0) return 0
  return Math.round((base * pct) / 100)
}

/** 供调试/说明：列出一级业态参考费率 */
export function listIndustryL1CommissionRows(): IndustryPlatformCommissionPreset[] {
  return Object.values(INDUSTRY_L1_COMMISSION_TABLE)
}

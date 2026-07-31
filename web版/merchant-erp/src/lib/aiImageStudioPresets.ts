/**
 * 灵祺视觉工坊 — 本地生活商家 AI 出图预设
 * 参考：有赞智能海报（商品链路+太阳码）、Canva Magic Design（多稿+平台尺寸）、
 * 即梦 3.0（智能参考+多方案）、稿定（行业模板+批量多端）。
 */
import type { PlatformLogoKey } from './platformBranding'
import { PLATFORM_LOGO_SRC } from './platformBranding'

export type LocalLifeIndustryId =
  | 'catering'
  | 'beauty'
  | 'leisure'
  | 'hotel'
  | 'pet'
  | 'education'

export type PublishChannelId =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_moments'
  | 'meituan'
  | 'kuaishou'
  | 'offline_print'

export type VisualPlaybookId =
  | 'grand_opening'
  | 'flash_sale'
  | 'group_buy_new'
  | 'festival_promo'
  | 'store_visit'
  | 'member_recharge'
  | 'daily_sign'
  | 'product_hero'
  | 'logo_brand'
  | 'menu_board'
  | 'platform_carousel_five'
  | 'platform_detail_page'

export type VisualIntentId =
  | 'poster'
  | 'product'
  | 'logo'
  | 'environment'
  | 'package'
  | 'menu'
  | 'carousel'
  | 'detail'

export type AiImageSizePresetId =
  | 'moments_vertical'
  | 'square'
  | 'landscape'
  | 'a4_portrait'
  | 'a4_landscape'
  | 'print_poster'

export type AiImageStyleId =
  | 'lively'
  | 'minimal'
  | 'guochao'
  | 'fresh'
  | 'ecommerce'
  | 'premium'
  | 'warm'
  | 'healing'
  | 'cute'
  | 'business'
  | 'night'
  | 'festive'
  | 'natural'
  | 'retro'

/** 视觉模型对用户参考图的解析结果（用于并入生图 Prompt） */
export type VisualStudioReferenceAnalysis = {
  subject: string
  elements: string[]
  colors: string
  texture: string
  composition: string
  mood: string
  mergeInstruction: string
}

export function formatReferenceAnalysisForPrompt(analysis: VisualStudioReferenceAnalysis): string {
  const els = analysis.elements.filter(Boolean).slice(0, 8).join('、')
  return [
    `【参考图核心元素】主体：${analysis.subject.trim() || '见参考图'}`,
    els ? `须保留并入新图的关键元素：${els}` : '',
    analysis.colors.trim() ? `主色调：${analysis.colors.trim()}` : '',
    analysis.texture.trim() ? `材质质感：${analysis.texture.trim()}` : '',
    analysis.composition.trim() ? `构图参考：${analysis.composition.trim()}` : '',
    analysis.mood.trim() ? `氛围：${analysis.mood.trim()}` : '',
    analysis.mergeInstruction.trim()
      ? `合成要求：${analysis.mergeInstruction.trim()}（新海报须融入上述元素，文案仍以表单为准）`
      : '合成要求：将参考图核心主体/商品/场景元素自然融入新海报，保持品类与色调一致。',
  ]
    .filter(Boolean)
    .join('。')
}

export type AiImageDeliveryId = 'platform' | 'hd'

export type AiImageSizePreset = {
  id: AiImageSizePresetId
  label: string
  pixelHint: string
  wanxSize: string
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  doubaoSize: '1K' | '2K'
}

export const LOCAL_LIFE_INDUSTRIES: Array<{
  id: LocalLifeIndustryId
  label: string
  emoji: string
  defaultStyle: AiImageStyleId
  sceneHint: string
}> = [
  { id: 'catering', label: '餐饮', emoji: '🍜', defaultStyle: 'lively', sceneHint: '食欲感、烟火气、真实菜品' },
  { id: 'beauty', label: '美业', emoji: '💅', defaultStyle: 'premium', sceneHint: '高级感、干净通透、轻奢' },
  { id: 'leisure', label: '休娱', emoji: '🎱', defaultStyle: 'fresh', sceneHint: '年轻活力、社交分享感' },
  { id: 'hotel', label: '酒旅', emoji: '🏨', defaultStyle: 'minimal', sceneHint: '度假氛围、空间质感' },
  { id: 'pet', label: '宠物', emoji: '🐾', defaultStyle: 'fresh', sceneHint: '萌宠、治愈、家庭友好' },
  { id: 'education', label: '教育', emoji: '📚', defaultStyle: 'minimal', sceneHint: '信任感、专业、亲子' },
]

/** 二级业态（一级业态下的细分类目） */
export type IndustrySubCategory = {
  id: string
  industryId: LocalLifeIndustryId
  label: string
  sceneHint: string
  adjustHint?: string
}

export const INDUSTRY_SUB_CATEGORIES: IndustrySubCategory[] = [
  { id: 'catering_chinese', industryId: 'catering', label: '中餐正餐', sceneHint: '家常菜、宴席、招牌菜' },
  { id: 'catering_hotpot', industryId: 'catering', label: '火锅烧烤', sceneHint: '热气腾腾、聚餐氛围' },
  { id: 'catering_tea', industryId: 'catering', label: '茶饮咖啡', sceneHint: '清爽打卡、轻食下午茶' },
  { id: 'catering_bakery', industryId: 'catering', label: '烘焙甜品', sceneHint: '精致甜蜜、下午茶' },
  { id: 'catering_snack', industryId: 'catering', label: '快餐小吃', sceneHint: '便捷管饱、性价比' },
  { id: 'beauty_hair', industryId: 'beauty', label: '美发造型', sceneHint: '发型设计、染烫护理' },
  { id: 'beauty_nail', industryId: 'beauty', label: '美甲美睫', sceneHint: '精致细节、少女感' },
  { id: 'beauty_skin', industryId: 'beauty', label: '皮肤管理', sceneHint: '清洁修护、透亮肌肤' },
  { id: 'beauty_med', industryId: 'beauty', label: '轻医美', sceneHint: '专业安全、效果可见' },
  {
    id: 'leisure_foot_spa',
    industryId: 'leisure',
    label: '足浴按摩',
    sceneHint: '放松解压、洁净舒适、养生疗愈',
    adjustHint: '足浴按摩侧重环境舒适、技师手法与团购足疗',
  },
  { id: 'leisure_billiards', industryId: 'leisure', label: '台球桌游', sceneHint: '好友局、竞技娱乐' },
  { id: 'leisure_ktv', industryId: 'leisure', label: 'KTV酒吧', sceneHint: '夜生活、聚会嗨玩' },
  { id: 'leisure_escape', industryId: 'leisure', label: '影院密室', sceneHint: '沉浸式体验、团建' },
  { id: 'leisure_fitness', industryId: 'leisure', label: '健身运动', sceneHint: '活力自律、塑形锻炼' },
  { id: 'hotel_stay', industryId: 'hotel', label: '酒店民宿', sceneHint: '住宿体验、空间质感' },
  { id: 'hotel_spring', industryId: 'hotel', label: '温泉度假', sceneHint: '疗愈放松、度假氛围' },
  { id: 'hotel_scenic', industryId: 'hotel', label: '景区游乐', sceneHint: '亲子出游、景点打卡' },
  { id: 'pet_grooming', industryId: 'pet', label: '宠物洗护', sceneHint: '萌宠洗澡美容' },
  { id: 'pet_clinic', industryId: 'pet', label: '宠物医疗', sceneHint: '专业养护、信任感' },
  { id: 'pet_supplies', industryId: 'pet', label: '宠物用品', sceneHint: '主粮零食、铲屎官必囤' },
  { id: 'edu_k12', industryId: 'education', label: 'K12学科', sceneHint: '提分辅导、专业师资' },
  { id: 'edu_art', industryId: 'education', label: '艺术兴趣', sceneHint: '启蒙培养、兴趣特长' },
  { id: 'edu_vocational', industryId: 'education', label: '职业技能', sceneHint: '实用技能、就业导向' },
]

export function getSubCategoriesForIndustry(industryId: LocalLifeIndustryId): IndustrySubCategory[] {
  return INDUSTRY_SUB_CATEGORIES.filter((s) => s.industryId === industryId)
}

export function resolveIndustrySubCategory(id: string): IndustrySubCategory | null {
  return INDUSTRY_SUB_CATEGORIES.find((s) => s.id === id) ?? null
}

export function defaultSubCategoryForIndustry(industryId: LocalLifeIndustryId): string {
  return getSubCategoriesForIndustry(industryId)[0]?.id ?? ''
}

export function resolveIndustrySceneContext(form: {
  industry: LocalLifeIndustryId
  industrySubId: string
}): {
  label: string
  sceneHint: string
  adjustHint?: string
} {
  const top = LOCAL_LIFE_INDUSTRIES.find((x) => x.id === form.industry)
  const sub = form.industrySubId ? resolveIndustrySubCategory(form.industrySubId) : null
  if (sub) {
    return {
      label: `${top?.label ?? '本地生活'}-${sub.label}`,
      sceneHint: sub.sceneHint,
      adjustHint: sub.adjustHint,
    }
  }
  return {
    label: top?.label ?? '本地生活',
    sceneHint: top?.sceneHint ?? '',
  }
}

/** 五连图 / 详情图专用渠道（抖音、快手、美团） */
export const PLATFORM_SERIES_CHANNELS: PublishChannelId[] = ['douyin', 'kuaishou', 'meituan']

export const PLATFORM_SERIES_SLOT_COUNT = 5

/**
 * 各平台门店头图轮播「单张」像素（公网装修规范汇总，用于五连图裁切）。
 * - 美团大图轮播：须 >750×400 且长宽比 15:8（设计导航/商家装修常见标准）
 * - 抖音来客门店投图：培训材料建议 1125×480（与美团宽度不同）
 * - 快手本地：业界常用 16:9 海报轮播 750×422
 */
export type PlatformCarouselFiveSpec = {
  channelId: PublishChannelId
  slideWidth: number
  slideHeight: number
  /** 平台侧说明（展示用） */
  specNote: string
}

export const PLATFORM_CAROUSEL_FIVE_SPECS: Record<
  'douyin' | 'kuaishou' | 'meituan',
  PlatformCarouselFiveSpec
> = {
  meituan: {
    channelId: 'meituan',
    slideWidth: 750,
    slideHeight: 400,
    specNote: '美团大图轮播单张 750×400（15:8）',
  },
  douyin: {
    channelId: 'douyin',
    slideWidth: 1125,
    slideHeight: 480,
    specNote: '抖音来客门店投图/头图轮播单张 1125×480',
  },
  kuaishou: {
    channelId: 'kuaishou',
    slideWidth: 750,
    slideHeight: 422,
    specNote: '快手本地海报轮播 16:9 · 750×422',
  },
}

export function resolvePlatformCarouselFiveSpec(channelId: PublishChannelId): PlatformCarouselFiveSpec {
  if (channelId === 'douyin' || channelId === 'kuaishou' || channelId === 'meituan') {
    return PLATFORM_CAROUSEL_FIVE_SPECS[channelId]
  }
  return PLATFORM_CAROUSEL_FIVE_SPECS.meituan
}

/** 五连图：先出一张「单张宽×5」超宽主图（API 边长 768–4096），再等宽等高裁成 5 张并缩放到平台尺寸 */
export function platformCarouselMasterGenSize(channelId: PublishChannelId): {
  wanxSize: string
  pixelHint: string
  slideSpec: PlatformCarouselFiveSpec
  /** 主图目标宽高比（用于 Prompt，勿用 16:9） */
  masterAspectLabel: string
} {
  const slideSpec = resolvePlatformCarouselFiveSpec(channelId)
  const idealW = slideSpec.slideWidth * PLATFORM_SERIES_SLOT_COUNT
  const idealH = slideSpec.slideHeight
  const ratio = idealW / idealH
  // 优先贴齐「宽=5×单张宽」的比例；受万相边长上限约束时等比缩小
  let w = Math.min(4096, Math.max(768, idealW))
  let h = Math.round(w / ratio)
  if (h < 768) {
    h = 768
    w = Math.min(4096, Math.round(h * ratio))
    h = Math.max(768, Math.round(w / ratio))
  }
  if (h > 4096) {
    h = 4096
    w = Math.min(4096, Math.round(h * ratio))
  }
  return {
    wanxSize: `${w}*${h}`,
    pixelHint: `${w}×${h} → 等分裁 ${slideSpec.slideWidth}×${slideSpec.slideHeight}×5`,
    slideSpec,
    masterAspectLabel: `${PLATFORM_SERIES_SLOT_COUNT}×(${slideSpec.slideWidth}:${slideSpec.slideHeight})`,
  }
}

export function isCarouselFivePlaybook(playbookId: VisualPlaybookId): boolean {
  return playbookId === 'platform_carousel_five'
}

/** 五连图整幅横幅 Prompt 片段（从左到右 5 段，供一次生图） */
export function buildCarouselFiveMasterPromptExtra(
  channelId: PublishChannelId,
): string[] {
  const spec = resolvePlatformCarouselFiveSpec(channelId)
  const ch = resolveChannel(channelId)
  const labels = CAROUSEL_FIVE_SLOTS.map((s) => s.label).join(' → ')
  const masterW = spec.slideWidth * PLATFORM_SERIES_SLOT_COUNT
  return [
    `【五连图整幅超宽横幅 · ${ch.label}】先生成 1 张完整横版大图（目标约 ${masterW}×${spec.slideHeight}），从左到右均分 5 个等宽等高板块：${labels}。`,
    '整幅必须是一张连续横图（不是 5 张拼贴的拼接痕迹）：背景渐变、光效、装饰线、字体与配色全幅统一，板块等宽等高、可横滑无缝衔接；禁止每段独立换风格或换背景。',
    ...CAROUSEL_FIVE_SLOTS.map((s, i) => `第 ${i + 1} 段（${s.label}）：${s.prompt.replace(/^五连图第\d+张[^：:]*[：:]/, '')}`),
    `后处理将把整幅图等宽裁成 5 张，再缩放到平台单张 ${spec.slideWidth}×${spec.slideHeight}（${spec.specNote}）上传门店头图轮播。`,
  ]
}

export type PlatformSeriesSlot = {
  label: string
  prompt: string
}

export const CAROUSEL_FIVE_SLOTS: PlatformSeriesSlot[] = [
  {
    label: '封面',
    prompt:
      '五连图第1张（封面）：门店头图轮播首屏，大标题+品牌氛围，右侧/边缘预留与第2张衔接的延展元素（色调、光效、装饰线连续）。',
  },
  {
    label: '卖点1',
    prompt:
      '五连图第2张：承接封面视觉语言，突出核心卖点或服务特色，左右边缘色彩/背景须与相邻图可横滑拼接。',
  },
  {
    label: '卖点2',
    prompt: '五连图第3张：展示环境/产品/技师团队等信任要素，延续同一套配色与字体风格，适合横向滑动浏览。',
  },
  {
    label: '套餐',
    prompt: '五连图第4张：团购套餐或价格组合，数字醒目，与前后图背景层次一致，避免突兀换色。',
  },
  {
    label: '行动',
    prompt: '五连图第5张（收尾）：到店/抢购/预约行动号召，品牌定帧，左侧可与第4张视觉衔接。',
  },
]

export const DETAIL_PAGE_SLOTS: PlatformSeriesSlot[] = [
  {
    label: '品牌',
    prompt: '详情长图第1段：品牌/门店介绍，大图+中英文标题，高端商业详情页首屏风格。',
  },
  {
    label: '品质',
    prompt: '详情长图第2段：服务品质/手法/专业度，可含小图 inset，强调信任感。',
  },
  {
    label: '环境',
    prompt: '详情长图第3段：门店环境/空间质感，适合竖向拼接在团购详情页。',
  },
  {
    label: '优惠',
    prompt: '详情长图第4段：套餐内容与到手价，促销信息清晰，与上下段色调统一。',
  },
  {
    label: '引导',
    prompt: '详情长图第5段：预约/抢购/到店引导，留白底部安全区，适合详情页末尾。',
  },
]

export const PUBLISH_CHANNELS: Array<{
  id: PublishChannelId
  label: string
  short: string
  color: string
  primarySizeId: AiImageSizePresetId
  carouselSizeId?: AiImageSizePresetId
  detailSizeId?: AiImageSizePresetId
  extraSizeIds?: AiImageSizePresetId[]
  publishTips: string[]
}> = [
  {
    id: 'douyin',
    label: '抖音 / 来客',
    short: '抖音',
    color: '#111827',
    primarySizeId: 'moments_vertical',
    carouselSizeId: 'landscape',
    detailSizeId: 'a4_portrait',
    publishTips: ['竖屏 9:16', '主标题 6 字内更易读', '留底部安全区放团购入口', '五连图单张 1125×480'],
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    short: '小红书',
    color: '#ff2442',
    primarySizeId: 'moments_vertical',
    publishTips: ['封面 3:4 竖图', '强调探店真实感', '副标题可写人均/地址'],
  },
  {
    id: 'wechat_moments',
    label: '微信朋友圈',
    short: '朋友圈',
    color: '#07c160',
    primarySizeId: 'square',
    extraSizeIds: ['moments_vertical'],
    publishTips: ['方形 1:1 传播最广', '价格信息要醒目', 'JPEG ≤3MB'],
  },
  {
    id: 'meituan',
    label: '美团 / 点评',
    short: '美团',
    color: '#ffc300',
    primarySizeId: 'square',
    carouselSizeId: 'landscape',
    detailSizeId: 'a4_portrait',
    publishTips: ['团购主图偏 1:1', '突出套餐组合与到手价', '避免过多小字', '五连图单张 750×400（15:8）'],
  },
  {
    id: 'kuaishou',
    label: '快手本地',
    short: '快手',
    color: '#ff4906',
    primarySizeId: 'moments_vertical',
    carouselSizeId: 'landscape',
    detailSizeId: 'a4_portrait',
    publishTips: ['竖屏短视频封面同尺寸', '大字报风格转化更好', '五连图单张 750×422'],
  },
  {
    id: 'offline_print',
    label: '线下印刷',
    short: '印刷',
    color: '#64748b',
    primarySizeId: 'print_poster',
    extraSizeIds: ['a4_portrait'],
    publishTips: ['建议高清 PNG', 'A4 / 大海报分场景选用'],
  },
]

/** 视觉工坊渠道对应平台 Logo */
export const PUBLISH_CHANNEL_LOGO: Partial<Record<PublishChannelId, PlatformLogoKey>> = {
  douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
  wechat_moments: 'wechat_moments',
  meituan: 'dianping',
  kuaishou: 'kuaishou_local',
}

export function publishChannelLogoSrc(channelId: PublishChannelId): string | null {
  const key = PUBLISH_CHANNEL_LOGO[channelId]
  return key ? PLATFORM_LOGO_SRC[key] : null
}

export const VISUAL_PLAYBOOKS: Array<{
  id: VisualPlaybookId
  label: string
  desc: string
  intent: VisualIntentId
  emoji: string
  suggestedChannels: PublishChannelId[]
  styleId: AiImageStyleId
  titleTemplates: string[]
  subtitleTemplates: string[]
  offerTemplates: string[]
}> = [
  {
    id: 'grand_opening',
    label: '开业引流',
    desc: '新店开业、试营业、首单立减',
    intent: 'poster',
    emoji: '🎉',
    suggestedChannels: ['douyin', 'wechat_moments', 'meituan'],
    styleId: 'lively',
    titleTemplates: ['{store}盛大开业', '开业福利来了', '新店首发 · 限时特惠'],
    subtitleTemplates: ['前100名到店有礼', '打卡拍照送小食', '附近街坊都在问'],
    offerTemplates: ['满50减20', '首单8折', '双人餐¥99'],
  },
  {
    id: 'flash_sale',
    label: '限时秒杀',
    desc: '48小时闪购、清仓、尾货',
    intent: 'poster',
    emoji: '⚡',
    suggestedChannels: ['douyin', 'kuaishou', 'wechat_moments'],
    styleId: 'guochao',
    titleTemplates: ['限时秒杀', '今晚8点开抢', '手慢无 · 最后{offer}'],
    subtitleTemplates: ['售完即止', '仅限今日', '库存告急'],
    offerTemplates: ['5折起', '立减30元', '买一送一'],
  },
  {
    id: 'group_buy_new',
    label: '团购上新',
    desc: '套餐上架、组合卖点',
    intent: 'package',
    emoji: '🛒',
    suggestedChannels: ['meituan', 'douyin', 'xiaohongshu'],
    styleId: 'lively',
    titleTemplates: ['{store}超值团购', '双人/四人餐上新', '这份套餐太划算了'],
    subtitleTemplates: ['含招牌菜+饮品', '周末通用', '免预约'],
    offerTemplates: ['¥99双人餐', '原价¥168现¥128', '3-4人餐¥199'],
  },
  {
    id: 'festival_promo',
    label: '节日大促',
    desc: '端午、中秋、国庆、情人节',
    intent: 'poster',
    emoji: '🏮',
    suggestedChannels: ['wechat_moments', 'douyin', 'offline_print'],
    styleId: 'guochao',
    titleTemplates: ['节日限定福利', '{store}陪你过节', '团圆/聚会首选'],
    subtitleTemplates: ['节日套餐限时', '提前预约享礼', '送礼/聚餐皆宜'],
    offerTemplates: ['满200减50', '节日专享8.8折', '赠特色小食'],
  },
  {
    id: 'store_visit',
    label: '探店种草',
    desc: '达人招募、UGC、打卡',
    intent: 'environment',
    emoji: '📸',
    suggestedChannels: ['xiaohongshu', 'douyin'],
    styleId: 'fresh',
    titleTemplates: ['这家{store}太出片', '本地人私藏好店', '氛围感拉满'],
    subtitleTemplates: ['适合拍照打卡', '人均友好', '隐藏菜单推荐'],
    offerTemplates: ['打卡送饮品', '探店套餐', ''],
  },
  {
    id: 'member_recharge',
    label: '会员储值',
    desc: '储值送礼、复购锁客',
    intent: 'poster',
    emoji: '💳',
    suggestedChannels: ['wechat_moments', 'meituan'],
    styleId: 'premium',
    titleTemplates: ['会员储值加赠', '老客专享回馈', '充300送50'],
    subtitleTemplates: ['到店核销', '长期有效', '可与活动同享'],
    offerTemplates: ['充500送100', '储值9折', '赠招牌菜1份'],
  },
  {
    id: 'daily_sign',
    label: '日签海报',
    desc: '每日营业、天气联动、社群触达',
    intent: 'poster',
    emoji: '☀️',
    suggestedChannels: ['wechat_moments'],
    styleId: 'minimal',
    titleTemplates: ['今日营业中', '早安 · {store}', '美好一天从这里开始'],
    subtitleTemplates: ['欢迎预约', '今日推荐', ''],
    offerTemplates: ['', '', ''],
  },
  {
    id: 'product_hero',
    label: '招牌单品',
    desc: '爆款菜、引流品、主图',
    intent: 'product',
    emoji: '🔥',
    suggestedChannels: ['meituan', 'douyin', 'xiaohongshu'],
    styleId: 'ecommerce',
    titleTemplates: ['招牌{offer}', '镇店之宝', '必点TOP1'],
    subtitleTemplates: ['销量领先', '回头客最多', '现做现卖'],
    offerTemplates: ['¥28', '第二份半价', ''],
  },
  {
    id: 'logo_brand',
    label: '品牌标识',
    desc: 'Logo、头像、门头字',
    intent: 'logo',
    emoji: '✨',
    suggestedChannels: ['wechat_moments', 'offline_print'],
    styleId: 'minimal',
    titleTemplates: ['{store}', '{store} · 本地生活', ''],
    subtitleTemplates: ['', '', ''],
    offerTemplates: ['', '', ''],
  },
  {
    id: 'menu_board',
    label: '菜单价目',
    desc: '电子菜单、价目视觉',
    intent: 'menu',
    emoji: '📋',
    suggestedChannels: ['offline_print', 'meituan'],
    styleId: 'lively',
    titleTemplates: ['{store}价目表', '今日推荐', ''],
    subtitleTemplates: ['', '', ''],
    offerTemplates: ['', '', ''],
  },
  {
    id: 'platform_carousel_five',
    label: '五连图',
    desc: '门店头图轮播，5 张横滑衔接',
    intent: 'carousel',
    emoji: '🎠',
    suggestedChannels: ['douyin', 'kuaishou', 'meituan'],
    styleId: 'premium',
    titleTemplates: ['{store} · 全新升级', 'NEW STORE OPENING', '{store}品质之选'],
    subtitleTemplates: ['横滑浏览五连图', '豪华阵容 · 舒适体验', '团购热卖中'],
    offerTemplates: ['限时¥99', '首单立减', ''],
  },
  {
    id: 'platform_detail_page',
    label: '详情图',
    desc: '团购详情页竖向长图，5 段拼接',
    intent: 'detail',
    emoji: '📱',
    suggestedChannels: ['douyin', 'kuaishou', 'meituan'],
    styleId: 'premium',
    titleTemplates: ['提升服务品质', '{store} · 匠心之作', '放慢脚步 享受生活'],
    subtitleTemplates: ['IMPROVE SERVICE QUALITY', '专业团队 · 舒适环境', '预约到店更省心'],
    offerTemplates: ['¥99起', '限时团购', ''],
  },
]

export const AI_IMAGE_SIZE_PRESETS: AiImageSizePreset[] = [
  {
    id: 'moments_vertical',
    label: '竖屏',
    pixelHint: '1080×1920',
    wanxSize: '720*1280',
    aspectRatio: '9:16',
    doubaoSize: '2K',
  },
  {
    id: 'square',
    label: '方形',
    pixelHint: '1080×1080',
    wanxSize: '1024*1024',
    aspectRatio: '1:1',
    doubaoSize: '2K',
  },
  {
    id: 'landscape',
    label: '横屏',
    pixelHint: '1920×1080',
    wanxSize: '1280*720',
    aspectRatio: '16:9',
    doubaoSize: '2K',
  },
  {
    id: 'a4_portrait',
    label: 'A4竖',
    pixelHint: '210×297mm',
    wanxSize: '832*1184',
    aspectRatio: '3:4',
    doubaoSize: '2K',
  },
  {
    id: 'a4_landscape',
    label: 'A4横',
    pixelHint: '297×210mm',
    wanxSize: '1184*832',
    aspectRatio: '4:3',
    doubaoSize: '2K',
  },
  {
    id: 'print_poster',
    label: '大海报',
    pixelHint: '90×60cm',
    wanxSize: '1440*960',
    aspectRatio: '16:9',
    doubaoSize: '2K',
  },
]

export const AI_IMAGE_STYLE_PRESETS: Array<{ id: AiImageStyleId; label: string; promptHint: string }> = [
  { id: 'lively', label: '烟火气', promptHint: '本地生活烟火气、暖光、真实质感、街头店招感' },
  { id: 'premium', label: '轻奢', promptHint: '轻奢质感、低饱和、留白、干净高级、门店商业海报' },
  { id: 'minimal', label: '极简', promptHint: '极简排版、高级灰、信息清晰' },
  { id: 'guochao', label: '国潮', promptHint: '国潮配色、书法标题、年轻促销感' },
  { id: 'fresh', label: '清新', promptHint: '明亮自然光、清爽、健康、探店风' },
  { id: 'ecommerce', label: '爆款', promptHint: '电商爆款构图、主体突出、促销标签' },
  { id: 'warm', label: '暖色舒适', promptHint: '暖黄柔光、舒适放松、居家感、亲和力强' },
  { id: 'healing', label: '养生疗愈', promptHint: '舒缓疗愈、木质与绿植、低对比、养生足浴美业氛围' },
  { id: 'cute', label: '可爱少女', promptHint: '粉彩马卡龙、圆润字体、少女感、美甲美睫甜品风' },
  { id: 'business', label: '商务简约', promptHint: '商务可信、蓝灰主色、信息层级清晰、职业培训感' },
  { id: 'night', label: '夜场霓虹', promptHint: '霓虹灯、暗色背景、高对比、KTV酒吧夜生活' },
  { id: 'festive', label: '节庆促销', promptHint: '节日元素、红包礼花、强促销、限时抢购' },
  { id: 'natural', label: '自然纪实', promptHint: '自然光纪实、真实不摆拍、探店种草、景区宠物' },
  { id: 'retro', label: '复古怀旧', promptHint: '复古胶片、怀旧色调、老招牌、经典国味' },
]

const STYLE_BY_INDUSTRY: Record<LocalLifeIndustryId, AiImageStyleId[]> = {
  catering: ['lively', 'warm', 'fresh', 'guochao', 'ecommerce', 'festive', 'minimal', 'premium', 'retro', 'natural'],
  beauty: ['premium', 'fresh', 'minimal', 'cute', 'healing', 'natural', 'ecommerce', 'lively', 'warm', 'guochao'],
  leisure: ['lively', 'premium', 'healing', 'warm', 'minimal', 'fresh', 'night', 'guochao', 'ecommerce', 'festive'],
  hotel: ['premium', 'natural', 'fresh', 'minimal', 'warm', 'healing', 'lively', 'festive', 'retro', 'ecommerce'],
  pet: ['cute', 'fresh', 'natural', 'lively', 'warm', 'minimal', 'ecommerce', 'premium', 'festive', 'guochao'],
  education: ['business', 'fresh', 'minimal', 'premium', 'lively', 'guochao', 'ecommerce', 'warm', 'natural', 'festive'],
}

/** 二级类目专属风格排序（覆盖一级业态默认） */
const INDUSTRY_SUB_STYLE_OVERRIDES: Partial<Record<string, AiImageStyleId[]>> = {
  catering_chinese: ['lively', 'warm', 'guochao', 'retro', 'festive', 'ecommerce', 'premium', 'minimal', 'fresh', 'natural'],
  catering_hotpot: ['lively', 'warm', 'festive', 'guochao', 'ecommerce', 'premium', 'fresh', 'minimal', 'natural', 'retro'],
  catering_tea: ['fresh', 'cute', 'minimal', 'premium', 'lively', 'natural', 'ecommerce', 'warm', 'guochao', 'festive'],
  catering_bakery: ['cute', 'fresh', 'premium', 'warm', 'minimal', 'lively', 'ecommerce', 'festive', 'natural', 'guochao'],
  catering_snack: ['lively', 'ecommerce', 'warm', 'festive', 'guochao', 'fresh', 'minimal', 'premium', 'natural', 'retro'],
  beauty_hair: ['premium', 'fresh', 'minimal', 'lively', 'guochao', 'cute', 'ecommerce', 'warm', 'natural', 'festive'],
  beauty_nail: ['cute', 'fresh', 'premium', 'minimal', 'lively', 'warm', 'ecommerce', 'guochao', 'natural', 'festive'],
  beauty_skin: ['healing', 'premium', 'fresh', 'minimal', 'natural', 'warm', 'cute', 'ecommerce', 'lively', 'business'],
  beauty_med: ['business', 'premium', 'minimal', 'fresh', 'healing', 'natural', 'warm', 'lively', 'ecommerce', 'guochao'],
  leisure_foot_spa: ['healing', 'premium', 'warm', 'lively', 'minimal', 'fresh', 'natural', 'ecommerce', 'guochao', 'business'],
  leisure_billiards: ['lively', 'night', 'guochao', 'premium', 'ecommerce', 'minimal', 'warm', 'fresh', 'festive', 'retro'],
  leisure_ktv: ['night', 'lively', 'guochao', 'premium', 'festive', 'ecommerce', 'warm', 'minimal', 'fresh', 'retro'],
  leisure_escape: ['lively', 'guochao', 'night', 'fresh', 'premium', 'festive', 'minimal', 'warm', 'ecommerce', 'natural'],
  leisure_fitness: ['lively', 'fresh', 'premium', 'minimal', 'natural', 'business', 'ecommerce', 'warm', 'guochao', 'festive'],
  hotel_stay: ['premium', 'natural', 'minimal', 'warm', 'fresh', 'healing', 'lively', 'retro', 'ecommerce', 'festive'],
  hotel_spring: ['healing', 'natural', 'premium', 'warm', 'fresh', 'minimal', 'lively', 'festive', 'ecommerce', 'retro'],
  hotel_scenic: ['natural', 'fresh', 'lively', 'festive', 'warm', 'premium', 'minimal', 'guochao', 'ecommerce', 'retro'],
  pet_grooming: ['cute', 'fresh', 'natural', 'lively', 'warm', 'minimal', 'ecommerce', 'premium', 'festive', 'guochao'],
  pet_clinic: ['business', 'fresh', 'natural', 'premium', 'minimal', 'warm', 'lively', 'healing', 'ecommerce', 'cute'],
  pet_supplies: ['cute', 'lively', 'ecommerce', 'fresh', 'warm', 'festive', 'minimal', 'natural', 'premium', 'guochao'],
  edu_k12: ['business', 'fresh', 'lively', 'premium', 'minimal', 'guochao', 'warm', 'ecommerce', 'festive', 'natural'],
  edu_art: ['cute', 'fresh', 'lively', 'guochao', 'premium', 'minimal', 'warm', 'natural', 'festive', 'ecommerce'],
  edu_vocational: ['business', 'premium', 'minimal', 'fresh', 'lively', 'warm', 'ecommerce', 'guochao', 'natural', 'festive'],
}

export function getStyleIdsForIndustrySub(industrySubId: string, industryId?: LocalLifeIndustryId): AiImageStyleId[] {
  const override = INDUSTRY_SUB_STYLE_OVERRIDES[industrySubId]
  if (override?.length) return override
  const sub = resolveIndustrySubCategory(industrySubId)
  const ind = industryId ?? sub?.industryId
  if (ind && STYLE_BY_INDUSTRY[ind]?.length) return STYLE_BY_INDUSTRY[ind]
  return AI_IMAGE_STYLE_PRESETS.slice(0, 10).map((s) => s.id)
}

export function getStylePresetsForIndustrySub(
  industrySubId: string,
  industryId?: LocalLifeIndustryId,
): Array<{ id: AiImageStyleId; label: string; promptHint: string }> {
  const ids = getStyleIdsForIndustrySub(industrySubId, industryId)
  const map = new Map(AI_IMAGE_STYLE_PRESETS.map((s) => [s.id, s]))
  return ids.map((id) => map.get(id)).filter(Boolean) as Array<{
    id: AiImageStyleId
    label: string
    promptHint: string
  }>
}

export function defaultStyleForIndustrySub(industrySubId: string, industryId?: LocalLifeIndustryId): AiImageStyleId {
  const ids = getStyleIdsForIndustrySub(industrySubId, industryId)
  return ids[0] ?? 'lively'
}

export function normalizeStyleIdForSub(
  styleId: AiImageStyleId,
  industrySubId: string,
  industryId?: LocalLifeIndustryId,
): AiImageStyleId {
  const ids = getStyleIdsForIndustrySub(industrySubId, industryId)
  return ids.includes(styleId) ? styleId : (ids[0] ?? styleId)
}

export type VisualStudioForm = {
  industry: LocalLifeIndustryId
  /** 二级业态 id，如 leisure_foot_spa */
  industrySubId: string
  channels: PublishChannelId[]
  playbook: VisualPlaybookId
  /** 玩法细分选项 id（节日名称、套餐规格等） */
  playbookVariantId: string
  storeName: string
  headline: string
  subheadline: string
  offer: string
  timeRange: string
  note: string
  /** 参考关键词：可 AI 生成或手填，与参考图一并约束出图 */
  referenceKeywords: string
  styleId: AiImageStyleId
  variantCount: 2 | 4
  delivery: AiImageDeliveryId
  multiChannelPack: boolean
}

export const DEFAULT_VISUAL_STUDIO_FORM: VisualStudioForm = {
  industry: 'catering',
  industrySubId: 'catering_chinese',
  channels: ['douyin', 'wechat_moments'],
  playbook: 'group_buy_new',
  playbookVariantId: '',
  storeName: '',
  headline: '',
  subheadline: '',
  offer: '',
  timeRange: '',
  note: '',
  referenceKeywords: '',
  styleId: 'lively',
  variantCount: 4,
  delivery: 'platform',
  multiChannelPack: true,
}

export type PlaybookVariantOption = {
  id: string
  label: string
  /** 展示在选项下方的时段说明 */
  periodLabel: string
  headline?: string
  subheadline?: string
  offer?: string
  timeRange?: string
  note?: string
  styleId?: AiImageStyleId
}

export type PlaybookVariantConfig = {
  pickerLabel: string
  options: PlaybookVariantOption[]
}

/** 各玩法下的可筛选细分场景（选中后自动写入文案③与时间） */
export const PLAYBOOK_VARIANT_CONFIGS: Partial<Record<VisualPlaybookId, PlaybookVariantConfig>> = {
  festival_promo: {
    pickerLabel: '选择节日',
    options: [
      {
        id: 'spring_festival',
        label: '春节',
        periodLabel: '2026年2月17日—3月3日（正月初一至十五）',
        headline: '春节团圆宴',
        subheadline: '年夜饭/聚会套餐预订',
        offer: '满300减80',
        timeRange: '2026年2月17日—3月3日',
        note: '恭贺新春 · 需提前预约',
        styleId: 'guochao',
      },
      {
        id: 'valentine',
        label: '情人节',
        periodLabel: '2月14日',
        headline: '情人节双人餐',
        subheadline: '浪漫氛围 · 限量席位',
        offer: '双人套餐¥199',
        timeRange: '2月14日当天',
        note: '可赠甜品/玫瑰',
      },
      {
        id: 'dragon_boat',
        label: '端午节',
        periodLabel: '2026年5月31日（农历五月初五）',
        headline: '端午安康 · 节日限定',
        subheadline: '粽子礼盒/聚餐套餐',
        offer: '满200减50',
        timeRange: '2026年5月29日—5月31日',
        note: '端午安康',
        styleId: 'guochao',
      },
      {
        id: 'qixi',
        label: '七夕',
        periodLabel: '2026年8月19日（农历七月初七）',
        headline: '七夕约会首选',
        subheadline: '双人浪漫套餐',
        offer: '8.8折',
        timeRange: '2026年8月19日前后3天',
        note: '提前预约更省心',
      },
      {
        id: 'mid_autumn',
        label: '中秋节',
        periodLabel: '2026年9月25日（农历八月十五）',
        headline: '中秋团圆宴',
        subheadline: '月饼礼盒 + 聚餐套餐',
        offer: '满200减50',
        timeRange: '2026年9月24日—9月26日',
        note: '团圆/送礼皆宜',
        styleId: 'guochao',
      },
      {
        id: 'national_day',
        label: '国庆节',
        periodLabel: '10月1日—10月7日',
        headline: '国庆狂欢',
        subheadline: '假期聚会 · 全家通用',
        offer: '节日专享8.8折',
        timeRange: '10月1日—10月7日',
        note: '假期正常营业',
      },
      {
        id: 'double11',
        label: '双11',
        periodLabel: '11月11日',
        headline: '双11限时钜惠',
        subheadline: '全年最低价',
        offer: '5折起',
        timeRange: '11月10日—11月12日',
        note: '售完即止',
      },
      {
        id: 'new_year',
        label: '元旦',
        periodLabel: '1月1日—1月3日',
        headline: '元旦迎新',
        subheadline: '跨年/开年聚餐',
        offer: '满100减20',
        timeRange: '1月1日—1月3日',
        note: '新年快乐',
      },
    ],
  },
  flash_sale: {
    pickerLabel: '秒杀时段',
    options: [
      {
        id: 'tonight_8',
        label: '今晚8点',
        periodLabel: '今日 20:00—24:00',
        headline: '今晚8点秒杀',
        subheadline: '准时开抢 · 手慢无',
        offer: '5折起',
        timeRange: '今日 20:00—24:00',
        note: '售完即止',
      },
      {
        id: 'weekend',
        label: '周末专场',
        periodLabel: '周六日全天',
        headline: '周末限时秒杀',
        subheadline: '仅限周末',
        offer: '立减30元',
        timeRange: '周六日 10:00—22:00',
      },
      {
        id: 'lunch',
        label: '午间闪购',
        periodLabel: '11:00—14:00',
        headline: '午市秒杀',
        subheadline: '工作日午间专享',
        offer: '买一送一',
        timeRange: '工作日 11:00—14:00',
      },
      {
        id: 'clearance',
        label: '清仓特惠',
        periodLabel: '售完即止',
        headline: '清仓最后一批',
        subheadline: '库存告急',
        offer: '3折起',
        timeRange: '售完即止',
        note: '不退不换',
      },
    ],
  },
  group_buy_new: {
    pickerLabel: '套餐规格',
    options: [
      {
        id: 'double',
        label: '双人餐',
        periodLabel: '2人适用',
        headline: '超值双人餐',
        subheadline: '含招牌菜+饮品',
        offer: '¥99双人餐',
        timeRange: '周末通用',
        note: '免预约',
      },
      {
        id: 'triple',
        label: '3-4人餐',
        periodLabel: '3-4人适用',
        headline: '3-4人欢聚餐',
        subheadline: '分量足 · 性价比高',
        offer: '¥168/3-4人',
        timeRange: '午晚市通用',
      },
      {
        id: 'family',
        label: '家庭套餐',
        periodLabel: '4-6人适用',
        headline: '家庭聚餐套餐',
        subheadline: '老少皆宜',
        offer: '¥199家庭餐',
        timeRange: '全天可用',
        note: '可外带',
      },
      {
        id: 'lunch_set',
        label: '午市套餐',
        periodLabel: '11:00—14:00',
        headline: '午市工作餐',
        subheadline: '上菜快 · 管饱',
        offer: '¥39起',
        timeRange: '工作日 11:00—14:00',
      },
    ],
  },
  grand_opening: {
    pickerLabel: '开业阶段',
    options: [
      {
        id: 'soft_open',
        label: '试营业',
        periodLabel: '试营业期间',
        headline: '试营业福利',
        subheadline: '前100名到店有礼',
        offer: '首单8折',
        timeRange: '试营业期间',
        note: '欢迎提意见',
      },
      {
        id: 'grand',
        label: '正式开业',
        periodLabel: '开业当天',
        headline: '盛大开业',
        subheadline: '打卡拍照送小食',
        offer: '满50减20',
        timeRange: '开业当天及前后3天',
        styleId: 'lively',
      },
      {
        id: 'anniversary',
        label: '周年庆',
        periodLabel: '店庆期间',
        headline: '周年庆感恩回馈',
        subheadline: '老客专享',
        offer: '全场8.8折',
        timeRange: '店庆周',
        note: '感谢一路相伴',
      },
    ],
  },
  store_visit: {
    pickerLabel: '种草角度',
    options: [
      {
        id: 'ambiance',
        label: '氛围打卡',
        periodLabel: '适合拍照出片',
        headline: '这家太出片了',
        subheadline: '氛围感拉满',
        offer: '打卡送饮品',
        note: '建议傍晚光线',
        styleId: 'fresh',
      },
      {
        id: 'hidden_menu',
        label: '隐藏菜单',
        periodLabel: '本地人私藏',
        headline: '隐藏菜单必点',
        subheadline: '懂行的才知道',
        offer: '探店套餐',
        note: '可向店员询问',
      },
      {
        id: 'value',
        label: '人均友好',
        periodLabel: '高性价比',
        headline: '人均不过百',
        subheadline: '学生党/打工人友好',
        offer: '人均¥68',
        note: '真实消费参考',
      },
      {
        id: 'must_try',
        label: '必点推荐',
        periodLabel: '招牌必吃',
        headline: '本地人必点TOP3',
        subheadline: '回头客最多',
        offer: '',
        note: '跟着点不踩雷',
      },
    ],
  },
  member_recharge: {
    pickerLabel: '储值档位',
    options: [
      {
        id: 'tier_300',
        label: '充300送50',
        periodLabel: '长期有效',
        headline: '充300送50',
        subheadline: '老客专享回馈',
        offer: '到账350元',
        timeRange: '长期有效',
        note: '可与活动同享',
        styleId: 'premium',
      },
      {
        id: 'tier_500',
        label: '充500送100',
        periodLabel: '长期有效',
        headline: '充500送100',
        subheadline: '到店核销',
        offer: '到账600元',
        timeRange: '长期有效',
      },
      {
        id: 'tier_1000',
        label: '充1000送250',
        periodLabel: 'VIP专享',
        headline: '充1000送250',
        subheadline: '赠招牌菜1份',
        offer: '到账1250元',
        timeRange: '长期有效',
        note: '限量100名',
      },
    ],
  },
  daily_sign: {
    pickerLabel: '日签主题',
    options: [
      {
        id: 'morning',
        label: '早安营业',
        periodLabel: '今日正常营业',
        headline: '早安 · 今日营业中',
        subheadline: '欢迎预约',
        timeRange: '今日全天',
        styleId: 'minimal',
      },
      {
        id: 'weekend',
        label: '周末愉快',
        periodLabel: '周末欢迎到店',
        headline: '周末愉快',
        subheadline: '周末不加价',
        timeRange: '周六日',
      },
      {
        id: 'rain',
        label: '雨天提醒',
        periodLabel: '雨天路滑',
        headline: '雨天路滑 · 慢走',
        subheadline: '外卖照常',
        timeRange: '今日',
        note: '出行注意安全',
      },
      {
        id: 'recommend',
        label: '今日推荐',
        periodLabel: '主厨推荐',
        headline: '今日推荐',
        subheadline: '新鲜到货',
        offer: '限时特价',
        timeRange: '今日',
      },
    ],
  },
  product_hero: {
    pickerLabel: '单品类型',
    options: [
      {
        id: 'signature_dish',
        label: '招牌菜',
        periodLabel: '镇店之宝',
        headline: '招牌必点',
        subheadline: '销量领先',
        offer: '¥28',
        styleId: 'ecommerce',
      },
      {
        id: 'new_product',
        label: '新品上市',
        periodLabel: '限时尝鲜',
        headline: '新品首发',
        subheadline: '限时尝鲜价',
        offer: '第二份半价',
        timeRange: '上新首周',
      },
      {
        id: 'seasonal',
        label: '时令限定',
        periodLabel: '本季限定',
        headline: '时令限定',
        subheadline: '错过等一年',
        offer: '限量供应',
        timeRange: '本季',
        styleId: 'fresh',
      },
      {
        id: 'drink',
        label: '饮品甜品',
        periodLabel: '下午茶时段',
        headline: '下午茶必点',
        subheadline: '拍照好看',
        offer: '¥18起',
        timeRange: '14:00—17:00',
      },
    ],
  },
  logo_brand: {
    pickerLabel: '标识用途',
    options: [
      {
        id: 'avatar',
        label: '门店头像',
        periodLabel: '1:1 圆形',
        headline: '{store}',
        subheadline: '',
        note: '适合微信/点评头像',
        styleId: 'minimal',
      },
      {
        id: 'signboard',
        label: '门头招牌',
        periodLabel: '横版大字',
        headline: '{store}',
        note: '适合线下门头',
      },
      {
        id: 'wechat',
        label: '微信头像',
        periodLabel: '简洁识别',
        headline: '{store}',
        subheadline: '本地生活',
        note: '小尺寸清晰可读',
        styleId: 'minimal',
      },
    ],
  },
  menu_board: {
    pickerLabel: '菜单类型',
    options: [
      {
        id: 'full',
        label: '全天菜单',
        periodLabel: '全时段',
        headline: '价目表',
        timeRange: '全天供应',
        styleId: 'lively',
      },
      {
        id: 'lunch',
        label: '午市价目',
        periodLabel: '11:00—14:00',
        headline: '午市菜单',
        timeRange: '11:00—14:00',
      },
      {
        id: 'dinner',
        label: '晚市价目',
        periodLabel: '17:00—22:00',
        headline: '晚市菜单',
        timeRange: '17:00—22:00',
      },
      {
        id: 'set',
        label: '套餐专区',
        periodLabel: '套餐组合',
        headline: '超值套餐',
        subheadline: '组合更省',
        note: '含多道招牌',
      },
    ],
  },
  platform_carousel_five: {
    pickerLabel: '五连图主题',
    options: [
      {
        id: 'opening',
        label: '开业上新',
        periodLabel: '头图轮播 · 吸睛首屏',
        headline: 'NEW STORE OPENING',
        subheadline: '全新团队 · 豪华阵容',
        styleId: 'premium',
      },
      {
        id: 'quality',
        label: '品质服务',
        periodLabel: '环境+手法+信任感',
        headline: '提升服务品质',
        subheadline: '手法娴熟 · 舒适体验',
        styleId: 'premium',
      },
      {
        id: 'promo',
        label: '团购促销',
        periodLabel: '价格+套餐组合',
        headline: '限时团购',
        subheadline: '超值套餐热卖中',
        offer: '¥99起',
        styleId: 'ecommerce',
      },
    ],
  },
  platform_detail_page: {
    pickerLabel: '详情图风格',
    options: [
      {
        id: 'luxury',
        label: '轻奢质感',
        periodLabel: '大图+中英标题',
        headline: '提升服务品质',
        subheadline: 'IMPROVE SERVICE QUALITY',
        styleId: 'premium',
      },
      {
        id: 'warm',
        label: '温馨治愈',
        periodLabel: '慢生活+放松氛围',
        headline: '放慢脚步 享受生活',
        subheadline: '预约到店更省心',
        styleId: 'fresh',
      },
      {
        id: 'deal',
        label: '团购转化',
        periodLabel: '价格+抢购引导',
        headline: '限时特惠',
        subheadline: '立即抢购',
        offer: '¥99',
        styleId: 'ecommerce',
      },
    ],
  },
}

/** 非餐饮业态：覆盖第二步弹窗标签（餐饮沿用 PLAYBOOK_VARIANT_CONFIGS） */
const INDUSTRY_PLAYBOOK_VARIANT_OVERRIDES: Partial<
  Record<LocalLifeIndustryId, Partial<Record<VisualPlaybookId, PlaybookVariantConfig>>>
> = {
  leisure: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '氛围打卡',
          periodLabel: '适合拍照出片',
          headline: '这里太出片了',
          subheadline: '氛围感拉满',
          offer: '打卡送饮品',
          note: '建议傍晚光线',
          styleId: 'fresh',
        },
        {
          id: 'play_pack',
          label: '畅玩套餐',
          periodLabel: '团购性价比高',
          headline: '畅玩套餐超值',
          subheadline: '周末开黑首选',
          offer: '2小时¥88',
          note: '好友同行更划算',
        },
        {
          id: 'social',
          label: '社交聚会',
          periodLabel: '好友局首选',
          headline: '周末好友局',
          subheadline: '聚会放松好去处',
          offer: '4人团¥199',
          note: '提前预约更省心',
        },
        {
          id: 'local_hot',
          label: '本地潮店',
          periodLabel: '年轻人打卡地',
          headline: '本地潮玩打卡地',
          subheadline: '懂行的才知道',
          offer: '',
          note: '本地人私藏',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '团购规格',
      options: [
        {
          id: 'double_play',
          label: '双人畅玩',
          periodLabel: '2人适用',
          headline: '双人畅玩套餐',
          subheadline: '周末通用',
          offer: '¥99双人畅玩',
          timeRange: '周末通用',
          note: '免预约',
        },
        {
          id: 'group_4',
          label: '4人团',
          periodLabel: '3-4人适用',
          headline: '4人畅玩团',
          subheadline: '好友局必备',
          offer: '¥168/4人',
          timeRange: '午晚通用',
        },
        {
          id: 'weekday',
          label: '平日套餐',
          periodLabel: '周一至周五',
          headline: '平日畅玩特惠',
          subheadline: '工作日专享价',
          offer: '平日半价',
          timeRange: '周一至周五',
        },
        {
          id: 'weekend',
          label: '周末专场',
          periodLabel: '周六日',
          headline: '周末畅玩专场',
          subheadline: '不加价',
          offer: '¥199周末团',
          timeRange: '周六日',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推项目',
      options: [
        {
          id: 'signature',
          label: '招牌项目',
          periodLabel: '镇店王牌',
          headline: '招牌必玩',
          subheadline: '回头客最多',
          offer: '¥88起',
          styleId: 'fresh',
        },
        {
          id: 'new_experience',
          label: '新品体验',
          periodLabel: '限时尝鲜',
          headline: '新品首发',
          subheadline: '限时尝鲜价',
          offer: '体验价¥68',
          timeRange: '上新首周',
        },
        {
          id: 'limited',
          label: '限时优惠',
          periodLabel: '本季限定',
          headline: '限时特惠',
          subheadline: '售完即止',
          offer: '立减30元',
          timeRange: '本季',
        },
        {
          id: 'night_pack',
          label: '夜场套餐',
          periodLabel: '晚间时段',
          headline: '夜场畅玩',
          subheadline: '越夜越精彩',
          offer: '¥128夜场',
          timeRange: '18:00—24:00',
        },
      ],
    },
    flash_sale: {
      pickerLabel: '秒杀时段',
      options: [
        {
          id: 'tonight_8',
          label: '今晚8点',
          periodLabel: '今日 20:00—24:00',
          headline: '今晚8点秒杀',
          subheadline: '准时开抢',
          offer: '5折起',
          timeRange: '今日 20:00—24:00',
        },
        {
          id: 'weekend',
          label: '周末专场',
          periodLabel: '周六日全天',
          headline: '周末限时秒杀',
          offer: '立减30元',
          timeRange: '周六日 10:00—22:00',
        },
        {
          id: 'weekday',
          label: '平日闪购',
          periodLabel: '周一至周五',
          headline: '平日秒杀',
          subheadline: '工作日专享',
          offer: '买一送一',
          timeRange: '周一至周五',
        },
        {
          id: 'clearance',
          label: '清仓特惠',
          periodLabel: '售完即止',
          headline: '最后一批',
          offer: '3折起',
          timeRange: '售完即止',
        },
      ],
    },
    daily_sign: {
      pickerLabel: '日签主题',
      options: [
        {
          id: 'morning',
          label: '早安营业',
          periodLabel: '今日正常营业',
          headline: '早安 · 今日营业中',
          timeRange: '今日全天',
          styleId: 'minimal',
        },
        {
          id: 'weekend',
          label: '周末愉快',
          periodLabel: '周末欢迎到店',
          headline: '周末愉快',
          timeRange: '周六日',
        },
        {
          id: 'rain',
          label: '雨天提醒',
          periodLabel: '雨天路滑',
          headline: '雨天路滑 · 慢走',
          timeRange: '今日',
          note: '出行注意安全',
        },
        {
          id: 'recommend',
          label: '今日推荐',
          periodLabel: '店长推荐',
          headline: '今日推荐玩法',
          offer: '限时特价',
          timeRange: '今日',
        },
      ],
    },
    member_recharge: {
      pickerLabel: '储值档位',
      options: [
        {
          id: 'tier_300',
          label: '充300送50',
          periodLabel: '长期有效',
          headline: '充300送50',
          subheadline: '老客专享回馈',
          offer: '到账350元',
          timeRange: '长期有效',
          styleId: 'premium',
        },
        {
          id: 'tier_500',
          label: '充500送100',
          periodLabel: '长期有效',
          headline: '充500送100',
          offer: '到账600元',
          timeRange: '长期有效',
        },
        {
          id: 'tier_1000',
          label: '充1000送250',
          periodLabel: 'VIP专享',
          headline: '充1000送250',
          subheadline: '赠畅玩1次',
          offer: '到账1250元',
          timeRange: '长期有效',
          note: '限量100名',
        },
      ],
    },
  },
  beauty: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '氛围打卡',
          periodLabel: '环境高级感',
          headline: '这家店太高级了',
          subheadline: '轻奢氛围拉满',
          offer: '新客体验价',
          styleId: 'premium',
        },
        {
          id: 'before_after',
          label: '效果对比',
          periodLabel: '真实案例',
          headline: '效果看得见',
          subheadline: '专业技师操作',
          offer: '',
          note: '案例仅供参考',
        },
        {
          id: 'experience',
          label: '体验推荐',
          periodLabel: '新客首选',
          headline: '新客必试项目',
          subheadline: '口碑项目TOP1',
          offer: '体验价¥99',
        },
        {
          id: 'local_hot',
          label: '本地口碑',
          periodLabel: '回头客最多',
          headline: '本地人私藏美店',
          subheadline: '懂行的才知道',
          offer: '',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '套餐规格',
      options: [
        {
          id: 'single',
          label: '单人体验',
          periodLabel: '1人适用',
          headline: '单人护理套餐',
          subheadline: '含清洁+护理',
          offer: '体验价¥99',
          note: '需提前预约',
        },
        {
          id: 'double',
          label: '闺蜜同行',
          periodLabel: '2人适用',
          headline: '闺蜜同行套餐',
          subheadline: '同行更划算',
          offer: '双人¥168',
        },
        {
          id: 'course',
          label: '疗程卡',
          periodLabel: '多次护理',
          headline: '疗程卡特惠',
          subheadline: '长期护理更省',
          offer: '3次卡¥499',
        },
        {
          id: 'new_client',
          label: '新客专享',
          periodLabel: '限新客首单',
          headline: '新客三重礼',
          offer: '首单立减50',
          note: '限新客',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推项目',
      options: [
        {
          id: 'signature',
          label: '招牌项目',
          periodLabel: '镇店王牌',
          headline: '招牌必做',
          offer: '¥199单次',
          styleId: 'premium',
        },
        {
          id: 'new_service',
          label: '新品项目',
          periodLabel: '限时尝鲜',
          headline: '新品首发',
          offer: '体验价¥128',
        },
        {
          id: 'seasonal',
          label: '季节护理',
          periodLabel: '本季推荐',
          headline: '季节限定护理',
          offer: '限时8折',
        },
        {
          id: 'combo',
          label: '组合套餐',
          periodLabel: '多项目组合',
          headline: '焕肤组合',
          offer: '套餐¥299',
        },
      ],
    },
  },
  hotel: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '度假氛围',
          periodLabel: '适合拍照出片',
          headline: '度假感拉满',
          subheadline: '逃离城市计划',
          styleId: 'minimal',
        },
        {
          id: 'room_view',
          label: '房型景观',
          periodLabel: '窗外美景',
          headline: '窗外风景绝了',
          subheadline: '推窗见景',
        },
        {
          id: 'experience',
          label: '入住体验',
          periodLabel: '真实住客感受',
          headline: '入住体验满分',
          subheadline: '服务贴心',
        },
        {
          id: 'local_hot',
          label: '周边攻略',
          periodLabel: '本地人推荐',
          headline: '周边游玩攻略',
          offer: '',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '套餐规格',
      options: [
        {
          id: 'single_night',
          label: '单晚套餐',
          periodLabel: '1晚适用',
          headline: '单晚度假套餐',
          subheadline: '含双早',
          offer: '¥599/晚',
        },
        {
          id: 'two_nights',
          label: '连住两晚',
          periodLabel: '2晚适用',
          headline: '连住更省',
          offer: '两晚¥999',
        },
        {
          id: 'family',
          label: '家庭房',
          periodLabel: '亲子出行',
          headline: '家庭房特惠',
          offer: '家庭房¥799',
        },
        {
          id: 'weekend',
          label: '周末度假',
          periodLabel: '周六日',
          headline: '周末微度假',
          offer: '周末特惠',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推房型',
      options: [
        {
          id: 'signature',
          label: '招牌房型',
          periodLabel: '最受欢迎',
          headline: '招牌房型',
          offer: '¥599起',
        },
        {
          id: 'suite',
          label: '套房升级',
          periodLabel: '尊享体验',
          headline: '套房升级',
          offer: '限时升级',
        },
        {
          id: 'view_room',
          label: '景观房',
          periodLabel: '推窗见景',
          headline: '景观房特惠',
          offer: '¥699起',
        },
        {
          id: 'seasonal',
          label: '季节限定',
          periodLabel: '本季推荐',
          headline: '季节限定礼遇',
          offer: '限时优惠',
        },
      ],
    },
  },
  pet: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '萌宠打卡',
          periodLabel: '治愈氛围',
          headline: '主子太可爱了',
          subheadline: '萌宠治愈',
          styleId: 'fresh',
        },
        {
          id: 'service',
          label: '服务体验',
          periodLabel: '洗护美容',
          headline: '洗护体验满分',
          subheadline: '专业护理',
        },
        {
          id: 'product',
          label: '用品推荐',
          periodLabel: '铲屎官必囤',
          headline: '铲屎官必囤',
          offer: '正品保障',
        },
        {
          id: 'local_hot',
          label: '本地口碑',
          periodLabel: '回头客最多',
          headline: '本地萌宠好店',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '套餐规格',
      options: [
        {
          id: 'wash',
          label: '洗护套餐',
          periodLabel: '洗澡+护理',
          headline: '洗护套餐',
          offer: '洗护¥68起',
        },
        {
          id: 'beauty',
          label: '美容套餐',
          periodLabel: '洗澡+美容',
          headline: '美容套餐',
          offer: '美容¥128',
        },
        {
          id: 'new_client',
          label: '新客首单',
          periodLabel: '限新客',
          headline: '新客首单特惠',
          offer: '立减20元',
        },
        {
          id: 'member',
          label: '会员套餐',
          periodLabel: '长期护理',
          headline: '会员护理卡',
          offer: '3次卡¥299',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推商品',
      options: [
        {
          id: 'food',
          label: '主粮用品',
          periodLabel: '正品保障',
          headline: '爆款主粮',
          offer: '¥89起',
        },
        {
          id: 'snack',
          label: '零食玩具',
          periodLabel: '萌宠最爱',
          headline: '零食玩具TOP1',
          offer: '第二件半价',
        },
        {
          id: 'health',
          label: '保健护理',
          periodLabel: '健康养护',
          headline: '健康护理',
          offer: '限时特价',
        },
        {
          id: 'new_arrival',
          label: '新品上架',
          periodLabel: '限时尝鲜',
          headline: '新品首发',
          offer: '上新特惠',
        },
      ],
    },
  },
  education: {
    group_buy_new: {
      pickerLabel: '课程规格',
      options: [
        {
          id: 'trial',
          label: '试听课',
          periodLabel: '限新学员',
          headline: '免费试听课',
          offer: '试学0元',
        },
        {
          id: 'single',
          label: '单次体验',
          periodLabel: '1次课时',
          headline: '单次体验课',
          offer: '体验价¥99',
        },
        {
          id: 'package',
          label: '课时包',
          periodLabel: '多次课时',
          headline: '课时包特惠',
          offer: '10课时¥999',
        },
        {
          id: 'group_buy',
          label: '团报优惠',
          periodLabel: '多人同报',
          headline: '团报更省',
          offer: '团报8折',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推课程',
      options: [
        {
          id: 'signature',
          label: '王牌课程',
          periodLabel: '口碑TOP1',
          headline: '王牌课程',
          offer: '限时体验',
        },
        {
          id: 'summer',
          label: '假期集训',
          periodLabel: '寒暑假',
          headline: '假期集训营',
          offer: '早鸟价',
        },
        {
          id: 'new_class',
          label: '新开班级',
          periodLabel: '限额招生',
          headline: '新开班招生',
          offer: '报名减300',
        },
        {
          id: 'one_on_one',
          label: '1对1辅导',
          periodLabel: '个性化',
          headline: '1对1辅导',
          offer: '咨询报价',
        },
      ],
    },
    daily_sign: {
      pickerLabel: '日签主题',
      options: [
        {
          id: 'morning',
          label: '开课提醒',
          periodLabel: '今日正常上课',
          headline: '今日正常上课',
          timeRange: '今日',
        },
        {
          id: 'weekend',
          label: '周末班',
          periodLabel: '周末课程',
          headline: '周末班开课',
          timeRange: '周六日',
        },
        {
          id: 'holiday',
          label: '假期通知',
          periodLabel: '调课安排',
          headline: '假期调课通知',
          timeRange: '假期',
        },
        {
          id: 'recommend',
          label: '今日推荐',
          periodLabel: '名师推荐',
          headline: '今日推荐课程',
          timeRange: '今日',
        },
      ],
    },
  },
}

/** 二级业态：覆盖第二步弹窗标签（优先于一级业态） */
const INDUSTRY_SUB_PLAYBOOK_VARIANT_OVERRIDES: Partial<
  Record<string, Partial<Record<VisualPlaybookId, PlaybookVariantConfig>>>
> = {
  leisure_foot_spa: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '环境舒适',
          periodLabel: '包厢干净整洁',
          headline: '环境太舒服了',
          subheadline: '私密安静 · 放松首选',
          offer: '新客体验价',
          styleId: 'premium',
        },
        {
          id: 'technique',
          label: '技师专业',
          periodLabel: '手法娴熟',
          headline: '技师手法绝了',
          subheadline: '放松解压到位',
          offer: '',
          note: '回头客推荐',
        },
        {
          id: 'relax',
          label: '放松解压',
          periodLabel: '下班放松首选',
          headline: '打工人放松地',
          subheadline: '久坐族必备',
          offer: '足疗¥88起',
        },
        {
          id: 'value',
          label: '团购足疗',
          periodLabel: '性价比优选',
          headline: '足疗团购超值',
          subheadline: '含泡脚+按摩',
          offer: '¥99足疗套餐',
          note: '周末通用',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '团购规格',
      options: [
        {
          id: 'single',
          label: '单人足疗',
          periodLabel: '1人适用',
          headline: '单人足疗套餐',
          subheadline: '含泡脚+肩颈',
          offer: '¥88单人足疗',
          note: '免预约',
        },
        {
          id: 'double',
          label: '双人套餐',
          periodLabel: '2人适用',
          headline: '双人足疗套餐',
          subheadline: '同行更划算',
          offer: '¥168双人',
        },
        {
          id: 'overnight',
          label: '过夜套餐',
          periodLabel: '含休息区',
          headline: '过夜足疗套餐',
          subheadline: '24h营业',
          offer: '¥199过夜',
          timeRange: '通宵可用',
        },
        {
          id: 'member',
          label: '会员专享',
          periodLabel: '储值更省',
          headline: '会员足疗特惠',
          offer: '充300送50',
        },
      ],
    },
    product_hero: {
      pickerLabel: '主推项目',
      options: [
        {
          id: 'foot',
          label: '足疗套餐',
          periodLabel: '招牌项目',
          headline: '招牌足疗',
          offer: '¥88起',
          styleId: 'premium',
        },
        {
          id: 'body',
          label: '全身按摩',
          periodLabel: '深度放松',
          headline: '全身按摩',
          offer: '¥128起',
        },
        {
          id: 'combo',
          label: '足浴+SPA',
          periodLabel: '组合更省',
          headline: '足浴SPA组合',
          offer: '¥199套餐',
        },
        {
          id: 'new',
          label: '新客体验',
          periodLabel: '限新客',
          headline: '新客首单特惠',
          offer: '体验价¥68',
        },
      ],
    },
    flash_sale: {
      pickerLabel: '秒杀时段',
      options: [
        {
          id: 'afternoon',
          label: '午后特惠',
          periodLabel: '14:00—17:00',
          headline: '午后足疗秒杀',
          offer: '立减30元',
          timeRange: '14:00—17:00',
        },
        {
          id: 'night',
          label: '夜间专场',
          periodLabel: '20:00后',
          headline: '夜间放松专场',
          offer: '8折起',
          timeRange: '20:00—24:00',
        },
        {
          id: 'weekday',
          label: '工作日',
          periodLabel: '周一至周五',
          headline: '工作日特惠',
          offer: '平日半价',
        },
        {
          id: 'weekend',
          label: '周末专场',
          periodLabel: '周六日',
          headline: '周末足疗专场',
          offer: '¥99套餐',
        },
      ],
    },
    daily_sign: {
      pickerLabel: '日签主题',
      options: [
        {
          id: 'open',
          label: '正常营业',
          periodLabel: '今日营业中',
          headline: '今日正常营业',
          timeRange: '24h',
        },
        {
          id: 'recommend',
          label: '今日推荐',
          periodLabel: '技师推荐',
          headline: '今日推荐项目',
          offer: '限时特价',
        },
        {
          id: 'member',
          label: '会员日',
          periodLabel: '会员专享',
          headline: '会员日福利',
          offer: '储值加赠',
        },
        {
          id: 'holiday',
          label: '节日营业',
          periodLabel: '节假日',
          headline: '节假日正常营业',
          timeRange: '假期',
        },
      ],
    },
  },
  catering_hotpot: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'ambiance',
          label: '氛围打卡',
          periodLabel: '烟火气十足',
          headline: '火锅氛围绝了',
          subheadline: '聚餐首选',
          offer: '打卡送饮品',
        },
        {
          id: 'must_try',
          label: '必点锅底',
          periodLabel: '招牌锅底',
          headline: '必点锅底TOP3',
          subheadline: '回头客最多',
        },
        {
          id: 'value',
          label: '人均友好',
          periodLabel: '高性价比',
          headline: '人均不过百',
          offer: '人均¥68',
        },
        {
          id: 'hidden',
          label: '隐藏吃法',
          periodLabel: '懂行才知道',
          headline: '隐藏吃法推荐',
          note: '可向店员询问',
        },
      ],
    },
    group_buy_new: {
      pickerLabel: '套餐规格',
      options: [
        {
          id: 'double',
          label: '双人餐',
          periodLabel: '2人适用',
          headline: '超值双人火锅',
          offer: '¥99双人餐',
        },
        {
          id: 'family',
          label: '家庭套餐',
          periodLabel: '4-6人',
          headline: '家庭聚餐套餐',
          offer: '¥199家庭餐',
        },
        {
          id: 'lunch',
          label: '午市套餐',
          periodLabel: '11:00—14:00',
          headline: '午市火锅套餐',
          offer: '工作日特惠',
        },
        {
          id: 'weekend',
          label: '周末套餐',
          periodLabel: '周六日',
          headline: '周末火锅专场',
          offer: '¥168套餐',
        },
      ],
    },
  },
  beauty_skin: {
    store_visit: {
      pickerLabel: '种草角度',
      options: [
        {
          id: 'effect',
          label: '效果对比',
          periodLabel: '真实案例',
          headline: '效果看得见',
          subheadline: '透亮肌肤',
          styleId: 'premium',
        },
        {
          id: 'ambiance',
          label: '环境高级感',
          periodLabel: '干净通透',
          headline: '环境太高级了',
          offer: '新客体验',
        },
        {
          id: 'experience',
          label: '体验推荐',
          periodLabel: '口碑项目',
          headline: '新客必试护理',
          offer: '体验价¥99',
        },
        {
          id: 'local',
          label: '本地口碑',
          periodLabel: '回头客最多',
          headline: '本地人私藏美店',
        },
      ],
    },
  },
}

export function getPlaybookVariantConfig(
  playbookId: VisualPlaybookId,
  industryId?: LocalLifeIndustryId,
  industrySubId?: string,
): PlaybookVariantConfig | null {
  const base = PLAYBOOK_VARIANT_CONFIGS[playbookId] ?? null
  if (industrySubId) {
    const subOverride = INDUSTRY_SUB_PLAYBOOK_VARIANT_OVERRIDES[industrySubId]?.[playbookId]
    if (subOverride) return subOverride
  }
  if (!industryId || industryId === 'catering') return base
  const override = INDUSTRY_PLAYBOOK_VARIANT_OVERRIDES[industryId]?.[playbookId]
  if (override) return override
  return base
}

export function resolvePlaybookVariant(
  playbookId: VisualPlaybookId,
  variantId: string,
  industryId?: LocalLifeIndustryId,
  industrySubId?: string,
): PlaybookVariantOption | null {
  const cfg = getPlaybookVariantConfig(playbookId, industryId, industrySubId)
  if (!cfg || !variantId) return null
  return cfg.options.find((o) => o.id === variantId) ?? null
}

export function applyPlaybookVariantToForm(
  form: VisualStudioForm,
  variantId: string,
): VisualStudioForm {
  const cfg = getPlaybookVariantConfig(form.playbook, form.industry, form.industrySubId)
  if (!cfg) return { ...form, playbookVariantId: variantId }
  const opt = cfg.options.find((o) => o.id === variantId) ?? cfg.options[0]
  if (!opt) return { ...form, playbookVariantId: variantId }

  const store = form.storeName.trim() || '本店'
  const fill = (t: string) => t.replace(/\{store\}/g, store)

  return {
    ...form,
    playbookVariantId: opt.id,
    headline: opt.headline !== undefined ? fill(opt.headline) : form.headline,
    subheadline: opt.subheadline !== undefined ? opt.subheadline : form.subheadline,
    offer: opt.offer !== undefined ? opt.offer : form.offer,
    timeRange: opt.timeRange !== undefined ? opt.timeRange : form.timeRange,
    note: opt.note !== undefined ? opt.note : form.note,
    styleId: opt.styleId ?? form.styleId,
  }
}

const INTENT_PROMPT: Record<VisualIntentId, string> = {
  poster: '设计一张中国大陆本地生活门店营销海报，中文标题清晰可读，信息层级：主标题>优惠>副标题。',
  package: '设计团购套餐宣传图，突出组合内容与到手价，适合美团/抖音团购封面。',
  product: '设计招牌单品展示图，主体居中、食欲/质感真实，适合平台主图。',
  logo: '设计简洁品牌 Logo/门店标识，识别度高，适合头像与招牌。',
  environment: '设计探店氛围图，真实可信的就餐/服务环境，适合小红书种草。',
  menu: '设计菜单价目视觉，分区清晰、价格可读。',
  carousel:
    '设计本地生活门店「五连图」完整超宽横幅：从左到右均分 5 个板块，背景/光效/色调无缝衔接，生成后将按平台单张宽度裁成 5 张轮播图。',
  detail:
    '设计团购「详情长图」单段：3:4 竖图，大图+中英标题排版，适合抖音/快手/美团详情页竖向拼接。',
}

const VARIANT_SUFFIX = [
  '构图方案A：大标题居中，促销信息用色块强调。',
  '构图方案B：左侧主体图、右侧文案区，适合移动端阅读。',
  '构图方案C：全屏氛围背景+半透明信息条，适合抖音/小红书。',
  '构图方案D：大字报风格，价格数字超大，适合秒杀/朋友圈。',
]

export function resolvePlaybook(id: VisualPlaybookId) {
  return VISUAL_PLAYBOOKS.find((p) => p.id === id) ?? VISUAL_PLAYBOOKS[0]!
}

export function isPlatformSeriesPlaybook(id: VisualPlaybookId): boolean {
  return id === 'platform_carousel_five' || id === 'platform_detail_page'
}

export function platformSeriesSlots(playbookId: VisualPlaybookId): PlatformSeriesSlot[] {
  if (playbookId === 'platform_carousel_five') return CAROUSEL_FIVE_SLOTS
  if (playbookId === 'platform_detail_page') return DETAIL_PAGE_SLOTS
  return []
}

export function platformSeriesSlotCount(playbookId: VisualPlaybookId): number {
  return isPlatformSeriesPlaybook(playbookId) ? PLATFORM_SERIES_SLOT_COUNT : 0
}

export function resolveSeriesSlotLabel(playbookId: VisualPlaybookId, index: number): string {
  const slots = platformSeriesSlots(playbookId)
  return slots[index]?.label ?? `图${index + 1}`
}

export function resolveSeriesSlotPrompt(playbookId: VisualPlaybookId, index: number): string {
  const slots = platformSeriesSlots(playbookId)
  return slots[index]?.prompt ?? `构图方案${index + 1}。`
}

/** 按玩法解析出图尺寸（五连图=超宽主图 / 详情图竖图 / 默认渠道主尺寸） */
export function resolvePlaybookSizePresetId(
  channelId: PublishChannelId,
  playbookId: VisualPlaybookId,
): AiImageSizePresetId {
  if (playbookId === 'platform_carousel_five') {
    return 'landscape'
  }
  if (playbookId === 'platform_detail_page') {
    return resolveChannel(channelId).detailSizeId ?? 'a4_portrait'
  }
  return resolveChannel(channelId).primarySizeId
}

export function resolvePlaybookSizeDisplay(
  channelId: PublishChannelId,
  playbookId: VisualPlaybookId,
): { label: string; pixelHint: string; aspectRatio: string } {
  if (playbookId === 'platform_carousel_five') {
    const master = platformCarouselMasterGenSize(channelId)
    const s = master.slideSpec
    return {
      label: '五连图',
      pixelHint: `整幅横图再等分 · ${master.pixelHint}`,
      aspectRatio: master.masterAspectLabel,
    }
  }
  const sizeId = resolvePlaybookSizePresetId(channelId, playbookId)
  const size = resolveAiImageSizePreset(sizeId)
  return { label: size.label, pixelHint: size.pixelHint, aspectRatio: size.aspectRatio }
}

export function effectiveVariantCountForForm(form: VisualStudioForm): number {
  const series = platformSeriesSlotCount(form.playbook)
  return series > 0 ? series : form.variantCount
}

export function applyPlatformSeriesPlaybook(
  form: VisualStudioForm,
  playbookId: 'platform_carousel_five' | 'platform_detail_page',
): VisualStudioForm {
  const channels = PLATFORM_SERIES_CHANNELS.filter((id) => form.channels.includes(id))
  const nextChannels = channels.length > 0 ? channels : [...PLATFORM_SERIES_CHANNELS]
  return applyPlaybookToFormWithVariants(
    { ...form, channels: nextChannels, multiChannelPack: true },
    playbookId,
    { keepChannels: true, templateIndex: 0 },
  )
}

export function resolveChannel(id: PublishChannelId) {
  return PUBLISH_CHANNELS.find((c) => c.id === id) ?? PUBLISH_CHANNELS[0]!
}

export function resolveAiImageSizePreset(id: AiImageSizePresetId): AiImageSizePreset {
  return AI_IMAGE_SIZE_PRESETS.find((s) => s.id === id) ?? AI_IMAGE_SIZE_PRESETS[0]!
}

export function sizeIdsForChannels(channels: PublishChannelId[]): AiImageSizePresetId[] {
  const set = new Set<AiImageSizePresetId>()
  for (const ch of channels) {
    const c = resolveChannel(ch)
    set.add(c.primarySizeId)
    for (const ex of c.extraSizeIds ?? []) set.add(ex)
  }
  return [...set]
}

export type CopySuggestion = {
  headline: string
  subheadline: string
  offer: string
  timeRange?: string
  note?: string
}

export type IndustryFieldLabels = {
  headline: string
  subheadline: string
  offer: string
  timeRange: string
  note: string
}

export type IndustryPlaybookOverride = {
  titleTemplates?: string[]
  subtitleTemplates?: string[]
  offerTemplates?: string[]
  styleId?: AiImageStyleId
  defaultTimeRange?: string
  defaultNote?: string
}

export type IndustryProfile = {
  id: LocalLifeIndustryId
  /** 左侧玩法列表优先展示顺序 */
  recommendedPlaybooks: VisualPlaybookId[]
  hiddenPlaybooks?: VisualPlaybookId[]
  defaultStyle: AiImageStyleId
  fieldLabels: IndustryFieldLabels
  /** 业态切换提示（展示给用户） */
  adjustHint: string
  playbookOverrides: Partial<Record<VisualPlaybookId, IndustryPlaybookOverride>>
}

export const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: 'catering',
    recommendedPlaybooks: [
      'group_buy_new',
      'grand_opening',
      'flash_sale',
      'festival_promo',
      'product_hero',
      'store_visit',
      'menu_board',
      'member_recharge',
      'daily_sign',
      'logo_brand',
    ],
    defaultStyle: 'lively',
    adjustHint: '餐饮默认突出菜品食欲、套餐组合与到店优惠',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '副标题 / 卖点',
      offer: '价格或优惠',
      timeRange: '活动时间',
      note: '使用规则',
    },
    playbookOverrides: {
      group_buy_new: {
        defaultTimeRange: '周末及节假日通用',
        defaultNote: '每桌限用1张，不与其它优惠同享',
      },
      festival_promo: {
        titleTemplates: ['{store}节日家宴', '团圆聚餐首选', '节日限定套餐'],
        defaultTimeRange: '节日档期有效',
      },
    },
  },
  {
    id: 'beauty',
    recommendedPlaybooks: [
      'member_recharge',
      'group_buy_new',
      'flash_sale',
      'grand_opening',
      'product_hero',
      'store_visit',
      'festival_promo',
      'daily_sign',
      'logo_brand',
    ],
    hiddenPlaybooks: ['menu_board'],
    defaultStyle: 'premium',
    adjustHint: '美业文案侧重项目体验、疗程组合与储值锁客',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '项目卖点',
      offer: '体验价 / 套餐价',
      timeRange: '预约时间',
      note: '适用项目说明',
    },
    playbookOverrides: {
      group_buy_new: {
        titleTemplates: ['{store}护理套餐', '新客体验三重礼', '闺蜜同行更划算'],
        subtitleTemplates: ['含清洁+护理+舒缓', '需提前预约', '限新客首单'],
        offerTemplates: ['体验价¥99', '疗程卡8折', '双人同行减50'],
        styleId: 'premium',
      },
      product_hero: {
        titleTemplates: ['招牌{offer}项目', '店长推荐TOP1', '焕肤必选'],
        subtitleTemplates: ['回头客最多', '效果可见', '专业技师操作'],
        offerTemplates: ['¥199单次', '3次卡¥499', ''],
      },
      member_recharge: {
        offerTemplates: ['充1000送200', '储值享8.5折', '赠护理1次'],
      },
    },
  },
  {
    id: 'leisure',
    recommendedPlaybooks: [
      'group_buy_new',
      'flash_sale',
      'store_visit',
      'grand_opening',
      'festival_promo',
      'member_recharge',
      'product_hero',
      'daily_sign',
      'logo_brand',
    ],
    hiddenPlaybooks: ['menu_board'],
    defaultStyle: 'fresh',
    adjustHint: '休娱侧重社交打卡、团购畅玩与年轻氛围',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '玩法卖点',
      offer: '团购价',
      timeRange: '可用时段',
      note: '人数 / 时长说明',
    },
    playbookOverrides: {
      group_buy_new: {
        titleTemplates: ['{store}畅玩套餐', '好友局必备', '周末开黑优选'],
        offerTemplates: ['2小时¥88', '4人团¥199', '平日半价'],
      },
      store_visit: {
        titleTemplates: ['{store}太好玩了', '本地潮玩打卡地', '周末放松首选'],
      },
    },
  },
  {
    id: 'hotel',
    recommendedPlaybooks: [
      'festival_promo',
      'group_buy_new',
      'member_recharge',
      'store_visit',
      'grand_opening',
      'daily_sign',
      'logo_brand',
      'product_hero',
    ],
    hiddenPlaybooks: ['menu_board', 'flash_sale'],
    defaultStyle: 'minimal',
    adjustHint: '酒旅侧重房型套餐、度假氛围与预订转化',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '套餐亮点',
      offer: '到手价',
      timeRange: '入住日期',
      note: '退改 / 含早说明',
    },
    playbookOverrides: {
      group_buy_new: {
        titleTemplates: ['{store}度假套餐', '连住更省', '周末微度假'],
        subtitleTemplates: ['含双早', '可延期', '限量10间'],
        offerTemplates: ['¥599/晚', '两晚¥999', '家庭房特惠'],
        styleId: 'minimal',
      },
      festival_promo: {
        titleTemplates: ['节日出游首选', '{store}限定礼遇', '逃离城市计划'],
      },
    },
  },
  {
    id: 'pet',
    recommendedPlaybooks: [
      'group_buy_new',
      'product_hero',
      'member_recharge',
      'grand_opening',
      'festival_promo',
      'store_visit',
      'daily_sign',
      'logo_brand',
    ],
    hiddenPlaybooks: ['menu_board'],
    defaultStyle: 'fresh',
    adjustHint: '宠物店侧重洗护套餐、主粮用品与萌宠治愈感',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '服务卖点',
      offer: '套餐价',
      timeRange: '活动时间',
      note: '适用犬猫 / 体重说明',
    },
    playbookOverrides: {
      group_buy_new: {
        titleTemplates: ['{store}洗护套餐', '主子洗澡美容', '新客首单特惠'],
        subtitleTemplates: ['含洗澡+护理', '需预约', '限小型犬猫'],
        offerTemplates: ['洗护¥68起', '美容套餐¥128', '新客立减20'],
        styleId: 'fresh',
      },
      product_hero: {
        titleTemplates: ['爆款{offer}', '铲屎官必囤', '主粮用品TOP1'],
        subtitleTemplates: ['正品保障', '到店自提', ''],
        offerTemplates: ['¥89起', '第二件半价', ''],
      },
      festival_promo: {
        titleTemplates: ['节日萌宠礼', '{store}陪你过节', '毛孩子也要仪式感'],
        defaultTimeRange: '节日期间有效',
      },
    },
  },
  {
    id: 'education',
    recommendedPlaybooks: [
      'grand_opening',
      'flash_sale',
      'member_recharge',
      'festival_promo',
      'product_hero',
      'daily_sign',
      'logo_brand',
      'group_buy_new',
    ],
    hiddenPlaybooks: ['menu_board', 'store_visit'],
    defaultStyle: 'minimal',
    adjustHint: '教育侧重课程体验、报名优惠与信任感',
    fieldLabels: {
      headline: '活动主标题',
      subheadline: '课程卖点',
      offer: '报名价',
      timeRange: '开课时间',
      note: '适用年龄 / 课时',
    },
    playbookOverrides: {
      grand_opening: {
        titleTemplates: ['{store}开课啦', '试听课免费', '新生报名礼'],
        offerTemplates: ['试学0元', '报班减300', '团报8折'],
      },
      product_hero: {
        titleTemplates: ['王牌{offer}课程', '家长口碑TOP1', '限时体验课'],
      },
      group_buy_new: {
        titleTemplates: ['{store}课程包', '假期集训营', '多人团报更省'],
      },
    },
  },
]

export function resolveIndustryProfile(id: LocalLifeIndustryId): IndustryProfile {
  return INDUSTRY_PROFILES.find((p) => p.id === id) ?? INDUSTRY_PROFILES[0]!
}

/** 智能参考图上传区文案：按业态避免一律写成「菜品图」 */
export function referenceUploadSubtitle(
  industryId: LocalLifeIndustryId,
  industrySubId?: string,
): string {
  const sub = String(industrySubId || '').trim()
  if (industryId === 'catering') return '上传商品/菜品图，AI 提取核心元素并并入出图'
  if (sub === 'leisure_foot_spa') return '上传门店环境/足浴服务场景图，AI 提取核心元素并并入出图'
  if (industryId === 'beauty') return '上传项目效果图或门店图，AI 提取核心元素并并入出图'
  if (industryId === 'leisure') return '上传门店环境/玩法场景图，AI 提取核心元素并并入出图'
  if (industryId === 'hotel') return '上传客房/空间实拍图，AI 提取核心元素并并入出图'
  if (industryId === 'pet') return '上传门店或萌宠相关实拍图，AI 提取核心元素并并入出图'
  if (industryId === 'education') return '上传教室/课程场景图，AI 提取核心元素并并入出图'
  return '上传商品或门店实拍图，AI 提取核心元素并并入出图'
}

/** 非餐饮业态出图时强制禁止菜品/餐桌错配 */
export function nonCateringFoodBanLine(
  industryId: LocalLifeIndustryId,
  industrySubId?: string,
): string {
  if (industryId === 'catering') return ''
  const sub = String(industrySubId || '').trim()
  const focus =
    sub === 'leisure_foot_spa'
      ? '须呈现足浴沙发/足疗椅、足浴桶、技师服务等场景'
      : industryId === 'beauty'
        ? '须呈现美业服务/门店空间场景'
        : '须呈现与当前业态一致的服务或空间场景'
  return `【严禁餐饮错配】当前业态不是餐饮：${focus}；禁止出现菜品、餐桌摆盘、火锅海鲜、饮品特写等美食摄影；即使文案含「美食」也只作文字卖点，不得画成餐厅菜品海报。`
}

export function getPlaybooksForIndustry(industryId: LocalLifeIndustryId) {
  const profile = resolveIndustryProfile(industryId)
  const hidden = new Set(profile.hiddenPlaybooks ?? [])
  const ordered = profile.recommendedPlaybooks
    .map((id) => VISUAL_PLAYBOOKS.find((p) => p.id === id))
    .filter((p): p is (typeof VISUAL_PLAYBOOKS)[number] => !!p && !hidden.has(p.id))
  const rest = VISUAL_PLAYBOOKS.filter((p) => !hidden.has(p.id) && !ordered.some((o) => o.id === p.id))
  return [...ordered, ...rest]
}

function mergeTemplates(base: string[], override?: string[]): string[] {
  return override?.length ? override : base
}

function pickAt<T>(arr: T[], index: number): T {
  return arr[index] ?? arr[0]!
}

export function applyPlaybookToForm(
  form: VisualStudioForm,
  playbookId: VisualPlaybookId,
  opts?: { keepChannels?: boolean; templateIndex?: number },
): VisualStudioForm {
  const pb = resolvePlaybook(playbookId)
  const profile = resolveIndustryProfile(form.industry)
  const override = profile.playbookOverrides[playbookId] ?? {}
  const store = form.storeName.trim() || '本店'
  const idx = opts?.templateIndex ?? 0

  const titles = mergeTemplates(pb.titleTemplates, override.titleTemplates)
  const subtitles = mergeTemplates(pb.subtitleTemplates, override.subtitleTemplates)
  const offers = mergeTemplates(pb.offerTemplates, override.offerTemplates).filter(Boolean)

  const fill = (t: string, offer: string) =>
    t.replace(/\{store\}/g, store).replace(/\{offer\}/g, offer)

  const offerVal = pickAt(offers, idx) || pickAt(offers, 0) || '限时优惠'
  const headline = fill(pickAt(titles, idx), offerVal)
  const subheadline = pickAt(subtitles, idx) ?? ''
  const styleId = override.styleId ?? pb.styleId ?? profile.defaultStyle

  return {
    ...form,
    playbook: playbookId,
    channels: opts?.keepChannels !== false ? form.channels : pb.suggestedChannels,
    styleId,
    headline,
    subheadline,
    offer: offerVal,
    timeRange: override.defaultTimeRange ?? '',
    note: override.defaultNote ?? '',
    playbookVariantId: '',
  }
}

function withDefaultPlaybookVariant(form: VisualStudioForm): VisualStudioForm {
  const cfg = getPlaybookVariantConfig(form.playbook, form.industry, form.industrySubId)
  if (!cfg?.options[0]) return form
  const valid =
    form.playbookVariantId && cfg.options.some((o) => o.id === form.playbookVariantId)
  if (valid) return applyPlaybookVariantToForm(form, form.playbookVariantId)
  return applyPlaybookVariantToForm(form, cfg.options[0].id)
}

export function applyPlaybookToFormWithVariants(
  form: VisualStudioForm,
  playbookId: VisualPlaybookId,
  opts?: { keepChannels?: boolean; templateIndex?: number },
): VisualStudioForm {
  return withDefaultPlaybookVariant(applyPlaybookToForm(form, playbookId, opts))
}

export function applyIndustryChange(
  form: VisualStudioForm,
  industryId: LocalLifeIndustryId,
): VisualStudioForm {
  const profile = resolveIndustryProfile(industryId)
  let playbook = form.playbook
  if (profile.hiddenPlaybooks?.includes(playbook)) {
    playbook = profile.recommendedPlaybooks[0] ?? 'group_buy_new'
  }
  const base: VisualStudioForm = {
    ...form,
    industry: industryId,
    industrySubId: defaultSubCategoryForIndustry(industryId),
    styleId: profile.defaultStyle,
    playbook,
  }
  return applyPlaybookToFormWithVariants(base, playbook, { keepChannels: true, templateIndex: 0 })
}

export function applyIndustrySubChange(
  form: VisualStudioForm,
  industrySubId: string,
): VisualStudioForm {
  const sub = resolveIndustrySubCategory(industrySubId)
  if (!sub || sub.industryId !== form.industry) {
    return form
  }
  const base: VisualStudioForm = {
    ...form,
    industrySubId,
    styleId: normalizeStyleIdForSub(form.styleId, industrySubId, form.industry),
  }
  return applyPlaybookToFormWithVariants(base, form.playbook, { keepChannels: true, templateIndex: 0 })
}

/** 本地规则文案包（零延迟，对标有赞「AI 帮写卖点」入口） */
export function generateCopySuggestions(form: VisualStudioForm): CopySuggestion[] {
  const pb = resolvePlaybook(form.playbook)
  const profile = resolveIndustryProfile(form.industry)
  const override = profile.playbookOverrides[form.playbook] ?? {}
  const variant = resolvePlaybookVariant(
    form.playbook,
    form.playbookVariantId,
    form.industry,
    form.industrySubId,
  )
  const store = form.storeName.trim() || '本店'
  const fill = (t: string, offer: string) =>
    t.replace(/\{store\}/g, store).replace(/\{offer\}/g, offer)

  const titles = mergeTemplates(pb.titleTemplates, override.titleTemplates)
  const subtitles = mergeTemplates(pb.subtitleTemplates, override.subtitleTemplates)
  const offers = mergeTemplates(pb.offerTemplates, override.offerTemplates).filter(Boolean)

  const out: CopySuggestion[] = []
  for (let i = 0; i < Math.min(3, titles.length); i++) {
    const offer = offers[i] ?? offers[0] ?? '限时优惠'
    out.push({
      headline: fill(titles[i]!, offer),
      subheadline: subtitles[i] ?? subtitles[0] ?? '',
      offer,
      timeRange: variant?.timeRange ?? override.defaultTimeRange,
      note: variant?.note ?? override.defaultNote,
    })
  }
  return out
}

export function buildVisualStudioPrompt(
  form: VisualStudioForm,
  opts?: {
    channel?: PublishChannelId
    variantIndex?: number
    productRefCount?: number
    styleFromReference?: boolean
    referenceAnalysis?: VisualStudioReferenceAnalysis | null
    refineNote?: string
    /** 五连图：一次生成整幅横幅（非单张 slot） */
    carouselMaster?: boolean
  },
): string {
  const pb = resolvePlaybook(form.playbook)
  const playbookVariant = resolvePlaybookVariant(
    form.playbook,
    form.playbookVariantId,
    form.industry,
    form.industrySubId,
  )
  const sceneCtx = resolveIndustrySceneContext(form)
  const variantConfig = getPlaybookVariantConfig(form.playbook, form.industry, form.industrySubId)
  const style =
    opts?.styleFromReference
      ? '视觉风格参考用户上传的商品/海报图（色调与构图），文案以表单为准。'
      : AI_IMAGE_STYLE_PRESETS.find((s) => s.id === form.styleId)?.promptHint ?? '商业设计'

  const channel = opts?.channel ? resolveChannel(opts.channel) : null
  const carouselMaster = opts?.carouselMaster === true && form.playbook === 'platform_carousel_five'
  const sizeDisplay = channel
    ? resolvePlaybookSizeDisplay(channel.id, form.playbook)
    : null
  const size = channel && !carouselMaster
    ? resolveAiImageSizePreset(resolvePlaybookSizePresetId(channel.id, form.playbook))
    : null
  const lines = [
    carouselMaster ? INTENT_PROMPT.carousel : INTENT_PROMPT[pb.intent],
    `【业态锁定】${sceneCtx.label}。${sceneCtx.sceneHint}。画面主体、道具、环境必须严格符合该业态，禁止出现与业态无关的场景（如餐饮禁止酒吧夜场、足浴禁止咖啡厅）。`,
    nonCateringFoodBanLine(form.industry, form.industrySubId),
    form.industrySubId === 'leisure_foot_spa'
      ? '【足浴专项】须呈现足浴沙发/足疗椅、足浴桶、技师足部按摩等服务场景；严禁浴缸、酒店客房、海边落地窗、温泉泳池、度假别墅等酒旅元素；严禁菜品/餐桌美食摄影。'
      : '',
    `视觉风格：${style}。`,
    channel
      ? carouselMaster
        ? `投放渠道：${channel.label}，${sizeDisplay?.pixelHint ?? ''}，超宽横幅一次出图。`
        : `投放渠道：${channel.label}，${size?.aspectRatio ?? ''} ${size?.pixelHint ?? ''}，请符合该平台常见封面构图。`
      : '',
    variantConfig?.pickerLabel && playbookVariant
      ? `${variantConfig.pickerLabel}：${playbookVariant.label}（${playbookVariant.periodLabel}）。`
      : playbookVariant
        ? `活动细分：${playbookVariant.label}（${playbookVariant.periodLabel}），视觉元素须呼应该主题。`
        : '',
    `营销玩法：${pb.label}（${pb.desc}）。`,
    form.storeName.trim() ? `门店/品牌名：${form.storeName.trim()}（可出现在画面角落，勿遮挡主信息）。` : '',
    form.headline.trim() ? `主标题（画面中大而清晰的中文）：「${form.headline.trim()}」。` : '',
    form.subheadline.trim() ? `副标题：${form.subheadline.trim()}。` : '',
    form.offer.trim() ? `核心优惠/价格：${form.offer.trim()}（数字醒目）。` : '',
    form.timeRange.trim() ? `活动时间：${form.timeRange.trim()}。` : '',
    form.note.trim() ? `补充说明：${form.note.trim()}。` : '',
    form.referenceKeywords.trim()
      ? `【参考关键词】须在画面元素、道具、氛围或构图中体现：${form.referenceKeywords.trim()}。`
      : '',
    opts?.productRefCount
      ? `用户提供了 ${opts.productRefCount} 张实拍参考图，画面主体品类、色调与质感须与参考图一致。`
      : '',
    opts?.referenceAnalysis ? formatReferenceAnalysisForPrompt(opts.referenceAnalysis) : '',
    opts?.productRefCount || form.referenceKeywords.trim() || opts?.referenceAnalysis
      ? '若同时有参考图与参考关键词：先理解参考图主体/色调/元素，再结合参考关键词与上方业态/玩法/文案条件综合出图，禁止只复刻参考图而忽略营销文案。'
      : '',
    '规范：专业中文海报排版、无乱码水印、无畸形文字；适合中国大陆本地生活商家投放。',
  ].filter(Boolean)

  const vi = opts?.variantIndex ?? 0
  if (carouselMaster && channel) {
    lines.push(...buildCarouselFiveMasterPromptExtra(channel.id))
  } else if (isPlatformSeriesPlaybook(form.playbook)) {
    lines.push(resolveSeriesSlotPrompt(form.playbook, vi))
    lines.push(
      form.playbook === 'platform_carousel_five'
        ? '整套五连图须统一配色、字体与光影，本张仅为系列中的一屏，勿做成独立无关海报。'
        : '整套详情长图须统一视觉体系，本张仅为竖向拼接的一段，与上下段风格一致。',
    )
  } else if (vi >= 0 && vi < VARIANT_SUFFIX.length) {
    lines.push(VARIANT_SUFFIX[vi]!)
  }
  if (opts?.refineNote?.trim()) {
    lines.push(`修改要求：${opts.refineNote.trim()}`)
  }
  return lines.join('\n')
}

/** 汇总视觉工坊出图所需的全部业务上下文，供 AI 打包生图 Prompt */
export function buildVisualStudioImageContext(
  form: VisualStudioForm,
  opts?: {
    channel?: PublishChannelId
    variantIndex?: number
    productRefCount?: number
    styleFromReference?: boolean
    referenceAnalysis?: VisualStudioReferenceAnalysis | null
    refineNote?: string
    carouselMaster?: boolean
  },
): Record<string, string | number | boolean | string[]> {
  const pb = resolvePlaybook(form.playbook)
  const playbookVariant = resolvePlaybookVariant(
    form.playbook,
    form.playbookVariantId,
    form.industry,
    form.industrySubId,
  )
  const sceneCtx = resolveIndustrySceneContext(form)
  const variantConfig = getPlaybookVariantConfig(form.playbook, form.industry, form.industrySubId)
  const stylePreset = AI_IMAGE_STYLE_PRESETS.find((s) => s.id === form.styleId)
  const channel = opts?.channel ? resolveChannel(opts.channel) : null
  const carouselMaster = opts?.carouselMaster === true && form.playbook === 'platform_carousel_five'
  const sizeDisplay = channel ? resolvePlaybookSizeDisplay(channel.id, form.playbook) : null
  const size = channel && !carouselMaster
    ? resolveAiImageSizePreset(resolvePlaybookSizePresetId(channel.id, form.playbook))
    : null
  const vi = opts?.variantIndex ?? 0
  const masterGen = carouselMaster && channel ? platformCarouselMasterGenSize(channel.id) : null
  return {
    industry: sceneCtx.label,
    industrySceneHint: sceneCtx.sceneHint,
    industrySubId: form.industrySubId,
    playbook: pb.label,
    playbookDesc: pb.desc,
    playbookIntent: pb.intent,
    playbookVariantPicker: variantConfig?.pickerLabel ?? '',
    playbookVariantLabel: playbookVariant?.label ?? '',
    playbookVariantPeriod: playbookVariant?.periodLabel ?? '',
    styleLabel: stylePreset?.label ?? form.styleId,
    styleHint: stylePreset?.promptHint ?? '',
    channelLabel: channel?.label ?? '',
    channelShort: channel?.short ?? '',
    aspectRatio: carouselMaster ? (sizeDisplay?.aspectRatio ?? '') : (size?.aspectRatio ?? ''),
    pixelHint: carouselMaster ? (masterGen?.pixelHint ?? sizeDisplay?.pixelHint ?? '') : (size?.pixelHint ?? ''),
    carouselMaster,
    carouselMasterWanxSize: masterGen?.wanxSize ?? '',
    carouselSlideWidth: masterGen?.slideSpec.slideWidth ?? 0,
    carouselSlideHeight: masterGen?.slideSpec.slideHeight ?? 0,
    compositionVariant: carouselMaster && channel
      ? buildCarouselFiveMasterPromptExtra(channel.id).join('\n')
      : isPlatformSeriesPlaybook(form.playbook)
        ? resolveSeriesSlotPrompt(form.playbook, vi)
        : (VARIANT_SUFFIX[vi] ?? VARIANT_SUFFIX[0]!),
    seriesSlotLabel: isPlatformSeriesPlaybook(form.playbook)
      ? resolveSeriesSlotLabel(form.playbook, vi)
      : '',
    seriesSlotIndex: isPlatformSeriesPlaybook(form.playbook) ? vi + 1 : 0,
    seriesSlotTotal: platformSeriesSlotCount(form.playbook),
    storeName: form.storeName.trim(),
    headline: form.headline.trim(),
    subheadline: form.subheadline.trim(),
    offer: form.offer.trim(),
    timeRange: form.timeRange.trim(),
    note: form.note.trim(),
    referenceKeywords: form.referenceKeywords.trim(),
    productRefCount: opts?.productRefCount ?? 0,
    styleFromReference: opts?.styleFromReference === true,
    referenceAnalysisSubject: opts?.referenceAnalysis?.subject ?? '',
    referenceAnalysisElements: opts?.referenceAnalysis?.elements ?? [],
    referenceAnalysisMerge: opts?.referenceAnalysis?.mergeInstruction ?? '',
    refineNote: opts?.refineNote?.trim() ?? '',
  }
}

export function preferWanxPosterForIntent(intent: VisualIntentId): boolean {
  return intent !== 'logo'
}

/** @deprecated 兼容旧引用 */
export type AiImageStudioForm = VisualStudioForm
export const DEFAULT_AI_IMAGE_STUDIO_FORM = DEFAULT_VISUAL_STUDIO_FORM
export const buildAiImageStudioPrompt = buildVisualStudioPrompt

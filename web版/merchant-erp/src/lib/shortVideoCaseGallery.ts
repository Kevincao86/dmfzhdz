/**
 * 短视频案例墙（发现 / 技能 / 短片）
 * 成片由 Seedance 生成，静态托管于 /short-video-cases/
 */

import type { ShortVideoSkillId } from './shortVideoSkills'

export type ShortVideoCaseKind = 'discover' | 'skill' | 'film'

export type ShortVideoCaseItem = {
  id: string
  title: string
  subtitle: string
  kind: ShortVideoCaseKind
  skillId?: ShortVideoSkillId
  prompt: string
  aspect: '9:16' | '16:9' | '1:1'
  longform: boolean
  durationSec: number
  coverFrom: string
  coverTo: string
  badge?: string
  coverUrl?: string
  videoUrl?: string
  /** Seedance 生成用英文运镜提示（脚本侧） */
  genPrompt?: string
}

const asset = (id: string, ext: 'png' | 'mp4') => `/short-video-cases/${id}.${ext}?v=preview3`

function c(partial: ShortVideoCaseItem): ShortVideoCaseItem {
  return {
    ...partial,
    coverUrl: partial.coverUrl ?? asset(partial.id, 'png'),
    videoUrl: partial.videoUrl ?? asset(partial.id, 'mp4'),
  }
}

export const SHORT_VIDEO_CASES: ShortVideoCaseItem[] = [
  c({
    id: 'case-visit-night',
    title: '夜市探店 · 烟火气',
    subtitle: '门头钩子 + 招牌特写 + 试吃口播',
    kind: 'film',
    skillId: 'store_visit',
    aspect: '9:16',
    longform: true,
    durationSec: 45,
    coverFrom: '#0f172a',
    coverTo: '#f97316',
    badge: '短片',
    prompt:
      '【Skill·探店成片】\n主题：夜市小吃街探店，暖黄灯光与烟火气。\n结构：街景推镜钩子 → 摊位特写 → 招牌菜出锅蒸汽 → 试吃反应 → 店名与人均收尾。\n运镜跟拍流畅，禁止静止幻灯。',
    genPrompt:
      'Night street food market in China, warm lantern glow, steam rising, handheld follow shot, continuous camera motion, cinematic food vlog, photorealistic, no text',
  }),
  c({
    id: 'case-seed-skincare',
    title: '护肤种草 · 15 秒',
    subtitle: '痛点开场 → 三卖点 → CTA',
    kind: 'skill',
    skillId: 'product_seed',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#ec4899',
    coverTo: '#fdf2f8',
    badge: '技能',
    prompt:
      '【Skill·产品种草】\n主题：保湿精华种草。\n结构：干燥起皮痛点 → 瓶身亮相 → 质地拉丝特写 → 上脸吸收 → 限时福利 CTA。\n浅景深、主光柔和。',
    genPrompt:
      'Close-up of a clear glass cosmetic bottle on a vanity, soft morning light, gentle camera orbit, commercial product video, photorealistic',
  }),
  c({
    id: 'case-promo-618',
    title: '门店大促预告',
    subtitle: '数字冲击 + 福利闪切',
    kind: 'discover',
    skillId: 'promo_event',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#dc2626',
    coverTo: '#fbbf24',
    badge: '发现',
    coverUrl: asset('case-promo-event', 'png'),
    videoUrl: asset('case-promo-event', 'mp4'),
    prompt:
      '【Skill·活动预告】\n主题：周末满减大促。\n结构：大字「满 100 减 30」冲击 → 活动时间 → 爆品闪切 → 到店 CTA。\n节奏快、信息清晰。',
    genPrompt:
      'Bright clothing boutique interior, soft warm lights, camera slowly dollies down the aisle, commercial atmosphere video, photorealistic',
  }),
  c({
    id: 'case-ambiance-cafe',
    title: '咖啡馆氛围片',
    subtitle: '横屏品牌空间',
    kind: 'film',
    skillId: 'ambiance',
    aspect: '16:9',
    longform: true,
    durationSec: 30,
    coverFrom: '#44403c',
    coverTo: '#d6d3d1',
    badge: '短片',
    prompt:
      '【Skill·门店氛围】\n主题：独立咖啡馆空间氛围。\n结构：外立面黄昏 → 木纹与杯具细节 → 拉花特写 → 客流柔焦 → Logo 收尾。\n缓慢推轨，色调偏暖灰。',
    genPrompt:
      'Cozy cafe interior at dusk, steam from latte art, slow cinematic dolly, continuous camera motion, photorealistic, no text',
  }),
  c({
    id: 'case-drama-hook',
    title: '短剧钩子 12s',
    subtitle: '冲突开场 · 悬念定格',
    kind: 'skill',
    skillId: 'short_drama_hook',
    aspect: '9:16',
    longform: false,
    durationSec: 12,
    coverFrom: '#1e3a8a',
    coverTo: '#67e8f9',
    badge: '技能',
    prompt:
      '【Skill·短剧钩子】\n主题：外卖迟到引发的反转误会。\n结构：门铃急促 → 错开门瞬间 → 表情特写冲突 → 悬念定格「下一秒……」。\n前 3 秒必须有冲突。',
    genPrompt:
      'Person opening apartment door at night looking surprised, cool hallway light, suspenseful short drama hook, continuous camera motion, photorealistic',
  }),
  c({
    id: 'case-food-ramen',
    title: '拉面特写',
    subtitle: '蒸汽 · 拉丝 · 食欲',
    kind: 'discover',
    skillId: 'food_closeup',
    aspect: '9:16',
    longform: false,
    durationSec: 10,
    coverFrom: '#7c2d12',
    coverTo: '#fdba74',
    badge: '发现',
    prompt:
      '【Skill·美食特写】\n主题：日式豚骨拉面。\n结构：整碗全景 → 蒸汽升腾 → 筷子拉面 → 叉烧特写 → 店名收尾。\n暖色微距，环绕运镜。',
    genPrompt:
      'Steaming tonkotsu ramen bowl, chopsticks lifting noodles, rising steam, slow orbit macro food video, photorealistic',
  }),
  c({
    id: 'case-visit-brunch',
    title: '早午餐探店',
    subtitle: '明亮自然光竖屏',
    kind: 'film',
    skillId: 'store_visit',
    aspect: '9:16',
    longform: true,
    durationSec: 60,
    coverFrom: '#fef3c7',
    coverTo: '#34d399',
    badge: '短片',
    prompt:
      '【Skill·探店成片】\n主题：周末早午餐探店，自然光、清新色调。\n结构：门头 → 座位环境 → 甜品与咖啡特写 → 试吃口播 → 预约 CTA。',
    genPrompt:
      'Sunny brunch cafe table, avocado toast and latte, natural window light, gentle push-in camera, lifestyle food video, photorealistic',
  }),
  c({
    id: 'case-seed-gadget',
    title: '数码小物种草',
    subtitle: '桌面场景 · 功能演示',
    kind: 'discover',
    skillId: 'product_seed',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#0ea5e9',
    coverTo: '#e0f2fe',
    badge: '发现',
    prompt:
      '【Skill·产品种草】\n主题：桌面收纳小物。\n结构：桌面凌乱痛点 → 产品展开演示 → 三个功能特写 → 收纳前后对比 → CTA。',
    genPrompt:
      'Modern desk organizer with gadgets, cool blue ambient light, camera slowly orbiting product, tech product demo video, photorealistic',
  }),
  // —— 本地生活扩充 ——
  c({
    id: 'case-hotpot',
    title: '火锅局 · 红油翻滚',
    subtitle: '涮菜 · 举杯 · 人均',
    kind: 'film',
    skillId: 'hotpot_feast',
    aspect: '9:16',
    longform: true,
    durationSec: 45,
    coverFrom: '#7f1d1d',
    coverTo: '#f97316',
    badge: '短片',
    prompt:
      '【Skill·火锅局】\n主题：朋友火锅局，红油锅底热闹。\n结构：门口钩子 → 红油翻滚 → 涮菜 → 举杯 → 人均与必点。',
    genPrompt:
      'Cozy Chinese restaurant table at night, large metal soup pot steaming, vegetables and tofu cooking, warm orange lights, slow camera orbit, food commercial video, photorealistic, no text',
  }),
  c({
    id: 'case-bbq',
    title: '烧烤夜宵',
    subtitle: '炭火滋滋 · 撸串',
    kind: 'discover',
    skillId: 'barbecue_night',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#1c1917',
    coverTo: '#ea580c',
    badge: '发现',
    prompt:
      '【Skill·烧烤夜宵】\n主题：夜市烧烤撸串。\n结构：夜色街景 → 炭火 → 刷酱 → 咬一口 → 位置 CTA。',
    genPrompt:
      'Night barbecue grill with charcoal flames, skewers sizzling, warm street lights, handheld food vlog motion, photorealistic, no text',
  }),
  c({
    id: 'case-milktea',
    title: '新茶饮上新',
    subtitle: '杯身 · 第一口',
    kind: 'skill',
    skillId: 'milk_tea_new',
    aspect: '9:16',
    longform: false,
    durationSec: 10,
    coverFrom: '#fce7f3',
    coverTo: '#fb7185',
    badge: '技能',
    prompt:
      '【Skill·新茶饮上新】\n主题：季节限定奶茶上新。\n结构：杯身亮相 → 原料闪切 → 第一口 → 活动价 → CTA。',
    genPrompt:
      'Colorful bubble tea cup spinning slowly, fresh fruit toppings, bright shop background, product commercial camera orbit, photorealistic, no text',
  }),
  c({
    id: 'case-hair',
    title: '美发变装',
    subtitle: '前后对比 · 预约',
    kind: 'film',
    skillId: 'hair_salon',
    aspect: '9:16',
    longform: true,
    durationSec: 30,
    coverFrom: '#312e81',
    coverTo: '#a5b4fc',
    badge: '短片',
    prompt:
      '【Skill·美发变装】\n主题：发型改造前后对比。\n结构：咨询 → 过程闪切 → 前后对比 → 出门 → 预约。',
    genPrompt:
      'Modern hair salon, stylist cutting hair, mirror reflection, before-after transformation vibe, continuous camera motion, photorealistic, no text',
  }),
  c({
    id: 'case-nail',
    title: '美甲美睫特写',
    subtitle: '微距完成面',
    kind: 'skill',
    skillId: 'nail_beauty',
    aspect: '9:16',
    longform: false,
    durationSec: 12,
    coverFrom: '#831843',
    coverTo: '#f9a8d4',
    badge: '技能',
    prompt:
      '【Skill·美甲美睫】\n主题：美甲完成面展示。\n结构：色板钩子 → 过程特写 → 完成面 → 闪光 → 预约。',
    genPrompt:
      'Close-up of elegant manicure nails under soft salon light, slow orbit macro shot, beauty commercial video, photorealistic, no text',
  }),
  c({
    id: 'case-gym',
    title: '健身打卡',
    subtitle: '训练节奏 · 体验价',
    kind: 'discover',
    skillId: 'gym_checkin',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#0f172a',
    coverTo: '#22d3ee',
    badge: '发现',
    prompt:
      '【Skill·健身打卡】\n主题：健身房打卡。\n结构：进场 → 训练动作 → 教练 → 汗水特写 → 体验 CTA。',
    genPrompt:
      'Modern gym workout, person lifting weights, energetic camera follow, sweat and motion, fitness commercial video, photorealistic, no text',
  }),
  c({
    id: 'case-hotel',
    title: '酒店入住漫游',
    subtitle: '客房推门 · 窗景',
    kind: 'film',
    skillId: 'hotel_stay',
    aspect: '9:16',
    longform: true,
    durationSec: 45,
    coverFrom: '#1e293b',
    coverTo: '#94a3b8',
    badge: '短片',
    prompt:
      '【Skill·酒店民宿】\n主题：精品酒店入住体验。\n结构：大厅 → 推门客房 → 床品窗景 → 早餐 → 预订。',
    genPrompt:
      'Boutique hotel room door opening to bright window view, slow dolly across bed and decor, luxury stay atmosphere, photorealistic, no text',
  }),
  c({
    id: 'case-kids',
    title: '亲子乐园遛娃',
    subtitle: '欢快安全 · 套餐',
    kind: 'discover',
    skillId: 'kids_play',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#fef08a',
    coverTo: '#fb923c',
    badge: '发现',
    prompt:
      '【Skill·亲子乐园】\n主题：周末遛娃乐园。\n结构：门口 → 玩耍 → 家长安心 → 门票 → 预约。',
    genPrompt:
      'Colorful indoor kids playground, children playing happily, bright safe atmosphere, gentle camera motion, photorealistic, no text',
  }),
  c({
    id: 'case-pet',
    title: '猫咖探店',
    subtitle: '萌宠互动',
    kind: 'skill',
    skillId: 'pet_cafe',
    aspect: '9:16',
    longform: false,
    durationSec: 12,
    coverFrom: '#78350f',
    coverTo: '#fde68a',
    badge: '技能',
    prompt:
      '【Skill·宠物友好】\n主题：猫咖探店。\n结构：萌宠钩子 → 互动 → 环境餐品 → 规则 → 到店。',
    genPrompt:
      'Cute cat cafe interior, fluffy cats lounging, soft warm light, gentle camera follow, adorable lifestyle video, photorealistic, no text',
  }),
  c({
    id: 'case-takeaway',
    title: '外卖开箱',
    subtitle: '拆袋 · 第一口',
    kind: 'discover',
    skillId: 'takeaway_unbox',
    aspect: '9:16',
    longform: false,
    durationSec: 12,
    coverFrom: '#14532d',
    coverTo: '#86efac',
    badge: '发现',
    prompt:
      '【Skill·外卖开箱】\n主题：家常菜外卖开箱。\n结构：拆袋 → 摆盘 → 份量 → 第一口 → 下单 CTA。',
    genPrompt:
      'Unboxing takeaway food bags on a dining table, opening containers, appetizing steam, top-down then close-up motion, photorealistic, no text',
  }),
  c({
    id: 'case-bakery',
    title: '烘焙出炉',
    subtitle: '面包香 · 切片',
    kind: 'film',
    skillId: 'food_closeup',
    aspect: '9:16',
    longform: false,
    durationSec: 10,
    coverFrom: '#92400e',
    coverTo: '#fcd34d',
    badge: '短片',
    prompt:
      '【Skill·美食特写】\n主题：烘焙店新鲜出炉。\n结构：出炉蒸汽 → 切片特写 → 夹心拉丝 → 店名收尾。',
    genPrompt:
      'Fresh bakery bread coming out of oven with steam, knife slicing soft crumb, warm bakery light, continuous food video motion, photorealistic, no text',
  }),
  c({
    id: 'case-queue',
    title: '网红店排队',
    subtitle: '排队种草 · 到店',
    kind: 'skill',
    skillId: 'store_visit',
    aspect: '9:16',
    longform: false,
    durationSec: 15,
    coverFrom: '#0e7490',
    coverTo: '#a5f3fc',
    badge: '技能',
    prompt:
      '【Skill·探店成片】\n主题：网红店周末排队探店。\n结构：排队长龙钩子 → 进店 → 必点出餐 → 试吃 → 避坑建议。',
    genPrompt:
      'People queueing outside a popular restaurant on a sunny street, camera moving along the line then into entrance, lifestyle city vlog, photorealistic, no text',
  }),
]

export function casesByTab(tab: ShortVideoCaseKind | 'all'): ShortVideoCaseItem[] {
  if (tab === 'all') return SHORT_VIDEO_CASES
  return SHORT_VIDEO_CASES.filter((c) => c.kind === tab)
}

/** 需要 Seedance 补生成的案例 id（无大体积 mp4 时） */
export const SHORT_VIDEO_CASE_GEN_JOBS = SHORT_VIDEO_CASES.map((c) => ({
  id: c.id,
  aspect: c.aspect,
  prompt: c.genPrompt || c.title,
}))

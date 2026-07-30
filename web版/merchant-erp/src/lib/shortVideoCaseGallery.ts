/**
 * 短视频案例墙（发现 / 技能 / 短片）
 * 成片由 Seedance 生成；预览走 OSS 公网直链（秒开），本地 public 仅作源文件。
 */

import { SHORT_VIDEO_CASE_CDN_BASE } from './shortVideoCaseCdn'
import type { ShortVideoScriptRow } from './shortVideoScriptTable'
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
  /** 预览成片是否含 AI 口播（卡片悬停有声播放） */
  hasNarration?: boolean
  /** 口播文案（生成脚本 / 展示用） */
  narrationScript?: string
  /**
   * 无限画布「做同款」路径：分镜节点 + 口播；
   * 有值时点击做同款会写入画布并生成顺序连线。
   */
  canvasScriptRows?: ShortVideoScriptRow[]
}

const asset = (id: string, ext: 'png' | 'mp4') =>
  `${SHORT_VIDEO_CASE_CDN_BASE.replace(/\/$/, '')}/${id}.${ext}?v=cdn10`

function c(partial: ShortVideoCaseItem): ShortVideoCaseItem {
  return {
    ...partial,
    coverUrl: partial.coverUrl ?? asset(partial.id, 'png'),
    videoUrl: partial.videoUrl ?? asset(partial.id, 'mp4'),
  }
}

/**
 * 按案例成片总时长均分分镜 timeRange，与预览 mp4 的 durationSec 对齐。
 * 例：5 秒 × 3 镜 → 0-2 / 2-4 / 4-5 秒。
 */
export function withCaseCanvasTimeRanges(
  durationSec: number,
  shots: Array<{ visual: string; dialogue: string }>,
): ShortVideoScriptRow[] {
  const n = Math.max(1, shots.length)
  const total = Math.max(n, Math.round(Number(durationSec)) || n)
  const base = Math.floor(total / n)
  let rem = total - base * n
  let t = 0
  return shots.map((s) => {
    const len = Math.max(1, base + (rem > 0 ? 1 : 0))
    if (rem > 0) rem -= 1
    const start = t
    t += len
    return {
      timeRange: `${start}-${t}秒`,
      visual: s.visual,
      dialogue: s.dialogue,
    }
  })
}

/** 做同款时：把案例分镜 timeRange 对齐到案例视频时长 */
export function alignCanvasRowsToCaseDuration(
  rows: ShortVideoScriptRow[],
  durationSec: number,
): ShortVideoScriptRow[] {
  return withCaseCanvasTimeRanges(
    durationSec,
    rows.map((r) => ({ visual: r.visual, dialogue: r.dialogue })),
  )
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
    durationSec: 5,
    coverFrom: '#0f172a',
    coverTo: '#f97316',
    badge: '短片',
    prompt:
      '【Skill·探店成片】\n主题：夜市小吃街探店，暖黄灯光与烟火气。\n结构：街景推镜钩子 → 摊位特写 → 招牌菜出锅蒸汽 → 试吃反应 → 店名与人均收尾。\n运镜跟拍流畅，禁止静止幻灯。',
    genPrompt:
      'Night street food market in China, warm lantern glow, steam rising, handheld follow shot, continuous camera motion, cinematic food vlog, photorealistic, no text',
    hasNarration: true,
    narrationScript: '夜市烟火气太足了，这家摊位必吃，人均只要三十块。',
    canvasScriptRows: withCaseCanvasTimeRanges(5, [
      {
        visual: '夜市街景推镜钩子，暖黄灯笼与人流烟火气',
        dialogue: '夜市烟火气太足了',
      },
      {
        visual: '摊位招牌与出锅蒸汽特写，跟拍连贯',
        dialogue: '这家摊位必吃',
      },
      {
        visual: '试吃反应收尾，出店名与人均信息',
        dialogue: '人均只要三十块',
      },
    ]),
  }),
  c({
    id: 'case-seed-skincare',
    title: '护肤种草 · 15 秒',
    subtitle: '痛点开场 → 三卖点 → CTA',
    kind: 'skill',
    skillId: 'product_seed',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
    coverFrom: '#ec4899',
    coverTo: '#fdf2f8',
    badge: '技能',
    prompt:
      '【Skill·产品种草】\n主题：保湿精华种草。\n结构：干燥起皮痛点 → 瓶身亮相 → 质地拉丝特写 → 上脸吸收 → 限时福利 CTA。\n浅景深、主光柔和。',
    genPrompt:
      'Close-up of a clear glass cosmetic bottle on a vanity, soft morning light, gentle camera orbit, commercial product video, photorealistic',
    hasNarration: true,
    narrationScript: '皮肤干起皮？三秒吸收，今晚限时买一送一。',
  }),
  c({
    id: 'case-promo-618',
    title: '门店大促预告',
    subtitle: '数字冲击 + 福利闪切',
    kind: 'discover',
    skillId: 'promo_event',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
    coverFrom: '#dc2626',
    coverTo: '#fbbf24',
    badge: '发现',
    coverUrl: asset('case-promo-event', 'png'),
    videoUrl: asset('case-promo-event', 'mp4'),
    prompt:
      '【Skill·活动预告】\n主题：周末满减大促。\n结构：大字「满 100 减 30」冲击 → 活动时间 → 爆品闪切 → 到店 CTA。\n节奏快、信息清晰。',
    genPrompt:
      'Bright clothing boutique interior, soft warm lights, camera slowly dollies down the aisle, commercial atmosphere video, photorealistic',
    hasNarration: true,
    narrationScript: '周末满一百减三十，爆品闪购，现在到店就有！',
  }),
  c({
    id: 'case-ambiance-cafe',
    title: '咖啡馆氛围片',
    subtitle: '横屏品牌空间',
    kind: 'film',
    skillId: 'ambiance',
    aspect: '16:9',
    longform: true,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#1e3a8a',
    coverTo: '#67e8f9',
    badge: '技能',
    prompt:
      '【Skill·短剧钩子】\n主题：外卖迟到引发的反转误会。\n结构：门铃急促 → 错开门瞬间 → 表情特写冲突 → 悬念定格「下一秒……」。\n前 3 秒必须有冲突。',
    genPrompt:
      'Person opening apartment door at night looking surprised, cool hallway light, suspenseful short drama hook, continuous camera motion, photorealistic',
    hasNarration: true,
    narrationScript: '门铃响了，开门的瞬间……下一秒你绝对想不到。',
  }),
  c({
    id: 'case-food-ramen',
    title: '拉面特写',
    subtitle: '蒸汽 · 拉丝 · 食欲',
    kind: 'discover',
    skillId: 'food_closeup',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#fef3c7',
    coverTo: '#34d399',
    badge: '短片',
    prompt:
      '【Skill·探店成片】\n主题：周末早午餐探店，自然光、清新色调。\n结构：门头 → 座位环境 → 甜品与咖啡特写 → 试吃口播 → 预约 CTA。',
    genPrompt:
      'Sunny brunch cafe table, avocado toast and latte, natural window light, gentle push-in camera, lifestyle food video, photorealistic',
    hasNarration: true,
    narrationScript: '周末早午餐探店，这口牛油果吐司真的绝了，赶紧预约。',
    canvasScriptRows: withCaseCanvasTimeRanges(5, [
      {
        visual: '周末早午餐店门头与自然光座位环境',
        dialogue: '周末早午餐探店',
      },
      {
        visual: '牛油果吐司与咖啡特写，推镜食欲感',
        dialogue: '这口牛油果吐司真的绝了',
      },
      {
        visual: '试吃反应与预约 CTA 收尾',
        dialogue: '赶紧预约',
      },
    ]),
  }),
  c({
    id: 'case-seed-gadget',
    title: '数码小物种草',
    subtitle: '桌面场景 · 功能演示',
    kind: 'discover',
    skillId: 'product_seed',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
    coverFrom: '#0ea5e9',
    coverTo: '#e0f2fe',
    badge: '发现',
    prompt:
      '【Skill·产品种草】\n主题：桌面收纳小物。\n结构：桌面凌乱痛点 → 产品展开演示 → 三个功能特写 → 收纳前后对比 → CTA。',
    genPrompt:
      'Modern desk organizer with gadgets, cool blue ambient light, camera slowly orbiting product, tech product demo video, photorealistic',
    hasNarration: true,
    narrationScript: '桌面乱到爆？一个收纳盒搞定，桌面瞬间清爽。',
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
    durationSec: 5,
    coverFrom: '#7f1d1d',
    coverTo: '#f97316',
    badge: '短片',
    prompt:
      '【Skill·火锅局】\n主题：朋友火锅局，红油锅底热闹。\n结构：门口钩子 → 红油翻滚 → 涮菜 → 举杯 → 人均与必点。',
    genPrompt:
      'Cozy Chinese restaurant table at night, large metal soup pot steaming, vegetables and tofu cooking, warm orange lights, slow camera orbit, food commercial video, photorealistic, no text',
    hasNarration: true,
    narrationScript: '红油翻滚，朋友局开起来，人均八十，必点毛肚鸭血。',
    canvasScriptRows: withCaseCanvasTimeRanges(5, [
      {
        visual: '火锅店门口钩子切入，红油锅底翻滚特写',
        dialogue: '红油翻滚，朋友局开起来',
      },
      {
        visual: '涮毛肚鸭血，热闹举筷跟拍',
        dialogue: '人均八十，必点毛肚鸭血',
      },
      {
        visual: '举杯收尾，店招与氛围定格',
        dialogue: '今晚就约这一家',
      },
    ]),
  }),
  c({
    id: 'case-bbq',
    title: '烧烤夜宵',
    subtitle: '炭火滋滋 · 撸串',
    kind: 'discover',
    skillId: 'barbecue_night',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
    coverFrom: '#1c1917',
    coverTo: '#ea580c',
    badge: '发现',
    prompt:
      '【Skill·烧烤夜宵】\n主题：夜市烧烤撸串。\n结构：夜色街景 → 炭火 → 刷酱 → 咬一口 → 位置 CTA。',
    genPrompt:
      'Night barbecue grill with charcoal flames, skewers sizzling, warm street lights, handheld food vlog motion, photorealistic, no text',
    hasNarration: true,
    narrationScript: '炭火滋滋响，夜宵撸串走起，就在巷口第二家。',
    canvasScriptRows: withCaseCanvasTimeRanges(5, [
      {
        visual: '夜色街景到炭火烧烤摊，暖光跟拍',
        dialogue: '炭火滋滋响，夜宵撸串走起',
      },
      {
        visual: '刷酱滋滋与串肉特写，手持近景',
        dialogue: '酱香一口入魂',
      },
      {
        visual: '咬一口反应，巷口位置 CTA',
        dialogue: '就在巷口第二家',
      },
    ]),
  }),
  c({
    id: 'case-milktea',
    title: '新茶饮上新',
    subtitle: '杯身 · 第一口',
    kind: 'skill',
    skillId: 'milk_tea_new',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
    coverFrom: '#fce7f3',
    coverTo: '#fb7185',
    badge: '技能',
    prompt:
      '【Skill·新茶饮上新】\n主题：季节限定奶茶上新。\n结构：杯身亮相 → 原料闪切 → 第一口 → 活动价 → CTA。',
    genPrompt:
      'Colorful bubble tea cup spinning slowly, fresh fruit toppings, bright shop background, product commercial camera orbit, photorealistic, no text',
    hasNarration: true,
    narrationScript: '季节限定上新，第一口敲甜，活动价只要十五。',
    canvasScriptRows: withCaseCanvasTimeRanges(5, [
      {
        visual: '新茶饮杯身旋转亮相，店内明亮背景',
        dialogue: '季节限定上新',
      },
      {
        visual: '原料闪切与第一口特写',
        dialogue: '第一口敲甜',
      },
      {
        visual: '活动价字幕感收尾与下单 CTA（画面勿烧字）',
        dialogue: '活动价只要十五',
      },
    ]),
  }),
  c({
    id: 'case-hair',
    title: '美发变装',
    subtitle: '前后对比 · 预约',
    kind: 'film',
    skillId: 'hair_salon',
    aspect: '9:16',
    longform: true,
    durationSec: 5,
    coverFrom: '#312e81',
    coverTo: '#a5b4fc',
    badge: '短片',
    prompt:
      '【Skill·美发变装】\n主题：发型改造前后对比。\n结构：咨询 → 过程闪切 → 前后对比 → 出门 → 预约。',
    genPrompt:
      'Modern hair salon, stylist cutting hair, mirror reflection, before-after transformation vibe, continuous camera motion, photorealistic, no text',
    hasNarration: true,
    narrationScript: '发型改造前后对比，出门回头率拉满，现在预约。',
  }),
  c({
    id: 'case-nail',
    title: '美甲美睫特写',
    subtitle: '微距完成面',
    kind: 'skill',
    skillId: 'nail_beauty',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#0f172a',
    coverTo: '#22d3ee',
    badge: '发现',
    prompt:
      '【Skill·健身打卡】\n主题：健身房打卡。\n结构：进场 → 训练动作 → 教练 → 汗水特写 → 体验 CTA。',
    genPrompt:
      'Modern gym workout, person lifting weights, energetic camera follow, sweat and motion, fitness commercial video, photorealistic, no text',
    hasNarration: true,
    narrationScript: '训练打卡不停，汗水见证成长，体验课限时开放。',
  }),
  c({
    id: 'case-hotel',
    title: '酒店入住漫游',
    subtitle: '客房推门 · 窗景',
    kind: 'film',
    skillId: 'hotel_stay',
    aspect: '9:16',
    longform: true,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#fef08a',
    coverTo: '#fb923c',
    badge: '发现',
    prompt:
      '【Skill·亲子乐园】\n主题：周末遛娃乐园。\n结构：门口 → 玩耍 → 家长安心 → 门票 → 预约。',
    genPrompt:
      'Colorful indoor kids playground, children playing happily, bright safe atmosphere, gentle camera motion, photorealistic, no text',
    hasNarration: true,
    narrationScript: '周末遛娃好去处，安全好玩，套餐更划算。',
  }),
  c({
    id: 'case-pet',
    title: '猫咖探店',
    subtitle: '萌宠互动',
    kind: 'skill',
    skillId: 'pet_cafe',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#14532d',
    coverTo: '#86efac',
    badge: '发现',
    prompt:
      '【Skill·外卖开箱】\n主题：家常菜外卖开箱。\n结构：拆袋 → 摆盘 → 份量 → 第一口 → 下单 CTA。',
    genPrompt:
      'Unboxing takeaway food bags on a dining table, opening containers, appetizing steam, top-down then close-up motion, photorealistic, no text',
    hasNarration: true,
    narrationScript: '外卖开箱看份量，第一口就上头，下单冲。',
  }),
  c({
    id: 'case-bakery',
    title: '烘焙出炉',
    subtitle: '面包香 · 切片',
    kind: 'film',
    skillId: 'food_closeup',
    aspect: '9:16',
    longform: false,
    durationSec: 5,
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
    durationSec: 5,
    coverFrom: '#0e7490',
    coverTo: '#a5f3fc',
    badge: '技能',
    prompt:
      '【Skill·探店成片】\n主题：网红店周末排队探店。\n结构：排队长龙钩子 → 进店 → 必点出餐 → 试吃 → 避坑建议。',
    genPrompt:
      'People queueing outside a popular restaurant on a sunny street, camera moving along the line then into entrance, lifestyle city vlog, photorealistic, no text',
    hasNarration: true,
    narrationScript: '网红店周末排队，进门必点这道，避坑建议听我说。',
  }),
]

export function casesByTab(tab: ShortVideoCaseKind | 'all'): ShortVideoCaseItem[] {
  if (tab === 'all') return SHORT_VIDEO_CASES
  return SHORT_VIDEO_CASES.filter((c) => c.kind === tab)
}

/** 无限画布下方：本地生活 + 含口播 + 已配置画布路径 */
export function canvasLocalLifeCases(): ShortVideoCaseItem[] {
  return SHORT_VIDEO_CASES.filter(
    (c) =>
      c.hasNarration &&
      Array.isArray(c.canvasScriptRows) &&
      (c.canvasScriptRows?.length ?? 0) >= 2,
  ).slice(0, 5)
}

/** 需要 Seedance 补生成的案例 id（无大体积 mp4 时） */
export const SHORT_VIDEO_CASE_GEN_JOBS = SHORT_VIDEO_CASES.map((c) => ({
  id: c.id,
  aspect: c.aspect,
  prompt: c.genPrompt || c.title,
}))

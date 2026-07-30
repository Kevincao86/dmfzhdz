/**
 * 商家短视频 Skill 库（可复用创作工作流）
 */

export type ShortVideoSkillId =
  | 'store_visit'
  | 'product_seed'
  | 'promo_event'
  | 'ambiance'
  | 'short_drama_hook'
  | 'food_closeup'
  | 'hotpot_feast'
  | 'barbecue_night'
  | 'milk_tea_new'
  | 'hair_salon'
  | 'nail_beauty'
  | 'gym_checkin'
  | 'hotel_stay'
  | 'kids_play'
  | 'pet_cafe'
  | 'takeaway_unbox'

/** Brief 必填槽位（生成前门禁） */
export type ShortVideoBriefSlotId = 'scene' | 'offer' | 'audience'

/** 结构节拍：钩子 / 主品或卖点 / 行动号召 */
export type ShortVideoStructureBeat = 'hook' | 'product' | 'cta'

export type ShortVideoSkill = {
  id: ShortVideoSkillId
  name: string
  description: string
  category: '探店' | '种草' | '活动' | '门店' | '短剧' | '美食' | '美业' | '休闲' | '本地生活'
  promptTemplate: string
  preferLongform: boolean
  preferAspect: '9:16' | '16:9' | '1:1'
  tags: string[]
  /** 选中 Skill 后生成前必须具备的 Brief 槽 */
  briefSlots: ShortVideoBriefSlotId[]
  /** 分镜/文案应覆盖的结构节拍 */
  structureBeats: ShortVideoStructureBeat[]
}

function skill(partial: ShortVideoSkill): ShortVideoSkill {
  return partial
}

const BEATS_FULL: ShortVideoStructureBeat[] = ['hook', 'product', 'cta']
const BEATS_HOOK_CTA: ShortVideoStructureBeat[] = ['hook', 'cta']
const SLOTS_SCENE_OFFER: ShortVideoBriefSlotId[] = ['scene', 'offer']
const SLOTS_ALL: ShortVideoBriefSlotId[] = ['scene', 'offer', 'audience']

export const SHORT_VIDEO_SKILLS: ShortVideoSkill[] = [
  skill({
    id: 'store_visit',
    name: '探店成片',
    description: '门头进店 → 环境 → 招牌菜/主品 → 口播种草，适合抖音探店',
    category: '探店',
    preferLongform: true,
    preferAspect: '9:16',
    tags: ['探店', '本地生活', '9:16'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·探店成片】',
      '主题：{门店/商圈} 探店短片，语气亲切真实。',
      '结构：0–3s 门头或街景钩子 → 进店环视 → 主品/招牌特写与制作过程 → 试吃/体验反应 → 收尾口播与行动号召。',
      '运镜：跟拍+轻推镜，禁止静止幻灯；主光自然，色调偏暖。',
      '口播要点：店名、位置、必点、人均、一句记忆点。',
      '请结合我补充的门店信息完善分镜与口播。',
    ].join('\n'),
  }),
  skill({
    id: 'product_seed',
    name: '产品种草',
    description: '痛点开场 → 产品展示 → 卖点特写 → 使用场景 → 转化收尾',
    category: '种草',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['种草', '电商', '卖点'],
    briefSlots: SLOTS_ALL,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·产品种草】',
      '主题：{产品名} 种草短视频，强调真实使用感。',
      '结构：痛点/场景钩子 → 产品开箱或亮相 → 3 个核心卖点特写 → 使用场景 → 限时/福利收尾。',
      '画面：主体清晰、景深浅、运镜流畅；前 2 秒必须有动作。',
      '口播：口语化，每句一个卖点，结尾 CTA。',
      '请结合产品卖点与素材完善提示词。',
    ].join('\n'),
  }),
  skill({
    id: 'promo_event',
    name: '活动预告',
    description: '节日/大促预告，信息密度高、节奏快、强 CTA',
    category: '活动',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['活动', '大促', '预告', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_HOOK_CTA,
    promptTemplate: [
      '【Skill·活动预告】',
      '主题：{活动名} 预告短片，信息清晰、节奏明快。',
      '结构：活动名冲击开场 → 时间地点/规则 → 亮点福利闪切 → 倒计时或行动号召。',
      '画面：高对比、快切、字幕友好；竖屏信息区留白。',
      '口播：短句、数字突出、结尾强 CTA。',
    ].join('\n'),
  }),
  skill({
    id: 'ambiance',
    name: '门店氛围',
    description: '空间氛围片：灯光、材质、客流，适合品牌形象',
    category: '门店',
    preferLongform: true,
    preferAspect: '16:9',
    tags: ['氛围', '品牌', '空间', '本地生活'],
    briefSlots: ['scene'],
    structureBeats: ['hook', 'product'],
    promptTemplate: [
      '【Skill·门店氛围】',
      '主题：{品牌/门店} 空间氛围短片，电影感但不空洞。',
      '结构：外立面/灯光 → 材质与细节 → 客流与服务瞬间 → 品牌收尾。',
      '运镜：缓慢推轨、轻摇；色调统一；避免空镜过长。',
      '口播可弱化，以氛围与字幕为主。',
    ].join('\n'),
  }),
  skill({
    id: 'short_drama_hook',
    name: '短剧钩子',
    description: '12–15s 强冲突开场：设定角色 → 冲突 → 悬念留白',
    category: '短剧',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['短剧', '钩子', '叙事'],
    briefSlots: ['scene', 'offer'],
    structureBeats: BEATS_HOOK_CTA,
    promptTemplate: [
      '【Skill·短剧钩子】',
      '主题：{一句话故事}，前 3 秒必须冲突或反转。',
      '结构：角色亮相 → 意外/冲突 → 情绪顶点 → 悬念定格（引导完播/下集）。',
      '画面：人物表情清晰、运镜跟拍；禁止拖沓空镜。',
      '口播/对白：短、狠、口语；可加一句旁白钩子。',
    ].join('\n'),
  }),
  skill({
    id: 'food_closeup',
    name: '美食特写',
    description: '蒸汽、拉丝、切割特写，食欲向竖屏',
    category: '美食',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['美食', '特写', '食欲', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·美食特写】',
      '主题：{菜品} 食欲向短视频。',
      '结构：成品全景 → 蒸汽/油光特写 → 切割或拉丝 → 入口/蘸料 → 店名收尾。',
      '画面：暖色、浅景深、微距；运镜环绕或慢推。',
      '口播：突出味道、份量、价格记忆点。',
    ].join('\n'),
  }),
  skill({
    id: 'hotpot_feast',
    name: '火锅局',
    description: '本地生活火锅局：红油翻滚、涮菜、欢呼举杯',
    category: '本地生活',
    preferLongform: true,
    preferAspect: '9:16',
    tags: ['火锅', '聚餐', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·火锅局】',
      '主题：{火锅店名} 朋友局/家庭局，热闹真实。',
      '结构：门口/排队钩子 → 红油翻滚特写 → 涮菜动作 → 举杯欢呼 → 人均与必点收尾。',
      '运镜：跟拍+特写交替，禁止静止；色调偏暖红。',
      '口播：店名、推荐锅底、必涮菜、人均、预约提示。',
    ].join('\n'),
  }),
  skill({
    id: 'barbecue_night',
    name: '烧烤夜宵',
    description: '夜市烧烤烟火：炭火、滋滋声、撸串氛围',
    category: '本地生活',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['烧烤', '夜宵', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·烧烤夜宵】',
      '主题：{烧烤店} 夜宵撸串。',
      '结构：夜色街景 → 炭火滋滋 → 刷酱翻面 → 咬一口反应 → 位置 CTA。',
      '画面：暖黄灯光、油光、烟雾；运镜跟拍。',
      '口播：招牌串、啤酒搭配、营业时间。',
    ].join('\n'),
  }),
  skill({
    id: 'milk_tea_new',
    name: '新茶饮上新',
    description: '奶茶/咖啡上新：杯身、原料、第一口',
    category: '本地生活',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['奶茶', '上新', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·新茶饮上新】',
      '主题：{品牌} {新品名} 上新短视频。',
      '结构：杯身亮相 → 原料/制作闪切 → 第一口特写 → 价格/活动 → 到店/外卖 CTA。',
      '画面：清新明亮、浅景深；前 2 秒必须有动作。',
      '口播：口感关键词、糖度建议、限时信息。',
    ].join('\n'),
  }),
  skill({
    id: 'hair_salon',
    name: '美发变装',
    description: '美发门店：洗剪吹前后对比与氛围',
    category: '美业',
    preferLongform: true,
    preferAspect: '9:16',
    tags: ['美发', '变装', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·美发变装】',
      '主题：{美发店} 造型改造。',
      '结构：进店/咨询 → 剪烫染过程闪切 → 前后对比 → 出门回头率 → 预约 CTA。',
      '运镜：跟拍+镜子特写；色调干净。',
      '口播：设计师、适合脸型、价位区间、预约方式。',
    ].join('\n'),
  }),
  skill({
    id: 'nail_beauty',
    name: '美甲美睫',
    description: '美甲/美睫细节特写与完成面',
    category: '美业',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['美甲', '美睫', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·美甲美睫】',
      '主题：{门店} 美甲/美睫成片。',
      '结构：工具/色板钩子 → 过程特写 → 完成面展示 → 灯光下闪光 → 预约 CTA。',
      '画面：微距、干净台面；运镜缓慢环绕。',
      '口播：款式名、时长、价格、保养提示。',
    ].join('\n'),
  }),
  skill({
    id: 'gym_checkin',
    name: '健身打卡',
    description: '健身房/瑜伽：训练节奏与打卡氛围',
    category: '休闲',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['健身', '打卡', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·健身打卡】',
      '主题：{健身房/瑜伽馆} 打卡短视频。',
      '结构：进场钩子 → 训练动作片段 → 教练指导 → 汗水特写 → 办卡/体验 CTA。',
      '运镜：跟拍、慢动作切换；节奏有力。',
      '口播：课种、体验价、地址。',
    ].join('\n'),
  }),
  skill({
    id: 'hotel_stay',
    name: '酒店民宿',
    description: '入住/民宿空间漫游与入住体验',
    category: '休闲',
    preferLongform: true,
    preferAspect: '9:16',
    tags: ['酒店', '民宿', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·酒店民宿】',
      '主题：{酒店/民宿名} 入住体验。',
      '结构：外观/大厅 → 客房推开门 → 床品/窗景细节 → 早餐或公区 → 预订 CTA。',
      '运镜：缓慢推轨；色调干净高级。',
      '口播：地段、房型亮点、价格区间。',
    ].join('\n'),
  }),
  skill({
    id: 'kids_play',
    name: '亲子乐园',
    description: '儿童乐园/亲子餐厅：欢快安全氛围',
    category: '本地生活',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['亲子', '乐园', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·亲子乐园】',
      '主题：{乐园/亲子店} 周末遛娃。',
      '结构：门口钩子 → 孩子玩耍片段 → 家长安心镜头 → 套餐/门票 → 预约 CTA。',
      '画面：明亮安全、暖色；运镜轻快。',
      '口播：适合年龄、时长、价格。',
    ].join('\n'),
  }),
  skill({
    id: 'pet_cafe',
    name: '宠物友好',
    description: '宠物店/猫咖：萌宠互动与探店',
    category: '本地生活',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['宠物', '猫咖', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·宠物友好】',
      '主题：{猫咖/宠物店} 探店。',
      '结构：萌宠特写钩子 → 互动瞬间 → 环境与餐品 → 规则提示 → 到店 CTA。',
      '画面：浅景深、可爱情绪；运镜跟拍。',
      '口播：品种亮点、消费说明、预约。',
    ].join('\n'),
  }),
  skill({
    id: 'takeaway_unbox',
    name: '外卖开箱',
    description: '外卖到家开箱：包装、份量、第一口',
    category: '本地生活',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['外卖', '开箱', '本地生活'],
    briefSlots: SLOTS_SCENE_OFFER,
    structureBeats: BEATS_FULL,
    promptTemplate: [
      '【Skill·外卖开箱】',
      '主题：{门店} 外卖开箱测评。',
      '结构：门铃/拆袋钩子 → 摆盘全景 → 份量特写 → 第一口评价 → 复购/下单 CTA。',
      '画面：桌面俯拍+特写；运镜干脆。',
      '口播：配送时长、口感、性价比。',
    ].join('\n'),
  }),
]

export const BRIEF_SLOT_LABELS: Record<ShortVideoBriefSlotId, string> = {
  scene: '场景/门店',
  offer: '卖点/主品',
  audience: '受众',
}

export const STRUCTURE_BEAT_LABELS: Record<ShortVideoStructureBeat, string> = {
  hook: '开场钩子',
  product: '主品/卖点',
  cta: '行动号召',
}

export function findShortVideoSkill(id: string | null | undefined): ShortVideoSkill | null {
  if (!id) return null
  return SHORT_VIDEO_SKILLS.find((s) => s.id === id) ?? null
}

export function matchSkillsByQuery(q: string): ShortVideoSkill[] {
  const t = q.trim().toLowerCase()
  if (!t) return SHORT_VIDEO_SKILLS
  return SHORT_VIDEO_SKILLS.filter(
    (s) =>
      s.name.toLowerCase().includes(t) ||
      s.description.includes(t) ||
      s.category.includes(t) ||
      s.tags.some((tag) => tag.toLowerCase().includes(t)),
  )
}

export function composeSkillPrompt(skillItem: ShortVideoSkill, userNote: string): string {
  const note = userNote.trim()
  if (!note) return skillItem.promptTemplate
  if (note.includes('【Skill·')) return note
  return `${skillItem.promptTemplate}\n\n【商家补充】\n${note}`
}

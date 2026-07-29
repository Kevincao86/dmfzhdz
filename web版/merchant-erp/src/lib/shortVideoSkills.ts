/**
 * 商家短视频 Skill 库（对齐即梦 Agent Skill：可复用的创作工作流说明书）
 */

export type ShortVideoSkillId =
  | 'store_visit'
  | 'product_seed'
  | 'promo_event'
  | 'ambiance'
  | 'short_drama_hook'
  | 'food_closeup'

export type ShortVideoSkill = {
  id: ShortVideoSkillId
  name: string
  description: string
  category: '探店' | '种草' | '活动' | '门店' | '短剧' | '美食'
  /** 注入到执导文案的模板（含占位说明） */
  promptTemplate: string
  /** 应用 Skill 时是否建议开启长视频 */
  preferLongform: boolean
  preferAspect: '9:16' | '16:9' | '1:1'
  tags: string[]
}

export const SHORT_VIDEO_SKILLS: ShortVideoSkill[] = [
  {
    id: 'store_visit',
    name: '探店成片',
    description: '门头进店 → 环境 → 招牌菜/主品 → 口播种草，适合抖音探店',
    category: '探店',
    preferLongform: true,
    preferAspect: '9:16',
    tags: ['探店', '本地生活', '9:16'],
    promptTemplate: [
      '【Skill·探店成片】',
      '主题：{门店/商圈} 探店短片，语气亲切真实。',
      '结构：0–3s 门头或街景钩子 → 进店环视 → 主品/招牌特写与制作过程 → 试吃/体验反应 → 收尾口播与行动号召。',
      '运镜：跟拍+轻推镜，禁止静止幻灯；主光自然，色调偏暖。',
      '口播要点：店名、位置、必点、人均、一句记忆点。',
      '请结合我补充的门店信息完善分镜与口播。',
    ].join('\n'),
  },
  {
    id: 'product_seed',
    name: '产品种草',
    description: '痛点开场 → 产品展示 → 卖点特写 → 使用场景 → 转化收尾',
    category: '种草',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['种草', '电商', '卖点'],
    promptTemplate: [
      '【Skill·产品种草】',
      '主题：{产品名} 种草短视频，强调真实使用感。',
      '结构：痛点/场景钩子 → 产品开箱或亮相 → 3 个核心卖点特写 → 使用场景 → 限时/福利收尾。',
      '画面：主体清晰、景深浅、运镜流畅；前 2 秒必须有动作。',
      '口播：口语化，每句一个卖点，结尾 CTA。',
      '请结合产品卖点与素材完善提示词。',
    ].join('\n'),
  },
  {
    id: 'promo_event',
    name: '活动预告',
    description: '节日/大促预告，信息密度高、节奏快、强 CTA',
    category: '活动',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['活动', '大促', '预告'],
    promptTemplate: [
      '【Skill·活动预告】',
      '主题：{活动名} 预告短片，信息清晰、节奏明快。',
      '结构：活动名冲击开场 → 时间地点/规则 → 亮点福利闪切 → 倒计时或行动号召。',
      '画面：高对比、快切、字幕友好；竖屏信息区留白。',
      '口播：短句、数字突出、结尾强 CTA。',
    ].join('\n'),
  },
  {
    id: 'ambiance',
    name: '门店氛围',
    description: '空间氛围片：灯光、材质、客流，适合品牌形象',
    category: '门店',
    preferLongform: true,
    preferAspect: '16:9',
    tags: ['氛围', '品牌', '空间'],
    promptTemplate: [
      '【Skill·门店氛围】',
      '主题：{品牌/门店} 空间氛围短片，电影感但不空洞。',
      '结构：外立面/灯光 → 材质与细节 → 客流与服务瞬间 → 品牌收尾。',
      '运镜：缓慢推轨、轻摇；色调统一；避免空镜过长。',
      '口播可弱化，以氛围与字幕为主。',
    ].join('\n'),
  },
  {
    id: 'short_drama_hook',
    name: '短剧钩子',
    description: '12–15s 强冲突开场：设定角色 → 冲突 → 悬念留白',
    category: '短剧',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['短剧', '钩子', '叙事'],
    promptTemplate: [
      '【Skill·短剧钩子】',
      '主题：{一句话故事}，前 3 秒必须冲突或反转。',
      '结构：角色亮相 → 意外/冲突 → 情绪顶点 → 悬念定格（引导完播/下集）。',
      '画面：人物表情清晰、运镜跟拍；禁止拖沓空镜。',
      '口播/对白：短、狠、口语；可加一句旁白钩子。',
    ].join('\n'),
  },
  {
    id: 'food_closeup',
    name: '美食特写',
    description: '蒸汽、拉丝、切割特写，食欲向竖屏',
    category: '美食',
    preferLongform: false,
    preferAspect: '9:16',
    tags: ['美食', '特写', '食欲'],
    promptTemplate: [
      '【Skill·美食特写】',
      '主题：{菜品} 食欲向短视频。',
      '结构：成品全景 → 蒸汽/油光特写 → 切割或拉丝 → 入口/蘸料 → 店名收尾。',
      '画面：暖色、浅景深、微距；运镜环绕或慢推。',
      '口播：突出味道、份量、价格记忆点。',
    ].join('\n'),
  },
]

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

/** 将 Skill 模板与用户补充合并为执导文案 */
export function composeSkillPrompt(skill: ShortVideoSkill, userNote: string): string {
  const note = userNote.trim()
  if (!note) return skill.promptTemplate
  if (note.includes('【Skill·')) return note
  return `${skill.promptTemplate}\n\n【商家补充】\n${note}`
}

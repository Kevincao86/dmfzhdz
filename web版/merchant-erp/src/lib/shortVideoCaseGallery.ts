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
  /** 做同款回填文案 */
  prompt: string
  aspect: '9:16' | '16:9' | '1:1'
  longform: boolean
  durationSec: number
  /** 封面渐变（无素材时回退） */
  coverFrom: string
  coverTo: string
  badge?: string
  /** AI 生成封面图（public） */
  coverUrl?: string
  /** AI 封面运镜短片（public mp4） */
  videoUrl?: string
}

const asset = (id: string, ext: 'png' | 'mp4') => `/short-video-cases/${id}.${ext}?v=seedance2`

export const SHORT_VIDEO_CASES: ShortVideoCaseItem[] = [
  {
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
    coverUrl: asset('case-visit-night', 'png'),
    videoUrl: asset('case-visit-night', 'mp4'),
    prompt:
      '【Skill·探店成片】\n主题：夜市小吃街探店，暖黄灯光与烟火气。\n结构：街景推镜钩子 → 摊位特写 → 招牌菜出锅蒸汽 → 试吃反应 → 店名与人均收尾。\n运镜跟拍流畅，禁止静止幻灯。',
  },
  {
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
    coverUrl: asset('case-seed-skincare', 'png'),
    videoUrl: asset('case-seed-skincare', 'mp4'),
    prompt:
      '【Skill·产品种草】\n主题：保湿精华种草。\n结构：干燥起皮痛点 → 瓶身亮相 → 质地拉丝特写 → 上脸吸收 → 限时福利 CTA。\n浅景深、主光柔和。',
  },
  {
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
  },
  {
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
    coverUrl: asset('case-ambiance-cafe', 'png'),
    videoUrl: asset('case-ambiance-cafe', 'mp4'),
    prompt:
      '【Skill·门店氛围】\n主题：独立咖啡馆空间氛围。\n结构：外立面黄昏 → 木纹与杯具细节 → 拉花特写 → 客流柔焦 → Logo 收尾。\n缓慢推轨，色调偏暖灰。',
  },
  {
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
    coverUrl: asset('case-drama-hook', 'png'),
    videoUrl: asset('case-drama-hook', 'mp4'),
    prompt:
      '【Skill·短剧钩子】\n主题：外卖迟到引发的反转误会。\n结构：门铃急促 → 错开门瞬间 → 表情特写冲突 → 悬念定格「下一秒……」。\n前 3 秒必须有冲突。',
  },
  {
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
    coverUrl: asset('case-food-ramen', 'png'),
    videoUrl: asset('case-food-ramen', 'mp4'),
    prompt:
      '【Skill·美食特写】\n主题：日式豚骨拉面。\n结构：整碗全景 → 蒸汽升腾 → 筷子拉面 → 叉烧特写 → 店名收尾。\n暖色微距，环绕运镜。',
  },
  {
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
    coverUrl: asset('case-visit-brunch', 'png'),
    videoUrl: asset('case-visit-brunch', 'mp4'),
    prompt:
      '【Skill·探店成片】\n主题：周末早午餐探店，自然光、清新色调。\n结构：门头 → 座位环境 → 甜品与咖啡特写 → 试吃口播 → 预约 CTA。',
  },
  {
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
    coverUrl: asset('case-seed-gadget', 'png'),
    videoUrl: asset('case-seed-gadget', 'mp4'),
    prompt:
      '【Skill·产品种草】\n主题：桌面收纳小物。\n结构：桌面凌乱痛点 → 产品展开演示 → 三个功能特写 → 收纳前后对比 → CTA。',
  },
]

export function casesByTab(tab: ShortVideoCaseKind | 'all'): ShortVideoCaseItem[] {
  if (tab === 'all') return SHORT_VIDEO_CASES
  return SHORT_VIDEO_CASES.filter((c) => c.kind === tab)
}

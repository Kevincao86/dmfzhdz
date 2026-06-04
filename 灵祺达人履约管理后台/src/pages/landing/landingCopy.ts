import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { WORK_EDITION_LABEL } from '../../lib/mpWorkIdentity'

export const HERO_FRAMES = ['/landing/hero-1.png', '/landing/hero-2.png', '/landing/hero-3.png'] as const

export const ROLE_LABEL = WORK_EDITION_LABEL

export const MARKETING_BY_ROLE: Record<
  MpWorkIdentity,
  { headline: string; sub: string; cta: string }
> = {
  talent: {
    headline: '达人履约',
    sub: '好撮合成就好履约 · AI 置顶高契合商单',
    cta: '找商单就上灵祺履约平台',
  },
  shoot: {
    headline: '拍摄履约',
    sub: '拍剪任务大厅 · 商单对接与档期协同',
    cta: '接拍摄任务就上灵祺履约平台',
  },
  edit: {
    headline: '剪辑履约',
    sub: '云剪与剪辑任务 · 素材交付一站协同',
    cta: '接剪辑任务就上灵祺履约平台',
  },
  pr: {
    headline: '品牌发单',
    sub: '智能推荐达人 · 招募反选群码一站完成',
    cta: '发招募就上灵祺履约平台',
  },
}

export const ROLE_PICKER_DESC: Record<MpWorkIdentity, string> = {
  talent: '接单大厅 · 推荐商单 · 履约与消息',
  shoot: '拍摄任务大厅 · 档期与素材协同',
  edit: '剪辑 / 云剪任务 · 交付与进度跟踪',
  pr: '发招募 · 推荐达人 · 反选与群码',
}

export const SECTION2_CARDS = [
  {
    title: 'AI 智能撮合',
    desc: '完善资料后，高契合本地生活商单自动置顶推荐',
    img: '/landing/card-brand.png',
    tag: '达人大厅',
  },
  {
    title: '探店种草履约',
    desc: '同城探店、急单、云剪直派，报名到结算全流程可视',
    img: '/landing/card-product.png',
    tag: '履约账本',
  },
  {
    title: '门店实地打卡',
    desc: '多种合作形式，群码入群、到店核销、回链核查一站协同',
    img: '/landing/card-store.png',
    tag: '本地生活',
  },
  {
    title: 'PR 智能荐达人',
    desc: '按招募要求匹配达人，沟通私信、反选入选高效闭环',
    img: '/landing/card-app.png',
    tag: 'PR 工作台',
  },
] as const

export const SECTION3_STEPS = [
  {
    n: '01',
    sub: '丰富的商单供给',
    title: 'AI 置顶高契合商单',
    desc: '根据达人资料与历史履约，自动把最匹配的探店、急单、云剪任务推到列表最前。',
    bullets: ['契合度评分', '同城优先', '急单提醒'],
    accent: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.35)',
  },
  {
    n: '02',
    sub: '全面的履约方案',
    title: '招募 · 反选 · 群码协同',
    desc: 'PR 发招募、达人报名、运营反选、群码入群与私信沟通在同一套流程里完成。',
    bullets: ['模版发单', '反选入选', '7 天群码清理'],
    accent: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.35)',
  },
  {
    n: '03',
    sub: '完善的过程数据',
    title: '科学度量匹配与履约效果',
    desc: '从报名、探店、发布回链到结算，关键节点可追踪，方便复盘每一次合作效果。',
    bullets: ['履约看板', '回链核查', '完成率统计'],
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.35)',
  },
] as const

export const SECTION4_STEPS = [
  { n: '01', title: '完善达人资料', active: true },
  { n: '02', title: 'AI 匹配商单', active: false },
  { n: '03', title: '履约效果回溯', active: false },
] as const

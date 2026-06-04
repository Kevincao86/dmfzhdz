import type { MpAccountRole } from '../../lib/mpSession'

export const HERO_FRAMES = ['/landing/hero-1.png', '/landing/hero-2.png', '/landing/hero-3.png'] as const

export const ROLE_LABEL: Record<MpAccountRole, string> = {
  talent: '达人版',
  pr: 'PR 版',
}

export const MARKETING_BY_ROLE: Record<
  MpAccountRole,
  { headline: string; sub: string; cta: string }
> = {
  talent: {
    headline: '达人履约',
    sub: '好撮合成就好履约 · AI 置顶高契合商单',
    cta: '找商单就上灵祺履约台',
  },
  pr: {
    headline: '品牌发单',
    sub: '智能荐达人 · 招募反选群码一站完成',
    cta: '发招募就上灵祺履约台',
  },
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
    color: 'from-pink-500 to-rose-400',
  },
  {
    n: '02',
    sub: '全面的履约方案',
    title: '招募 · 反选 · 群码协同',
    color: 'from-amber-400 to-orange-400',
  },
  {
    n: '03',
    sub: '完善的过程数据',
    title: '科学度量匹配与履约效果',
    color: 'from-sky-400 to-indigo-500',
  },
] as const

export const SECTION4_STEPS = [
  { n: '01', title: '完善达人资料', active: true },
  { n: '02', title: 'AI 匹配商单', active: false },
  { n: '03', title: '履约效果回溯', active: false },
] as const

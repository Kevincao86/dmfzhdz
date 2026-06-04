import type { AppEdition } from '../../lib/appEdition'
import { getAppEdition } from '../../lib/appEdition'

export type LandingEditionKey = AppEdition

export type LandingHeroMarketing = {
  headline: string
  sub: string
  cta: string
  accentEn: string
}

export type LandingCard = {
  title: string
  desc: string
  img: string
  tag: string
}

export type LandingStep3 = {
  n: string
  sub: string
  title: string
  desc: string
  bullets: readonly string[]
  accent: string
  glow: string
}

export type LandingStep4 = {
  n: string
  title: string
  active: boolean
}

export type LandingConfig = {
  edition: LandingEditionKey
  assetBase: string
  brandTagline: string
  productTitle: string
  heroFrames: readonly string[]
  heroVideo: string
  marketing: Record<LandingEditionKey, LandingHeroMarketing>
  section2Title: string
  section2TitleAccent: string
  section2Subtitle: string
  section2Cards: readonly LandingCard[]
  section3Eyebrow: string
  section3Subtitle: string
  section3Steps: readonly LandingStep3[]
  section4Title: string
  section4TitleAccent: string
  section4Steps: readonly LandingStep4[]
  section4PanelTitle: string
  section4PanelDesc: string
  section4ShowcaseImg: string
  section4Tags: readonly string[]
}

function asset(edition: LandingEditionKey, name: string) {
  const base = edition === 'partner' ? '/landing-partner' : '/landing-merchant'
  return `${base}/${name}`
}

const MERCHANT_MARKETING: Record<LandingEditionKey, LandingHeroMarketing> = {
  merchant: {
    headline: '智能经营',
    sub: '多平台门店一体管 · AI 智能体辅助决策',
    cta: '开店经营就上灵祺商家平台',
    accentEn: 'Smart Growth',
  },
  partner: {
    headline: '代运营增长',
    sub: '多客户商家协同 · 服务商身份一站绑定',
    cta: '承接客户就上灵祺服务商平台',
    accentEn: 'Partner Scale',
  },
}

const PARTNER_MARKETING: Record<LandingEditionKey, LandingHeroMarketing> = {
  merchant: {
    headline: '商家工作台',
    sub: '从服务商入口快捷了解商家版能力',
    cta: '前往灵祺商家版登录',
    accentEn: 'Merchant ERP',
  },
  partner: {
    headline: '服务商工作台',
    sub: '绑定客户商家 · 多平台商品与招募代运营',
    cta: '代运营就上灵祺服务商平台',
    accentEn: 'Partner OS',
  },
}

function buildConfig(edition: LandingEditionKey): LandingConfig {
  const isPartner = edition === 'partner'
  const marketing = isPartner ? PARTNER_MARKETING : MERCHANT_MARKETING

  return {
    edition,
    assetBase: isPartner ? '/landing-partner' : '/landing-merchant',
    brandTagline: isPartner ? 'LingQi · Partner OS' : 'LingQi · Local Life OS',
    productTitle: isPartner ? '灵祺AI智能ERP · 服务商版' : '灵祺AI智能ERP · 商家版',
    heroFrames: [
      asset(edition, 'hero-1.png'),
      asset(edition, 'hero-2.png'),
      asset(edition, 'hero-3.png'),
    ],
    heroVideo: asset(edition, 'hero-loop.mp4'),
    marketing,
    section2Title: isPartner
      ? '服务商影响力，就是'
      : '商家经营力，就是',
    section2TitleAccent: isPartner ? '代运营生产力' : '增长生产力',
    section2Subtitle: isPartner
      ? '多客户商家绑定 · 平台服务商凭证 · 达人招募与投流一站代操'
      : '多平台门店 · AI 智能体 · 达人招募与财务对账一站协同',
    section2Cards: isPartner
      ? [
          {
            title: '多客户商家管理',
            desc: '绑定代运营客户，切换商家上下文处理商品、门店与招募订单。',
            img: asset(edition, 'card-brand.png'),
            tag: '客户商家',
          },
          {
            title: '服务商平台凭证',
            desc: '抖音来客、本地推等以服务商身份对接，与客户商家数据隔离可控。',
            img: asset(edition, 'card-product.png'),
            tag: '平台连接',
          },
          {
            title: '门店与商品代操',
            desc: '菜单价目、商品草稿、门店装修跨平台同步，减少重复录入。',
            img: asset(edition, 'card-store.png'),
            tag: '代运营',
          },
          {
            title: '招募与投流协同',
            desc: '达人招募五步、本地推投流与线索承接，统一在服务商工作台完成。',
            img: asset(edition, 'card-app.png'),
            tag: '增长工具',
          },
        ]
      : [
          {
            title: 'AI 智能体',
            desc: '对话式经营助手，结合门店数据给出选品、活动与内容建议。',
            img: asset(edition, 'card-brand.png'),
            tag: 'AI 决策',
          },
          {
            title: '多平台商品',
            desc: '抖音来客、美团、小红书商品与类目流程对齐 Web 工作台。',
            img: asset(edition, 'card-product.png'),
            tag: '商品中心',
          },
          {
            title: '门店与团购',
            desc: '店铺信息、菜单价目、装修与核销数据一屏管理。',
            img: asset(edition, 'card-store.png'),
            tag: '门店',
          },
          {
            title: '达人招募',
            desc: '发招募、反选达人、同步小程序大厅，与履约链路互通。',
            img: asset(edition, 'card-app.png'),
            tag: '达人营销',
          },
        ],
    section3Eyebrow: isPartner ? 'LingQi · Partner Growth' : 'LingQi · Merchant Growth',
    section3Subtitle: isPartner
      ? '三步走通客户接入、代运营交付与效果复盘。'
      : '三步走通开店配置、日常运营与效果复盘。',
    section3Steps: isPartner
      ? [
          {
            n: '01',
            sub: '快速接入客户',
            title: '绑定商家与服务凭证',
            desc: '创建服务商租户，绑定平台服务商身份并添加客户商家账号。',
            bullets: ['客户商家列表', '服务商凭证', '权限隔离'],
            accent: '#22d3ee',
            glow: 'rgba(34, 211, 238, 0.35)',
          },
          {
            n: '02',
            sub: '全面代运营工具',
            title: '商品 · 门店 · 招募 · 投流',
            desc: '在客户商家上下文中完成商品发布、达人招募与本地推投放。',
            bullets: ['跨平台商品', '达人招募', '投流线索'],
            accent: '#a78bfa',
            glow: 'rgba(167, 139, 250, 0.35)',
          },
          {
            n: '03',
            sub: '可交付的过程数据',
            title: '科学度量代运营效果',
            desc: '经营看板、评价与财务对账帮助服务商向客户交付透明结果。',
            bullets: ['经营报表', '评价管理', '财务对账'],
            accent: '#34d399',
            glow: 'rgba(52, 211, 153, 0.35)',
          },
        ]
      : [
          {
            n: '01',
            sub: '快速开店配置',
            title: '多平台门店一站接入',
            desc: '绑定抖音来客、美团、小红书等，完成门店与商品基础配置。',
            bullets: ['平台连接', '门店信息', '菜单价目'],
            accent: '#22d3ee',
            glow: 'rgba(34, 211, 238, 0.35)',
          },
          {
            n: '02',
            sub: '日常智能运营',
            title: 'AI · 招募 · 内容 · 投流',
            desc: '智能体辅助决策，达人招募、短视频与 GEO 优化协同推进。',
            bullets: ['AI 智能体', '达人招募', 'GEO 优化'],
            accent: '#818cf8',
            glow: 'rgba(129, 140, 248, 0.35)',
          },
          {
            n: '03',
            sub: '经营结果可见',
            title: '数据驱动复盘与对账',
            desc: '评价、活动、投流线索与财务对账形成闭环，支撑每一次经营决策。',
            bullets: ['评价管理', '投流线索', '财务对账'],
            accent: '#2dd4bf',
            glow: 'rgba(45, 212, 191, 0.35)',
          },
        ],
    section4Title: isPartner ? '灵祺服务商平台' : '灵祺商家平台',
    section4TitleAccent: '助推经营增长',
    section4Steps: [
      { n: '01', title: isPartner ? '注册服务商租户' : '注册商家租户', active: true },
      { n: '02', title: isPartner ? '绑定客户商家' : '连接平台门店', active: false },
      { n: '03', title: '持续运营与交付', active: false },
    ],
    section4PanelTitle: isPartner ? '可扩展的客户组合' : '多平台经营一体',
    section4PanelDesc: isPartner
      ? '覆盖餐饮、丽人、休闲娱乐等本地生活业态；代运营商品、招募与投流统一交付。'
      : '覆盖餐饮、零售、生活服务；门店、商品、达人与财务在同一工作台完成。',
    section4ShowcaseImg: asset(edition, 'section-showcase.png'),
    section4Tags: isPartner
      ? ['#多客户', '#服务商凭证', '#代运营', '#招募投流']
      : ['#AI 智能体', '#多平台', '#达人招募', '#财务对账'],
  }
}

export function getLandingConfig(edition?: LandingEditionKey): LandingConfig {
  return buildConfig(edition ?? getAppEdition())
}

export const EDITION_LABEL: Record<LandingEditionKey, string> = {
  merchant: '商家版',
  partner: '服务商版',
}

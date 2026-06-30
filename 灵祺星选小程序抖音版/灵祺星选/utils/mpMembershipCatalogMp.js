/** 与星选履约 Web / 运营台定价档位标签对齐（只读展示） */
const PLAN_LABEL = {
  basic: '基础版（免费）',
  pro: '专业版',
  flagship: '旗舰版',
  enterprise: '企业版',
}

const TIER_TAGLINE = {
  pr: {
    basic: '新手 PR / 试用发单',
    pro: '独立 PR / 小型 MCN',
    flagship: '全栈 PR / 内容机构',
    enterprise: '品牌方 / 代运营团队',
  },
  talent: {
    basic: '个人达人尝鲜',
    pro: '进阶接单达人',
    flagship: '全职获客 / 种草博主',
    enterprise: 'MCN 经纪 / 多达人',
  },
  shoot: {
    basic: '个人摄影师',
    pro: '小团队 / 兼职跟拍',
    flagship: '全职拍摄团队',
    enterprise: '多机位工作室',
  },
  edit: {
    basic: '个人剪辑',
    pro: '兼职剪辑 / 小工作室',
    flagship: '全职剪辑 / 云剪接单',
    enterprise: '后期工作室',
  },
}

const PAGE_META = {
  pr: { title: 'PR 版会员', subtitle: '发单、达人库与增值服务按档位解锁' },
  talent: { title: '达人版会员', subtitle: '接单、曝光与星选增值能力按档位解锁' },
  shoot: { title: '拍摄团队版会员', subtitle: '团队接单与协作能力按档位解锁' },
  edit: { title: '剪辑团队版会员', subtitle: '云剪接单与协作能力按档位解锁' },
}

function planLabel(planId) {
  const id = String(planId || 'basic').trim() || 'basic'
  return PLAN_LABEL[id] || id
}

function taglineFor(role, planId) {
  const r = TIER_TAGLINE[role] || TIER_TAGLINE.talent
  const id = String(planId || 'basic').trim() || 'basic'
  return r[id] || ''
}

function pageMeta(role) {
  return PAGE_META[role] || PAGE_META.talent
}

function hasDiscountPricing(plan) {
  const m =
    plan &&
    plan.listPriceMonthlyYuan != null &&
    plan.priceMonthlyYuan != null &&
    plan.listPriceMonthlyYuan > plan.priceMonthlyYuan
  const y =
    plan &&
    plan.listPriceYearlyYuan != null &&
    plan.priceYearlyYuan != null &&
    plan.listPriceYearlyYuan > plan.priceYearlyYuan
  return !!(m || y)
}

function isPromoActive(plan, nowMs) {
  if (!hasDiscountPricing(plan)) return false
  const raw = String((plan && plan.promoEndsAt) || '').trim()
  if (raw === 'always') return true
  if (!raw) return true
  const t = Date.parse(raw)
  return Number.isFinite(t) && t > (nowMs != null ? nowMs : Date.now())
}

function hasPromoCountdown(plan) {
  const raw = String((plan && plan.promoEndsAt) || '').trim()
  if (!raw || raw === 'always') return false
  const t = Date.parse(raw)
  return Number.isFinite(t) && t > Date.now()
}

function discountPct(listYuan, saleYuan) {
  if (listYuan == null || saleYuan == null || listYuan <= 0 || saleYuan <= 0 || saleYuan >= listYuan) {
    return null
  }
  return Math.round((saleYuan / listYuan) * 100)
}

function formatCountdown(promoEndsAt, nowMs) {
  const raw = String(promoEndsAt || '').trim()
  if (!raw || raw === 'always') return ''
  const end = Date.parse(raw)
  const now = nowMs != null ? nowMs : Date.now()
  if (!Number.isFinite(end) || end <= now) return ''
  let sec = Math.floor((end - now) / 1000)
  const d = Math.floor(sec / 86400)
  sec -= d * 86400
  const h = Math.floor(sec / 3600)
  sec -= h * 3600
  const m = Math.floor(sec / 60)
  sec -= m * 60
  const pad = (n) => String(n).padStart(2, '0')
  if (d > 0) return `${d}天 ${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

function effectivePayYuan(plan, billing, nowMs) {
  const sale = billing === 'yearly' ? plan && plan.priceYearlyYuan : plan && plan.priceMonthlyYuan
  const list = billing === 'yearly' ? plan && plan.listPriceYearlyYuan : plan && plan.listPriceMonthlyYuan
  if (sale == null || sale <= 0) return null
  if (isPromoActive(plan, nowMs)) return sale
  if (list != null && list > sale) return list
  if (list != null && list > 0) return list
  return sale
}

function resolveDisplayPrices(plan, billing, nowMs) {
  const monthly = plan && plan.priceMonthlyYuan
  const yearly = plan && plan.priceYearlyYuan
  const listM = plan && plan.listPriceMonthlyYuan
  const listY = plan && plan.listPriceYearlyYuan
  const promo = isPromoActive(plan, nowMs)
  const pick = (sale, list) => {
    if (sale == null || sale <= 0) return { sale: null, list: null, showDiscount: false }
    const eff = promo ? sale : list != null && list > sale ? list : sale
    const showList = promo && list != null && list > eff
    return { sale: eff, list: showList ? list : null, showDiscount: showList }
  }
  return {
    monthly: pick(monthly, listM),
    yearly: pick(yearly, listY),
    promoActive: promo,
    promoBadge: promo ? String((plan && plan.promoBadge) || '').trim() : '',
    promoCountdown: promo ? formatCountdown(plan && plan.promoEndsAt, nowMs) : '',
  }
}

function formatPrice(plan, billing, nowMs) {
  const monthly = plan && plan.priceMonthlyYuan
  const yearly = plan && plan.priceYearlyYuan
  if ((monthly == null || monthly === 0) && (yearly == null || yearly === 0)) {
    return { main: '免费', sub: '永久免费', isFree: true, listMain: '', discountLabel: '', promoCountdown: '' }
  }
  const disp = resolveDisplayPrices(plan, billing, nowMs)
  const useYearly = billing === 'yearly'
  const block = useYearly ? disp.yearly : disp.monthly
  const alt = useYearly ? disp.monthly : disp.yearly
  let main = '免费'
  let listMain = ''
  if (block.sale != null && block.sale > 0) {
    main = useYearly ? `¥${block.sale}/年` : `¥${block.sale}/月`
    if (block.list != null && block.list > block.sale) {
      listMain = useYearly ? `¥${block.list}/年` : `¥${block.list}/月`
    }
  } else if (alt.sale != null && alt.sale > 0) {
    main = useYearly ? `¥${alt.sale}/年` : `¥${alt.sale}/月`
  }
  let sub = ''
  if (!useYearly && disp.yearly.sale != null && disp.yearly.sale > 0 && monthly != null && monthly > 0) {
    sub = `年付 ¥${Number(disp.yearly.sale).toLocaleString('zh-CN')}`
  }
  const pct = discountPct(block.list, block.sale)
  const discountLabel =
    pct != null && block.showDiscount
      ? `${(pct / 10).toFixed(pct % 10 === 0 ? 0 : 1)}折`
      : disp.promoBadge || ''
  return {
    main,
    sub,
    listMain,
    isFree: false,
    discountLabel,
    promoCountdown: disp.promoCountdown,
    promoActive: disp.promoActive,
  }
}

module.exports = {
  planLabel,
  taglineFor,
  pageMeta,
  formatPrice,
  isPromoActive,
  hasPromoCountdown,
  formatCountdown,
  effectivePayYuan,
  discountPct,
}

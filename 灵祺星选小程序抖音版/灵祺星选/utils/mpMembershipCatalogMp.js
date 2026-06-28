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

function formatPrice(plan) {
  const monthly = plan && plan.priceMonthlyYuan
  const yearly = plan && plan.priceYearlyYuan
  if ((monthly == null || monthly === 0) && (yearly == null || yearly === 0)) {
    return { main: '免费', sub: '永久免费', isFree: true }
  }
  let main = '免费'
  if (monthly != null && monthly > 0) main = `¥${monthly}/月`
  else if (yearly != null && yearly > 0) main = `¥${yearly}/年`
  let sub = ''
  if (yearly != null && yearly > 0 && monthly != null && monthly > 0) {
    sub = `年付 ¥${Number(yearly).toLocaleString('zh-CN')}`
  }
  return { main, sub, isFree: false }
}

module.exports = {
  planLabel,
  taglineFor,
  pageMeta,
  formatPrice,
}

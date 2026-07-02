/** AUTO-GENERATED — 勿手改。运行: node scripts/sync-mp-membership-builtin-js.mjs */
function b(v) { return v }
function q(n) { return n }
function dash() { return '—' }

const MP_POINTS_VIDEO_PER_MIN = 120
const MP_POINTS_ARTICLE_PER_USE = 2
const MP_POINT_INTERNAL_COST_YUAN = 0.01
const MP_POINT_PROFIT_MARGIN = 0.5
const MP_BASIC_GIFT_POINTS = 100

function roundGiftPointsCalculated(raw) {
  const n = Math.max(0, Math.floor(Number(raw) || 0))
  if (n <= 0) return MP_BASIC_GIFT_POINTS
  if (n < 500) return n
  return Math.round(n / 1000) * 1000
}

function computeGiftPointsForMonthlyPrice(priceYuan) {
  const price = Number(priceYuan)
  if (!Number.isFinite(price) || price <= 0) return MP_BASIC_GIFT_POINTS
  const budget = price * MP_POINT_PROFIT_MARGIN
  return Math.max(MP_BASIC_GIFT_POINTS, Math.floor(budget / MP_POINT_INTERNAL_COST_YUAN))
}

function computeGiftPointsForMonthlyPriceRounded(priceYuan) {
  return roundGiftPointsCalculated(computeGiftPointsForMonthlyPrice(priceYuan))
}

const GIFT_MONTHLY_PRICE = {
  pr: { basic: 0, pro: 59.9, flagship: 159, enterprise: 399 },
  talent: { basic: 0, pro: 19.9, flagship: 59.9, enterprise: 399 },
  shoot: { basic: 0, pro: 69, flagship: 199, enterprise: 249 },
  edit: { basic: 0, pro: 79, flagship: 229, enterprise: 279 },
}

function buildRoleGiftPoints(role) {
  const tiers = ['basic', 'pro', 'flagship', 'enterprise']
  const out = {}
  for (const tier of tiers) {
    out[tier] = computeGiftPointsForMonthlyPriceRounded(GIFT_MONTHLY_PRICE[role][tier])
  }
  return out
}

const MP_DEFAULT_GIFT_POINTS = {
  pr: buildRoleGiftPoints('pr'),
  talent: buildRoleGiftPoints('talent'),
  shoot: buildRoleGiftPoints('shoot'),
  edit: buildRoleGiftPoints('edit'),
}

function videoMinutesFromGiftPoints(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  if (p <= 0) return 0
  return Math.max(1, Math.floor(p / MP_POINTS_VIDEO_PER_MIN))
}

function articleUsesFromGiftPoints(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return Math.max(0, Math.floor(p / MP_POINTS_ARTICLE_PER_USE))
}

function matrixAiQuotas(role, tier) {
  const pts = MP_DEFAULT_GIFT_POINTS[role][tier]
  if (tier === 'basic') return { video: 1, copy: 1 }
  return {
    video: videoMinutesFromGiftPoints(pts),
    copy: articleUsesFromGiftPoints(pts),
  }
}


const MATRIX = {
  pr: {
    basic: {
      hall_browse: b(true),
      pr_recruit_tools: dash(),
      active_orders: q(5),
      poster_tier_price: dash(),
      targeted_recruit: dash(),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: dash(),
      ai_compliance_video: q(matrixAiQuotas('pr', 'basic').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'basic').copy),
      publish_link_check: dash(),
      review_ai_batch: dash(),
      talent_library: dash(),
      addons: dash(),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(15),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(matrixAiQuotas('pr', 'pro').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'pro').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(30),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: b(true),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(matrixAiQuotas('pr', 'flagship').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'flagship').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(120),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(9999),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: b(true),
      erp_bridge: b(true),
      fulfillment_loop: b(true),
      ai_compliance_video: q(matrixAiQuotas('pr', 'enterprise').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'enterprise').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(600),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  talent: {
    basic: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(90),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'basic').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'basic').copy),
      publish_link_check: b(true),
      addons: dash(),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(300),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'pro').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'pro').copy),
      publish_link_check: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'flagship').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'flagship').copy),
      publish_link_check: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(30),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'enterprise').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'enterprise').copy),
      publish_link_check: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(130),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  shoot: {
    basic: {
      hall_orders: b(true),
      monthly_accept: q(5),
      portfolio_showcase: b(true),
      addons: dash(),
      ai_brief_gen: b(true),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  edit: {
    basic: {
      hall_orders: b(true),
      monthly_accept: q(5),
      portfolio_showcase: b(true),
      addons: dash(),
      ai_brief_gen: b(true),
      cloud_edit: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_gen: b(true),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
}

function mergePlanPermissions(role, planIdOrPlan, storedPermissions) {
  let planId = planIdOrPlan
  let stored = storedPermissions
  if (planIdOrPlan && typeof planIdOrPlan === 'object' && !Array.isArray(planIdOrPlan)) {
    planId = planIdOrPlan.id
    stored = planIdOrPlan.permissions
  }
  const tier = String(planId || 'basic').trim().toLowerCase()
  const normalized =
    tier === 'pro' || tier === 'professional'
      ? 'pro'
      : tier === 'flagship' || tier === 'ultimate'
        ? 'flagship'
        : tier === 'enterprise' || tier === 'corp'
          ? 'enterprise'
          : 'basic'
  const base = (MATRIX[role] && MATRIX[role][normalized]) || {}
  return { ...base, ...(stored || {}) }
}

module.exports = { MATRIX, mergePlanPermissions }

/** 内置四身份 × 四档位权限矩阵（与 web mpMembershipCatalog 对齐） */
function b(v) {
  return v
}
function q(n) {
  return n
}
function dash() {
  return '—'
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
      ai_compliance_video: q(1),
      ai_compliance_copy: q(1),
      publish_link_check: dash(),
      review_ai_batch: dash(),
      talent_library: dash(),
      addons: dash(),
      ai_brief_quota: dash(),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(10),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(50),
      ai_compliance_copy: q(50),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(20),
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
      ai_compliance_video: q(300),
      ai_compliance_copy: q(300),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(100),
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
      ai_compliance_video: q(300),
      ai_compliance_copy: q(300),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(500),
      ai_video_quota: q(600),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  talent: {
    basic: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(5),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(1),
      ai_selfcheck_copy: q(1),
      publish_link_check: b(true),
      addons: dash(),
      ai_copy_quota: dash(),
      ai_topic_quota: dash(),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(30),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(30),
      ai_selfcheck_copy: q(30),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(15),
      ai_topic_quota: q(10),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(150),
      ai_selfcheck_copy: q(150),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(60),
      ai_topic_quota: q(40),
      ai_video_quota: q(30),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(500),
      ai_selfcheck_copy: q(500),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(250),
      ai_topic_quota: q(150),
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
      ai_brief_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(10),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(40),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(150),
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
      ai_brief_quota: dash(),
      cloud_edit: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(10),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(40),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(150),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
}

function normalizeTier(planId) {
  const s = String(planId || 'basic').trim().toLowerCase()
  if (s === 'pro' || s === 'professional') return 'pro'
  if (s === 'flagship' || s === 'ultimate') return 'flagship'
  if (s === 'enterprise' || s === 'corp') return 'enterprise'
  return 'basic'
}

function mergePlanPermissions(role, plan) {
  const r = MATRIX[role] ? role : 'talent'
  const tier = normalizeTier(plan && plan.id)
  const builtin = { ...(MATRIX[r][tier] || {}) }
  const remote = (plan && plan.permissions) || {}
  return { ...builtin, ...remote }
}

module.exports = {
  MATRIX,
  normalizeTier,
  mergePlanPermissions,
}

/** 商家演示号：登录名 lingqi-demo。生成类接口只回预设板块，不调用上游、不记 Token、不扣积分。 */

import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import { verifyMpSessionToken } from './aiGateway/authMpSession.js'
import { DEMO_SHOWCASE_TTS_MP3_B64 } from './demoShowcaseTtsAudio.js'

export const DEMO_SHOWCASE_LOGIN = 'lingqi-demo'

/** 轻量上已开通的演示租户。积分扣减按此 id 直接跳过。 */
export const DEMO_SHOWCASE_TENANT_ID = 'd7e07e17-514a-4be5-9065-b9a687cf0b37'

export function isDemoShowcaseTenantId(tenantId: string | undefined | null): boolean {
  return String(tenantId || '').trim().toLowerCase() === DEMO_SHOWCASE_TENANT_ID
}

export const DEMO_SHOWCASE_VIDEO_URL =
  'https://mofangdianai.com/erp-mp-static/short-video-cases/case-hotpot.mp4?v=cdn14'

export const DEMO_SHOWCASE_IMAGE_URL =
  'https://mofangdianai.com/erp-mp-static/short-video-cases/case-hotpot.png?v=cdn14'

export function isDemoShowcaseEmail(email: string | undefined | null): boolean {
  const local = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[0]
  return local === DEMO_SHOWCASE_LOGIN
}

export async function isDemoShowcaseAuth(
  authHeader: string | undefined,
  env: Record<string, string>,
  mpSession?: string,
): Promise<boolean> {
  let email: string | undefined
  try {
    email = (await verifyBearerJwt(authHeader, env))?.email
  } catch {
    email = undefined
  }
  if (!email && mpSession) {
    try {
      email = (await verifyMpSessionToken(mpSession, env))?.email
    } catch {
      email = undefined
    }
  }
  return isDemoShowcaseEmail(email)
}

export const DEMO_SHOWCASE_CHAT = `这是演示账号的固定回复，不消耗积分，也不调用模型。

门店：灵祺演示商家
1. 主推双人火锅套餐，售价 128 元，原价 168 元。
2. 短视频用预设探店成片，15 秒内出示套餐和门店环境。
3. 发布时段建议午市 11:30 和晚市 17:30。`

export const DEMO_SHOWCASE_NARRATION =
  '欢迎来到灵祺演示门店。今天推荐招牌双人火锅套餐，锅底、鲜切牛肉和时蔬，现在下单只要一百二十八元。'

export function demoShowcaseChatBody(): Record<string, unknown> {
  return {
    ok: true,
    provider: 'demo',
    model: 'showcase',
    content: DEMO_SHOWCASE_CHAT,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    demoShowcase: true,
  }
}

export function demoShowcaseProductPlanBody(): Record<string, unknown> {
  const plan = {
    slotLabel: '双人套餐',
    productName: '灵祺演示 · 双人火锅套餐',
    suggestedPriceYuan: 128,
    originYuan: 168,
    description: '预设展示套餐：锅底、鲜切牛肉、时蔬拼盘、主食两份。仅供功能演示，不消耗 Token。',
    comboLines: ['锅底', '鲜切牛肉', '时蔬拼盘', '主食两份'],
    marginNote: '演示毛利说明：售价按预设档展示。',
    competitorNote: '对标同商圈双人餐。',
    riskLevel: 'low',
  }
  return { ok: true, demoShowcase: true, pointsCharged: 0, plan, plans: [plan] }
}

function demoFlow(title: string, body: string): {
  title: string
  body: string
  actions: { label: string; detail: string }[]
}[] {
  return [
    {
      title,
      body,
      actions: [
        { label: '拍探店', detail: '使用预设火锅探店成片，不重新生成视频。' },
        { label: '挂团购', detail: '双人套餐售价 128 元，原价 168 元。' },
        { label: '定时发', detail: '午市 11:30 和晚市 17:30 各发一条。' },
      ],
    },
  ]
}

export function demoShowcaseOpsPlanBody(): Record<string, unknown> {
  const flow = demoFlow('预设展示', '演示账号的固定运营方案，不调用模型，不扣积分。')
  const plan = {
    planEdition: 'simple',
    simplePlan: {
      hero: {
        headline: '灵祺演示门店 · 双人火锅周',
        summary: '用预设成片和固定套餐做功能展示，不消耗 Token。',
        storeHint: '灵祺演示商家',
        periodHint: '本周',
        budgetHint: '演示预算 ¥3,000',
      },
      steps: [
        {
          title: '挂上套餐',
          body: '上架双人火锅套餐，售价 128 元。',
          tip: '标题和主图用预设素材。',
          detailFlow: flow,
          detailNote: '预设板块',
        },
      ],
      platforms: [
        {
          platform: '抖音',
          how: '发布预设探店成片，并挂上团购。',
          detailFlow: flow,
          detailNote: '预设板块',
        },
      ],
      combos: [
        {
          name: '双人火锅套餐',
          sellingPoint: '锅底、牛肉、时蔬一次配齐',
          priceHint: '128 元',
          items: '锅底、鲜切牛肉、时蔬拼盘、主食两份',
          detailFlow: flow,
          detailNote: '预设板块',
        },
      ],
      checklist: [
        { text: '确认预设成片可以播放', detailFlow: flow, detailNote: '预设板块' },
        { text: '确认套餐价格显示为 128 元', detailFlow: flow, detailNote: '预设板块' },
      ],
    },
    opsPlan: {
      background: '演示门店，用于展示运营方案页面。',
      backgroundDetail: '全部为预设文案，不消耗 Token。',
      positioning: '朋友小聚的双人火锅。',
      activities: '本周主推双人套餐。',
      activitiesDetail: '午市和晚市各发一条预设探店视频。',
      targetAudience: '附近上班族和朋友聚餐。',
      audienceDetail: '两人同行。',
      goals: ['展示团购上架', '展示短视频成片'],
      goalsDetail: [],
      contentPillars: ['探店', '套餐'],
      monthlyThemes: ['双人火锅'],
      platformStrategy: [],
      risks: ['演示数据不会写入真实投放'],
    },
    executionPlan: {
      overview: '按预设三步完成展示。',
      phases: [],
      weeklyActions: [],
      hourlySchedule: [],
    },
    marketingBudget: {
      totalBudget: 3000,
      channels: [],
      assumptions: '演示预算，不会实际扣费。',
      contingencyPct: 0,
      roiSummary: '预设展示，不计算真实投放回报。',
      roiAnalysis: [],
    },
    calendar: { milestones: [] },
    talentBudget: { talentRows: [], budgetLines: [] },
    productBoard: { combos: [] },
  }
  return {
    ok: true,
    demoShowcase: true,
    pointsCharged: 0,
    plan,
    meta: {
      platforms: ['抖音'],
      budgetYuan: 3000,
      periodStart: '',
      periodEnd: '',
      storeName: '灵祺演示商家',
      city: '',
      planEdition: 'simple',
    },
  }
}

export function demoShowcaseTtsBody(): Record<string, unknown> {
  return {
    ok: true,
    audioBase64: DEMO_SHOWCASE_TTS_MP3_B64,
    mimeType: 'audio/mpeg',
    provider: 'qwen',
    voiceId: 'showcase',
    model: 'showcase',
    demoShowcase: true,
  }
}

export function demoShowcaseDouyinLinkBody(): Record<string, unknown> {
  return {
    ok: true,
    demoShowcase: true,
    normalizedUrl: 'https://www.douyin.com/video/demo-showcase',
    videoId: 'demo-showcase',
    sourceTitle: '灵祺演示探店',
    script: DEMO_SHOWCASE_NARRATION,
    motionInstructions: '面向镜头微笑，双手示意套餐，再指向门店环境。',
    scriptSource: 'page',
  }
}

export function demoShowcaseGoodsAssistPayload(
  action: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ok: true, demoShowcase: true, pointsCharged: 0, ai_vendor_used: 'demo' }
  const title = '灵祺演示 · 双人火锅套餐'
  const desc = '预设展示：锅底、鲜切牛肉、时蔬拼盘与主食。到店可用，不消耗 Token。'
  if (action === 'image_generate' || action === 'image_enhance') {
    return {
      ...base,
      image_urls: [DEMO_SHOWCASE_IMAGE_URL],
      image_meta: { resolved_model: 'showcase' },
    }
  }
  if (action === 'optimize_title') return { ...base, title }
  if (action === 'analyze_product_quality') {
    const products = Array.isArray(body.products) ? body.products : []
    const first =
      products[0] && typeof products[0] === 'object'
        ? (products[0] as Record<string, unknown>)
        : {}
    const productId = String(first.id ?? first.productId ?? 'demo-product').trim() || 'demo-product'
    const productName = String(first.name ?? first.productName ?? first.title ?? '双人火锅套餐')
    const dim = { score: 86, comment: '演示预设评分，未调用模型。' }
    return {
      ...base,
      quality_items: [
        {
          productId,
          productName,
          overall: 86,
          titleHeat: dim,
          mainImage: dim,
          detailPage: dim,
          priceAnalysis: dim,
          suggestions: ['保持预设套餐标题与主图一致'],
        },
      ],
    }
  }
  if (action === 'geo_ai_score') {
    return {
      ...base,
      geo_ai_score: {
        infoCompletenessPercent: 86,
        questionCoveragePercent: 80,
        contentFreshnessPercent: 78,
        rationale_zh: '演示账号预设评分，未调用模型。',
        todos: [{ title: '补充门店招牌菜介绍', type: '门店', priority: 'medium' }],
        covered_queries: [{ q: '附近双人火锅', covered: true }],
      },
    }
  }
  const description =
    action === 'geo_ai_consult_question'
      ? '附近有什么适合两个人的火锅套餐？'
      : action === 'operation_article'
        ? '灵祺演示门店本周主推双人火锅套餐，锅底、鲜切牛肉和时蔬一次配齐。午市和晚市到店即可用。以上为预设文案，不消耗 Token。'
        : desc
  return { ...base, description, title }
}

export const DEMO_SHOWCASE_SHOP_REPORT = `一、本周结论
演示门店以双人火锅套餐做功能展示，售价 128 元。
二、建议动作
发布预设探店成片，并在午市、晚市各挂一条团购。
三、说明
本报告为固定预设，不调用模型，不消耗 Token。`

const VIDEO_TASK = 'demo-showcase-video'
const ICE_JOB = 'demo-showcase-ice'

/** 命中则返回预设结果；未命中返回 null，走真实生成。 */
export function demoShowcaseVideoPayload(
  method: string,
  pathname: string,
): Record<string, unknown> | null {
  const m = method.toUpperCase()
  const path = pathname
  if (m === 'POST' && /\/(seedance|kling|dh-s2v)\/start$/.test(path)) {
    return {
      ok: true,
      taskId: VIDEO_TASK,
      provider: 'demo',
      modelUsed: 'showcase',
      pipeline: 'showcase',
      pollKind: 'text2video',
      demoShowcase: true,
    }
  }
  if (m === 'GET' && /\/(seedance|kling|dh-s2v)\/status$/.test(path)) {
    return {
      ok: true,
      phase: 'succeeded',
      statusLabel: '演示成片',
      videoUrl: DEMO_SHOWCASE_VIDEO_URL,
      provider: 'demo',
      demoShowcase: true,
    }
  }
  if (m === 'POST' && path.endsWith('/ice/pipeline')) {
    return { ok: true, jobId: ICE_JOB, exportId: ICE_JOB, demoShowcase: true }
  }
  if (m === 'POST' && path.endsWith('/ice/smart-batch')) {
    return {
      ok: true,
      batchJobId: ICE_JOB,
      jobId: ICE_JOB,
      exportId: ICE_JOB,
      demoShowcase: true,
    }
  }
  if (
    m === 'GET' &&
    (path.endsWith('/ice/job') ||
      path.endsWith('/ice/smart-batch/job') ||
      path.endsWith('/ice/smart-batch-job'))
  ) {
    return {
      ok: true,
      status: 'Success',
      done: true,
      failed: false,
      outputPending: false,
      downloadUrl: DEMO_SHOWCASE_VIDEO_URL,
      previewUrl: DEMO_SHOWCASE_VIDEO_URL,
      videoUrl: DEMO_SHOWCASE_VIDEO_URL,
      demoShowcase: true,
    }
  }
  if (m === 'POST' && path.includes('/longform/plan')) {
    return {
      ok: true,
      demoShowcase: true,
      prompts: ['【画面】演示门店火锅探店，热气与双人套餐特写，镜头平稳推进。'],
      narrationScript: DEMO_SHOWCASE_NARRATION,
      scriptSegments: [
        { timeRange: '0-5s', visual: '门头与热气锅底特写', dialogue: '欢迎来到灵祺演示门店。' },
        { timeRange: '5-10s', visual: '双人套餐摆盘', dialogue: '招牌双人火锅，一百二十八元。' },
        { timeRange: '10-15s', visual: '店员邀请入座', dialogue: '现在下单，到店就能吃。' },
      ],
      validationOk: true,
      validationIssues: [],
      rowsFullyFilled: true,
      usedAiPlanner: false,
      planStage: 'showcase',
    }
  }
  if (m === 'POST' && path.includes('/narration/extract')) {
    return { ok: true, narrationScript: DEMO_SHOWCASE_NARRATION, demoShowcase: true }
  }
  if (m === 'POST' && path.endsWith('/openshot/pipeline')) {
    return { ok: true, jobId: ICE_JOB, exportId: ICE_JOB, demoShowcase: true }
  }
  if (m === 'GET' && path.endsWith('/openshot/export')) {
    return {
      ok: true,
      status: 'Success',
      done: true,
      failed: false,
      outputPending: false,
      downloadUrl: DEMO_SHOWCASE_VIDEO_URL,
      previewUrl: DEMO_SHOWCASE_VIDEO_URL,
      videoUrl: DEMO_SHOWCASE_VIDEO_URL,
      demoShowcase: true,
    }
  }
  return null
}

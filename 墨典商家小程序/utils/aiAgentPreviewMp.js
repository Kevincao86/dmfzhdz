const exec = require('./aiAgentExecutionMp.js')
const intelSnap = require('./merchantIntelSnapshotMp.js')
const storeIntelApi = require('./storeIntelApiMp.js')
const briefAi = require('./recruitmentBriefAiMp.js')

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function buildPreviewShell(taskType, title) {
  return {
    taskType,
    title: title || exec.TASK_LABELS[taskType] || taskType,
    steps: [],
    requiredPermissions: [],
    riskLevel: 'low',
    confirmRequired: true,
  }
}

function createProductPreviewMessage(userBrief, assistantContent) {
  const intelLine = intelSnap.statusLine()
  const labels = exec.parsePlanIntentLabels(assistantContent)
  const types = exec.inferTaskTypesFromCombinedContext(userBrief, assistantContent, undefined)
  const combined = types.includes('create_product') && types.includes('recruit_influencer')
  const intro =
    labels.length > 1
      ? `【创建商品 · 独立预览】检测到 ${labels.length} 个方案。${intelLine}。请在本卡片确认。${combined ? '全部确认后将进入达人招募 Brief。' : ''}`
      : `【创建商品 · 独立预览】将生成团购方案供核对。${intelLine}。请在本卡片确认。${combined ? '确认后将进入达人招募 Brief。' : ''}`
  const productPlans = (labels.length ? labels : ['团购方案']).map((label, i) => ({
    slotKey: `plan-${i}`,
    slotLabel: label,
    productName: label,
    suggestedPriceYuan: 0,
    description: '正在生成方案…',
    comboLines: [],
    enrichStatus: 'loading',
  }))
  return {
    id: newId('preview-product'),
    role: 'task_preview',
    content: intro,
    previewStatus: 'pending',
    preview: Object.assign(buildPreviewShell('create_product', '创建商品'), {
      productPlans,
      productPlan: productPlans[0],
    }),
    _userBrief: userBrief,
    _assistantContent: assistantContent,
  }
}

function createRecruitPreviewMessage(userBrief, assistantContent) {
  const intelLine = intelSnap.statusLine()
  const snap = intelSnap.loadSnapshot()
  const intro = `【达人招募 · 独立预览】${intelLine}。将生成探店 Brief，请在本卡片确认。`
  const mainName =
    (snap.menuSummary && snap.menuSummary.split('\n')[0]) ||
    snap.industryPath ||
    '主推商品'
  return {
    id: newId('preview-recruit'),
    role: 'task_preview',
    content: intro,
    previewStatus: 'pending',
    preview: Object.assign(buildPreviewShell('recruit_influencer', '招募达人'), {
      recruitmentBrief: {
        platform: '抖音来客',
        mainProductName: String(mainName).slice(0, 48),
        tags: intelSnap.isDigitalIndustry()
          ? ['数码潮品', '探店打卡', '性价比', '开学季']
          : ['探店打卡', '性价比', '本地生活'],
        briefText: '',
        previews: ['', '', ''],
        enrichStatus: 'loading',
      },
    }),
    _userBrief: userBrief,
    _assistantContent: assistantContent,
  }
}

async function enrichProductPreviewMessage(msg) {
  const labels = (msg.preview.productPlans || []).map((p) => p.slotLabel).filter(Boolean)
  const combinedBrief = exec.buildCombinedBrief({
    userBrief: msg._userBrief,
    assistantContent: msg._assistantContent,
  })
  const planCtx = intelSnap.merchantIntelForProductPlanApi(combinedBrief)

  let plans = []
  if (labels.length > 1) {
    const batch = await storeIntelApi.fetchAiProductPlansBatch(
      Object.assign({}, planCtx, { intentLabels: labels }),
    )
    if (batch.ok) {
      plans = batch.plans.map((p, i) =>
        Object.assign({}, p, {
          slotKey: `plan-${i}`,
          slotLabel: p.slotLabel || labels[i] || p.productName,
          enrichStatus: 'ready',
        }),
      )
    } else {
      return Object.assign({}, msg, {
        content: `${msg.content}\n\n方案生成失败：${batch.message}`,
        preview: Object.assign({}, msg.preview, {
          productPlans: msg.preview.productPlans.map((p) =>
            Object.assign({}, p, { enrichStatus: 'error', enrichError: batch.message }),
          ),
        }),
      })
    }
  } else {
    const r = await storeIntelApi.fetchAiProductPlan(planCtx)
    if (!r.ok) {
      return Object.assign({}, msg, {
        content: `${msg.content}\n\n方案生成失败：${r.message}`,
        preview: Object.assign({}, msg.preview, {
          productPlans: msg.preview.productPlans.map((p) =>
            Object.assign({}, p, { enrichStatus: 'error', enrichError: r.message }),
          ),
        }),
      })
    }
    plans = [
      Object.assign({}, r.plan, {
        slotKey: 'plan-0',
        slotLabel: labels[0] || r.plan.productName,
        enrichStatus: 'ready',
      }),
    ]
  }

  return Object.assign({}, msg, {
    content: `${msg.content}\n\n已生成 ${plans.length} 项团购方案，请核对后点击「确认执行」。`,
    preview: Object.assign({}, msg.preview, { productPlans: plans, productPlan: plans[0] }),
  })
}

function localRecruitBriefFallback(msg) {
  const snap = intelSnap.loadSnapshot()
  const hint = [msg._userBrief, msg._assistantContent].filter(Boolean).join('\n').slice(0, 2000)
  const main = msg.preview.recruitmentBrief.mainProductName
  const tags = msg.preview.recruitmentBrief.tags || []
  const store = snap.storeName ? `【${snap.storeName}】` : ''
  const industry = snap.industryPath || '本地生活'
  const base = `${store}${main}｜${industry}`
  const previews = [
    `${base}\n\n版本 A：突出 ${main} 核心卖点与到店体验，适合测评口播。`,
    `${base}\n\n版本 B：场景叙事，结合 ${tags.slice(0, 3).join('、')} 话题。`,
    `${base}\n\n版本 C：清单体「3 个理由必打卡」，结合 ${hint.slice(0, 120)}…`,
  ]
  return { previews, enrichError: '' }
}

async function enrichRecruitPreviewMessage(msg) {
  const snap = intelSnap.loadSnapshot()
  const brief = msg.preview.recruitmentBrief
  const mainName = brief.mainProductName
  const tags = brief.tags || []
  let previews = []
  let enrichError = ''
  try {
    previews = await briefAi.generateThreeKolBriefsMp({
      platformLabel: brief.platform || '抖音来客',
      industry: snap.industryPath || '本地生活',
      storeName: snap.storeName || '',
      main: { name: mainName, priceYuan: 0 },
      tags,
    })
  } catch (e) {
    const fb = localRecruitBriefFallback(msg)
    previews = fb.previews
    enrichError = e instanceof Error ? e.message : String(e)
  }
  const note = enrichError
    ? `\n\n（AI Brief 未完全生成，已展示离线模板：${enrichError.slice(0, 80)}）`
    : ''
  return Object.assign({}, msg, {
    content: `${msg.content}\n\n已生成三版达人 Brief，请核对后点击「确认执行」。${note}`,
    preview: Object.assign({}, msg.preview, {
      recruitmentBrief: Object.assign({}, brief, {
        briefText: previews[0] || '',
        previews,
        enrichStatus: 'ready',
        enrichError: enrichError || undefined,
      }),
    }),
  })
}

async function spawnPreviewsForTaskTypes(plan, taskTypes) {
  const types = (taskTypes || []).filter((t) => plan.taskTypes.includes(t))
  const out = []
  if (types.includes('create_product')) {
    const m = createProductPreviewMessage(plan.userBrief, plan.assistantContent)
    out.push(await enrichProductPreviewMessage(m))
  }
  if (types.includes('recruit_influencer')) {
    const m = createRecruitPreviewMessage(plan.userBrief, plan.assistantContent)
    out.push(await enrichRecruitPreviewMessage(m))
  }
  return out
}

async function spawnParallelPreviews(plan, taskTypes) {
  const batch = taskTypes && taskTypes.length ? taskTypes : plan.taskTypes
  return spawnPreviewsForTaskTypes(plan, batch)
}

async function spawnRecruitPreviewAfterProductConfirm(plan) {
  if (!plan || !plan.taskTypes.includes('recruit_influencer')) return []
  const m = createRecruitPreviewMessage(plan.userBrief, plan.assistantContent)
  return [await enrichRecruitPreviewMessage(m)]
}

module.exports = {
  createProductPreviewMessage,
  createRecruitPreviewMessage,
  enrichProductPreviewMessage,
  enrichRecruitPreviewMessage,
  spawnParallelPreviews,
  spawnPreviewsForTaskTypes,
  spawnRecruitPreviewAfterProductConfirm,
}

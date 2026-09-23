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
  const planLabels = labels.length > 0 ? labels : ['团购方案']
  const intro =
    planLabels.length > 1
      ? `【创建商品 · 独立预览】检测到 ${planLabels.length} 个组品方案（${planLabels.slice(0, 4).join('、')}${planLabels.length > 4 ? '…' : ''}）。${intelLine}。请在本卡片确认。${combined ? '全部确认后将进入达人招募 Brief。' : ''}`
      : `【创建商品 · 独立预览】将生成团购方案供核对。${intelLine}。请在本卡片确认。${combined ? '确认后将进入达人招募 Brief。' : ''}`
  const productPlans = planLabels.map((label, i) => ({
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
    previewPlatforms: [
      { id: 'douyin', label: '抖音来客', checked: true },
      { id: 'meituan', label: '美团团购', checked: true },
      { id: 'xiaohongshu', label: '小红书', checked: true },
    ],
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
  const intro = `【达人招募 · 独立预览】${intelLine}。按网页同样四步确认后再发布。`
  const mainName = String(
    (snap.menuSummary && snap.menuSummary.split('\n')[0]) || snap.industryPath || '主推商品',
  ).slice(0, 48)
  const contentForm = /图文|笔记/.test(`${userBrief}\n${assistantContent}`)
    ? 'note'
    : /口播|不到店/.test(`${userBrief}\n${assistantContent}`)
      ? 'talk'
      : 'instore'
  return {
    id: newId('preview-recruit'),
    role: 'task_preview',
    content: `${intro}\n\n第 1/4 步 · 发什么、发给谁。核对主推品、平台和城市后再看预算。`,
    previewStatus: 'pending',
    preview: Object.assign(buildPreviewShell('recruit_influencer', '招募达人'), {
      recruitmentBrief: {
        platform: '抖音来客',
        mainProductName: mainName,
        tags: intelSnap.isDigitalIndustry()
          ? ['数码潮品', '探店打卡', '性价比']
          : ['探店打卡', '性价比', '本地生活'],
        briefText: '',
        previews: [],
        enrichStatus: 'ready',
        wizardStep: 1,
        wizardScope: {
          platform: '抖音',
          platforms: ['抖音'],
          platformDouyin: true,
          platformXhs: false,
          city: '',
          storeName: snap.storeName || '',
          mainProductName: mainName,
          contentForm,
        },
        wizardBudget: { budgetYuan: 5000, headcount: 5, commissionPct: 5 },
        wizardBudgetStatus: 'idle',
        wizardShootStatus: 'idle',
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

  const readyPlans = plans.map((p) =>
    Object.assign({}, p, {
      comboText: (p.comboLines || []).filter(Boolean).join(' · '),
    }),
  )
  const next = Object.assign({}, msg, {
    content: `${msg.content}\n\n已生成 ${readyPlans.length} 项团购方案。请核对下方必填项后提交至平台。`,
    preview: Object.assign({}, msg.preview, { productPlans: readyPlans, productPlan: readyPlans[0] }),
  })
  const upload = require('./aiAgentProductUploadMp.js')
  return upload.attachSheets(next)
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
  const brief = msg.preview && msg.preview.recruitmentBrief
  if (brief && brief.wizardStep) return msg
  return Object.assign({}, msg, {
    content: `${msg.content}\n\n第 1/4 步 · 发什么、发给谁。核对主推品、平台和城市后再看预算。`,
  })
}

function patchRecruit(msg, briefPatch, content) {
  const prev = (msg.preview && msg.preview.recruitmentBrief) || {}
  const brief = Object.assign({}, prev, briefPatch)
  return Object.assign({}, msg, {
    content: content || msg.content,
    preview: Object.assign({}, msg.preview, { recruitmentBrief: brief }),
  })
}

function contentFormLabel(id) {
  if (id === 'talk') return '不到店口播'
  if (id === 'note') return '图文笔记'
  return '到店探店'
}

function buildShootText(msg) {
  const brief = msg.preview.recruitmentBrief
  const scope = brief.wizardScope || {}
  const budget = brief.wizardBudget || {}
  const fb = localRecruitBriefFallback(msg)
  const form = contentFormLabel(scope.contentForm)
  const head = `平台 ${brief.platform || '抖音来客'} · ${scope.city || '城市待填'} · ${scope.mainProductName || brief.mainProductName}\n形式：${form}\n预算 ¥${budget.budgetYuan || 0} · ${budget.headcount || 0} 人 · 佣金 ${budget.commissionPct || 0}%`
  return `${head}\n\n${fb.previews[0]}`
}

async function advanceRecruitWizard(msg) {
  const brief = msg.preview && msg.preview.recruitmentBrief
  if (!brief) return { ok: false, message: '招募卡片无效' }
  const step = brief.wizardStep || 1
  const scope = brief.wizardScope || {}
  if (step === 1) {
    if (!String(scope.mainProductName || '').trim()) return { ok: false, message: '请填写主推套餐' }
    if (!String(scope.city || '').trim()) return { ok: false, message: '请填写招募城市' }
    const platform = (scope.platforms || ['抖音']).map((p) => (p === '抖音' ? '抖音来客' : p)).join('、')
    return {
      ok: true,
      msg: patchRecruit(
        msg,
        { wizardStep: 2, platform, mainProductName: scope.mainProductName },
        '第 2/4 步 · 花多少、招几人。按预算拆人数和佣金，达人按此价报名。',
      ),
    }
  }
  if (step === 2) {
    const budget = brief.wizardBudget || {}
    const yuan = Number(budget.budgetYuan)
    const heads = Number(budget.headcount)
    if (!Number.isFinite(yuan) || yuan < 500) return { ok: false, message: '总预算至少 500 元' }
    if (!Number.isFinite(heads) || heads < 1) return { ok: false, message: '请填写计划人数' }
    let briefText = ''
    try {
      const snap = intelSnap.loadSnapshot()
      const previews = await briefAi.generateThreeKolBriefsMp({
        platformLabel: brief.platform || '抖音来客',
        industry: snap.industryPath || '本地生活',
        storeName: scope.storeName || snap.storeName || '',
        main: { name: scope.mainProductName || brief.mainProductName, priceYuan: 0 },
        tags: brief.tags || [],
      })
      briefText = (previews && previews[0]) || ''
    } catch (_) {
      briefText = ''
    }
    if (!briefText) briefText = buildShootText(msg)
    return {
      ok: true,
      msg: patchRecruit(
        msg,
        { wizardStep: 3, briefText, previews: [briefText], wizardShootStatus: 'ready', enrichStatus: 'ready' },
        '第 3/4 步 · 怎么拍、何时交。核对拍摄要点后进入确认。',
      ),
    }
  }
  if (step === 3) {
    return {
      ok: true,
      msg: patchRecruit(
        msg,
        { wizardStep: 4 },
        '第 4/4 步 · 确认发布。确认后写入招募订单，不会直接私信达人。',
      ),
    }
  }
  return { ok: false, message: '已是最后一步' }
}

function ensureRecruitWizard(msg) {
  if (!msg || msg.role !== 'task_preview' || !msg.preview || msg.preview.taskType !== 'recruit_influencer') return msg
  const brief = msg.preview.recruitmentBrief
  if (!brief || brief.wizardStep) return msg
  const seeded = createRecruitPreviewMessage(msg._userBrief || '', msg._assistantContent || '')
  return Object.assign({}, msg, {
    content: seeded.content,
    preview: Object.assign({}, msg.preview, {
      recruitmentBrief: Object.assign({}, seeded.preview.recruitmentBrief, {
        mainProductName: brief.mainProductName || seeded.preview.recruitmentBrief.mainProductName,
        platform: brief.platform || seeded.preview.recruitmentBrief.platform,
        tags: brief.tags || seeded.preview.recruitmentBrief.tags,
      }),
    }),
  })
}

function backRecruitWizard(msg) {
  const brief = msg.preview && msg.preview.recruitmentBrief
  const step = (brief && brief.wizardStep) || 1
  if (step <= 1) return msg
  const prev = step - 1
  const titles = {
    1: '第 1/4 步 · 发什么、发给谁。',
    2: '第 2/4 步 · 花多少、招几人。',
    3: '第 3/4 步 · 怎么拍、何时交。',
  }
  return patchRecruit(msg, { wizardStep: prev }, titles[prev] || msg.content)
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
  advanceRecruitWizard,
  backRecruitWizard,
  ensureRecruitWizard,
  spawnParallelPreviews,
  spawnPreviewsForTaskTypes,
  spawnRecruitPreviewAfterProductConfirm,
}

/**
 * AI 运营方案：菜单/毛利/预算/多平台 → 六块结构化 JSON
 */
import {
  ensureMarketingRoiFallback,
  isAiOpsPlanResultUsable,
  normalizeAiOpsPlanResult,
  type AiOpsPlanResult,
} from '../src/lib/aiOpsPlanTypes.js'
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import {
  merchantChatTextWithVendorFailover,
  OPS_PLAN_AI_VENDOR_ORDER,
  withUpstreamChatTimeoutMs,
} from './merchantAiUpstream.js'
import { runAiProductPlanCore } from './merchantStoreIntelCore.js'

async function mergeStoreIntelAiEnv(env: Record<string, string>): Promise<Record<string, string>> {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('./merchantRegistryVendorEnv.js')
  return mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), env)
}

function extractJsonObject(text: string): Record<string, unknown> {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? t
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON')
  const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).length === 0) {
    throw new Error('模型返回空 JSON 对象')
  }
  return obj
}

/** 六块方案生成慢，单厂商最长约 120s；解析失败则换下一厂商（勿把空 {} 当成功） */
async function llmJson(
  env: Record<string, string>,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  return withUpstreamChatTimeoutMs(120_000, async () => {
    const errors: string[] = []
    for (const vendor of OPS_PLAN_AI_VENDOR_ORDER) {
      const out = await merchantChatTextWithVendorFailover(env, system, user, [vendor])
      if (!out.ok) {
        if (out.errors?.length) errors.push(...out.errors)
        else if (out.message) errors.push(out.message)
        continue
      }
      try {
        return extractJsonObject(out.text)
      } catch (e) {
        const parseMsg = e instanceof Error ? e.message : String(e)
        errors.push(`${vendor}: ${parseMsg}`)
      }
    }
    throw new Error(
      errors.length
        ? `全部模型不可用：${errors.slice(0, 6).join('；')}`
        : '运营方案模型调用失败',
    )
  })
}

const SYSTEM_PROMPT = `你是资深本地生活/餐饮多平台运营总监，输出可直接落地执行的完整运营方案（对齐「运营方案 / 具体执行方案 / 营销预算 / 项目进度日历 / 达人明细及预算 / 组品货盘」六块）。
只输出一个 JSON 对象（不要 Markdown），结构必须为：
{
  "opsPlan": {
    "background": "门店与商圈背景 2～4 句",
    "positioning": "一句话定位",
    "targetAudience": "核心人群画像",
    "goals": ["可量化目标1","目标2","目标3"],
    "contentPillars": ["内容支柱1","内容支柱2"],
    "monthlyThemes": ["月主题1","主题2"],
    "platformStrategy": [{
      "platform":"抖音",
      "approach":"打法（≥40字）",
      "contentTypes":"内容形态",
      "publishFreq":"发布频次",
      "kpi":"KPI",
      "examples":"选题示例"
    }],
    "risks": ["风险与对策"]
  },
  "executionPlan": {
    "overview": "执行总览",
    "phases": [{"phase":"阶段","dateRange":"YYYY-MM-DD～YYYY-MM-DD","actions":"动作","ownerRole":"角色","deliverable":"产出","successMetric":"指标","detailItems":[{"day":"YYYY-MM-DD","task":"当日任务","ownerRole":"角色","deliverable":"产出"}]}],
    "weeklyActions": [{"week":"第1周","dateRange":"YYYY-MM-DD～YYYY-MM-DD","focus":"重点","tasks":"任务","ownerRole":"角色"}],
    "hourlySchedule": [{
      "scene":"live",
      "date":"YYYY-MM-DD",
      "timeStart":"19:00",
      "timeEnd":"21:00",
      "task":"直播场控/开播/投流盯盘等",
      "ownerRole":"角色",
      "location":"门店直播间",
      "deliverable":"产出",
      "notes":"备注"
    }]
  },
  "marketingBudget": {
    "totalBudget": 数字,
    "contingencyPct": 5,
    "channels": [{"channel":"短视频达人","month":"YYYY-MM","amountYuan":数字,"ratioPct":数字,"note":"说明"}],
    "roiSummary":"整体投产比与回本节奏总述",
    "roiAnalysis": [{
      "channel":"抖音短视频",
      "investYuan":数字,
      "expectedGmvYuan":数字,
      "expectedOrders":数字,
      "roi":数字,
      "paybackDays":数字,
      "note":"假设说明"
    }],
    "assumptions":"预算假设"
  },
  "calendar": {
    "milestones": [{"date":"YYYY-MM-DD","time":"","item":"事项","dependency":"依赖","ownerRole":"角色","statusHint":"建议"}]
  },
  "talentBudget": {
    "budgetLines": [{
      "category":"短视频达人|短视频本地推|直播达人|直播投流|其它",
      "platform":"抖音",
      "tier":"头部|腰部|尾部|KOC",
      "headcount":数字,
      "unitBudgetYuan":数字,
      "trafficBudgetYuan":数字,
      "subtotalYuan":数字,
      "note":"说明"
    }],
    "talentRows": [{
      "platform":"抖音",
      "tier":"腰部",
      "talentType":"探店/直播",
      "headcount":2,
      "unitBudgetYuan":数字,
      "subtotalYuan":数字,
      "contentForm":"短视频/直播",
      "publishWindow":"周末晚间（仅直播写具体时段）",
      "note":""
    }]
  },
  "productBoard": {
    "combos": [{"name":"套餐","items":"组合","priceYuan":数字,"originYuan":数字,"marginHint":"毛利","platforms":"抖音","sellingPoint":"卖点","stockHint":"库存"}]
  }
}

硬性要求：
1. 只基于用户提供的菜单价目/已上架套餐/毛利/类目/竞品/预算/平台；无菜单时用「已上架套餐」清单组品，勿编造菜名。
2. marketingBudget.channels 合计≈totalBudget（误差≤5%）；须含 roiSummary + roiAnalysis（≥3 行，含投入/预计GMV/订单/ROI/回本天数）。
3. talentBudget.budgetLines 必须细致：至少覆盖「短视频达人（按头部/腰部/尾部分行写人数与单价）」「短视频本地推预算」「直播达人预算」「直播投流预算」；subtotalYuan=人数×单价+投流（投流类可 headcount=0）。
4. calendar.milestones 日期落在周期内，≥8 条；非直播事项 time 可留空。
5. platformStrategy 仅用户勾选平台。
6. 组品 3～6 个，优先真实菜单名或已上架套餐名。
7. 【执行时间粒度】phases/weeklyActions 用日/周即可；hourlySchedule 仅允许 scene="live" 的直播相关任务（开播、场控、直播投流盯盘等），禁止给拍摄/剪辑/上架等非直播事项写小时。无直播计划时可输出空数组 []。
8. 短视频的 publishWindow 用「工作日/周末 上午/晚间」等粗粒度；仅直播行可写具体 HH:mm。
9. phases≥3、weeklyActions 覆盖每周、goals≥3；每个 phase 必须带 detailItems（≥2 条日粒度任务）。
10. marketingBudget.roiAnalysis 与 roiSummary 不得省略（≥3 行 ROI）。
11. 输出须紧凑完整：字段值简洁，避免冗长复述，确保 JSON 可一次完整返回。`

async function enrichCombosFromProductPlan(
  plan: AiOpsPlanResult,
  body: {
    storeName?: string
    menuSummary?: string
    margins?: { douyin: number; meituan: number; xhs: number }
    industryPath?: string
    competitorSummary?: string
    platforms: string[]
  },
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<AiOpsPlanResult> {
  if (plan.productBoard.combos.length >= 3) return plan
  const menu = String(body.menuSummary || '').trim()
  if (!menu) return plan
  try {
    const out = await runAiProductPlanCore(
      JSON.stringify({
        userBrief: `为门店生成 3～5 个团购组品方案，适配平台：${body.platforms.join('、')}`,
        intentLabels: ['单人套餐', '双人套餐', '家庭套餐', '代金券'],
        platform: 'douyin',
        storeName: body.storeName,
        menuSummary: menu,
        margins: body.margins,
        industryPath: body.industryPath,
        competitorSummary: body.competitorSummary,
      }),
      authHeader,
      env,
    )
    if (out.status !== 200 || !out.body?.ok) return plan
    const plans = Array.isArray(out.body.plans) ? out.body.plans : out.body.plan ? [out.body.plan] : []
    const extra = plans
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        name: String(p.productName ?? '').trim(),
        items: Array.isArray(p.comboLines)
          ? (p.comboLines as unknown[]).map((x) => String(x)).join('、')
          : '',
        priceYuan: Number(p.suggestedPriceYuan) || 0,
        originYuan: Number(p.originPriceYuan ?? p.originYuan) || 0,
        marginHint: String(p.marginNote ?? '').trim(),
        platforms: body.platforms.slice(0, 3).join('/'),
        sellingPoint: String(p.description ?? '').trim().slice(0, 80),
        stockHint: '',
      }))
      .filter((c) => c.name)
    if (!extra.length) return plan
    const names = new Set(plan.productBoard.combos.map((c) => c.name))
    const merged = [...plan.productBoard.combos]
    for (const c of extra) {
      if (names.has(c.name)) continue
      names.add(c.name)
      merged.push(c)
    }
    return { ...plan, productBoard: { combos: merged.slice(0, 24) } }
  } catch {
    return plan
  }
}

export async function runAiOpsPlanCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }
  const aiEnv = await mergeStoreIntelAiEnv(env)

  let body: {
    platforms?: string[]
    budgetYuan?: number
    periodStart?: string
    periodEnd?: string
    goalsNote?: string
    storeName?: string
    menuSummary?: string
    margins?: { douyin: number; meituan: number; xhs: number }
    industryPath?: string
    competitorSummary?: string
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }

  const platforms = Array.isArray(body.platforms)
    ? body.platforms.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : []
  const budgetYuan = Number(body.budgetYuan) || 0
  const periodStart = String(body.periodStart || '').trim()
  const periodEnd = String(body.periodEnd || '').trim()
  if (!platforms.length) {
    return { status: 400, body: { ok: false, error: 'platforms_required', message: '请至少勾选一个平台' } }
  }
  if (!(budgetYuan > 0)) {
    return { status: 400, body: { ok: false, error: 'budget_required', message: '请填写有效总预算' } }
  }
  if (!periodStart || !periodEnd) {
    return { status: 400, body: { ok: false, error: 'period_required', message: '请填写活动起止日期' } }
  }

  const margins = body.margins
  const marginLine = margins
    ? `综合毛利率（%）：抖音 ${margins.douyin}，美团 ${margins.meituan}，小红书 ${margins.xhs}。`
    : '毛利率：未配置（请在商品页配置）。'

  const userPrompt = [
    `勾选平台：${platforms.join('、')}`,
    `总预算（元）：${budgetYuan}`,
    `周期：${periodStart} ～ ${periodEnd}`,
    body.storeName ? `门店：${body.storeName}` : '',
    body.industryPath ? `经营类目：${body.industryPath}` : '',
    marginLine,
    body.menuSummary
      ? String(body.menuSummary).includes('已上架套餐')
        ? `已上架套餐参考（无菜单价目表，请据此组品规划）：\n${body.menuSummary}`
        : `菜单价目参考：\n${body.menuSummary}`
      : '菜单价目：未提供（请按类目与平台常规套餐结构规划，勿捏造具体菜名）',
    body.competitorSummary ? `竞品摘要：\n${body.competitorSummary}` : '',
    body.goalsNote ? `商家补充目标：${body.goalsNote}` : '',
    '请生成完整六块方案 JSON（字段简洁）；须含 ROI 与 budgetLines；hourlySchedule 仅直播。',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    let obj = await llmJson(aiEnv, SYSTEM_PROMPT, userPrompt)
    let plan = normalizeAiOpsPlanResult(obj)
    if (!plan || !isAiOpsPlanResultUsable(plan)) {
      obj = await llmJson(
        aiEnv,
        SYSTEM_PROMPT,
        `${userPrompt}\n\n上次输出无效，请严格按 schema 重新输出完整 JSON（字段值尽量短）。`,
      )
      plan = normalizeAiOpsPlanResult(obj)
    }
    // 仅在可用方案但 ROI/预算行偏少时补强一次，避免多轮拖垮总时长
    if (
      plan &&
      isAiOpsPlanResultUsable(plan) &&
      (plan.marketingBudget.roiAnalysis.length < 2 || plan.talentBudget.budgetLines.length < 3)
    ) {
      obj = await llmJson(
        aiEnv,
        SYSTEM_PROMPT,
        `${userPrompt}\n\n请补全 roiAnalysis（≥3）与 budgetLines（短视频分层、本地推、直播达人、直播投流），输出完整 JSON。`,
      )
      const denser = normalizeAiOpsPlanResult(obj)
      if (
        denser &&
        isAiOpsPlanResultUsable(denser) &&
        (denser.marketingBudget.roiAnalysis.length > plan.marketingBudget.roiAnalysis.length ||
          denser.talentBudget.budgetLines.length > plan.talentBudget.budgetLines.length)
      ) {
        plan = denser
      }
    }
    if (!plan || !isAiOpsPlanResultUsable(plan)) {
      return {
        status: 502,
        body: { ok: false, error: 'ops_plan_parse_failed', message: '方案解析失败，请重试' },
      }
    }

    if (!plan.marketingBudget.totalBudget) {
      plan = {
        ...plan,
        marketingBudget: { ...plan.marketingBudget, totalBudget: budgetYuan },
      }
    }

    plan = ensureMarketingRoiFallback(plan)

    plan = await enrichCombosFromProductPlan(
      plan,
      {
        storeName: body.storeName,
        menuSummary: body.menuSummary,
        margins: body.margins,
        industryPath: body.industryPath,
        competitorSummary: body.competitorSummary,
        platforms,
      },
      authHeader,
      env,
    )

    return {
      status: 200,
      body: {
        ok: true,
        plan,
        meta: {
          platforms,
          budgetYuan,
          periodStart,
          periodEnd,
          storeName: body.storeName || '',
        },
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 502,
      body: { ok: false, error: 'ops_plan_failed', detail: msg.slice(0, 600), message: msg.slice(0, 200) },
    }
  }
}

/**
 * AI 运营方案：菜单/毛利/预算/多平台 → 六块结构化 JSON
 */
import type { AIChatRequest } from '../src/services/ai/types.js'
import {
  isAiOpsPlanResultUsable,
  normalizeAiOpsPlanResult,
  type AiOpsPlanResult,
} from '../src/lib/aiOpsPlanTypes.js'
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import { chatTokenMix } from './aiGateway/providers/tokenmix.js'
import { merchantAgentChatFromMessages } from './merchantAiUpstream.js'
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
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}

async function llmJson(
  env: Record<string, string>,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  const errors: string[] = []
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]

  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  if (qwenKey) {
    try {
      const { text } = await merchantAgentChatFromMessages(env, 'qwen', undefined, system, user)
      return extractJsonObject(text)
    } catch (e) {
      errors.push(`通义：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  if (doubaoKey) {
    try {
      const { text } = await merchantAgentChatFromMessages(env, 'doubao', undefined, system, user)
      return extractJsonObject(text)
    } catch (e) {
      errors.push(`豆包：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const tokenmixKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (tokenmixKey) {
    try {
      const req: AIChatRequest = {
        provider: 'tokenmix',
        modelFamily: 'openai',
        model: (env.MERCHANT_AI_PLAN_JSON_MODEL ?? 'gpt-4o').trim() || 'gpt-4o',
        messages,
        temperature: 0.35,
      }
      const res = await chatTokenMix(req, env)
      return extractJsonObject(res.content)
    } catch (e) {
      errors.push(`TokenMix：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!qwenKey && !doubaoKey && !tokenmixKey) {
    throw new Error(
      '未配置运营方案 LLM：请设置 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY / TOKENMIX_API_KEY 之一',
    )
  }
  throw new Error(errors.slice(0, 3).join('；') || '运营方案模型调用失败')
}

const SYSTEM_PROMPT = `你是资深本地生活/餐饮多平台运营总监，输出可直接落地执行的完整运营方案（对齐「运营方案 / 具体执行方案 / 营销预算 / 项目进度日历 / 达人明细及预算 / 组品货盘」六块）。
只输出一个 JSON 对象（不要 Markdown），结构必须为：
{
  "opsPlan": {
    "background": "门店与商圈背景 2～4 句",
    "positioning": "一句话定位",
    "targetAudience": "核心人群画像",
    "goals": ["可量化目标1（含数字/周期）","目标2","目标3"],
    "contentPillars": ["内容支柱1","内容支柱2","内容支柱3"],
    "monthlyThemes": ["月主题/周主题1","主题2"],
    "platformStrategy": [{
      "platform":"抖音",
      "approach":"打法与玩法（≥40字）",
      "contentTypes":"内容形态（探店/短视频/直播等）",
      "publishFreq":"发布频次",
      "kpi":"可量化 KPI",
      "examples":"2～3 个选题示例"
    }],
    "risks": ["风险与对策1","风险与对策2"]
  },
  "executionPlan": {
    "overview": "执行总览（节奏、关键节点、协作方式）",
    "phases": [{
      "phase":"阶段名",
      "dateRange":"YYYY-MM-DD～YYYY-MM-DD",
      "actions":"本阶段动作（具体）",
      "ownerRole":"负责人角色",
      "deliverable":"交付物",
      "successMetric":"成功指标"
    }],
    "weeklyActions": [{
      "week":"第1周",
      "dateRange":"YYYY-MM-DD～YYYY-MM-DD",
      "focus":"本周重点",
      "tasks":"任务清单（分号分隔）",
      "ownerRole":"角色"
    }],
    "hourlySchedule": [{
      "date":"YYYY-MM-DD",
      "timeStart":"09:00",
      "timeEnd":"10:00",
      "task":"具体任务（可执行）",
      "ownerRole":"店长/运营/达人/设计 等",
      "location":"门店/线上/拍摄点",
      "deliverable":"产出",
      "notes":"备注"
    }]
  },
  "marketingBudget": {
    "totalBudget": 数字,
    "contingencyPct": 5,
    "channels": [{
      "channel":"达人投放",
      "month":"YYYY-MM",
      "amountYuan":数字,
      "ratioPct":数字,
      "note":"说明"
    }],
    "assumptions":"预算假设与控费规则"
  },
  "calendar": {
    "milestones": [{
      "date":"YYYY-MM-DD",
      "time":"10:00",
      "item":"事项",
      "dependency":"依赖",
      "ownerRole":"角色",
      "statusHint":"状态建议"
    }]
  },
  "talentBudget": {
    "talentRows": [{
      "platform":"抖音",
      "tier":"腰部",
      "talentType":"探店/测评/种草",
      "headcount":2,
      "unitBudgetYuan":数字,
      "subtotalYuan":数字,
      "contentForm":"图文/短视频/直播",
      "publishWindow":"周末 11:00-13:00 / 18:00-21:00",
      "note":""
    }]
  },
  "productBoard": {
    "combos": [{
      "name":"套餐名",
      "items":"菜品组合",
      "priceYuan":数字,
      "originYuan":数字,
      "marginHint":"毛利说明",
      "platforms":"抖音/美团",
      "sellingPoint":"卖点",
      "stockHint":"库存/核销提示"
    }]
  }
}

硬性要求（必须全部满足）：
1. 只基于用户提供的菜单/毛利/类目/竞品/预算/平台产出；缺菜单时不要编造具体店内菜名，在 risks/assumptions 标明「需补充菜单价目表」，组品给通用价带建议即可。
2. marketingBudget.channels 金额合计应接近 totalBudget（误差≤5%）；totalBudget 使用用户给出的总预算；按月拆分（month 字段）。
3. talentBudget 各行小计 = 人数×单场预算；达人渠道小计之和应与营销预算里「达人」相关渠道金额大致对齐。
4. calendar.milestones 日期必须落在用户 periodStart～periodEnd 内，至少 10 条，且尽量带 time（小时）。
5. platformStrategy 仅覆盖用户勾选的平台，每平台字段写全（approach/contentTypes/publishFreq/kpi/examples）。
6. 组品售价须结合毛利率倒推合理；有菜单时 combo items 优先用菜单真实品名；至少 3～6 个套餐。
7. 【最重要】executionPlan.hourlySchedule 必须详细，落到小时单位：
   - 至少输出 24～60 条小时级任务；
   - 覆盖周期内多个工作日与至少 2 个周末；
   - timeStart/timeEnd 用 HH:mm，单条时长 0.5～3 小时；
   - 任务覆盖：内容策划、拍摄、剪辑、达人对接、上架审核、投放盯盘、核销复盘、私域转化等；
   - 同一日期按时间排序，动作具体可执行，禁止空泛「推进运营」。
8. phases ≥3、weeklyActions 覆盖完整周期每周、goals ≥3 条且可量化。`

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
    body.menuSummary ? `菜单价目参考：\n${body.menuSummary}` : '菜单价目：未提供',
    body.competitorSummary ? `竞品摘要：\n${body.competitorSummary}` : '',
    body.goalsNote ? `商家补充目标：${body.goalsNote}` : '',
    '请生成完整六块详细方案 JSON；具体执行方案必须含 hourlySchedule（小时级排期，≥24 条）。',
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
        `${userPrompt}\n\n上次输出无效，请严格按 schema 重新输出完整 JSON。`,
      )
      plan = normalizeAiOpsPlanResult(obj)
    }
    if (
      plan &&
      isAiOpsPlanResultUsable(plan) &&
      plan.executionPlan.hourlySchedule.length < 12
    ) {
      obj = await llmJson(
        aiEnv,
        SYSTEM_PROMPT,
        `${userPrompt}\n\n上次 hourlySchedule 过少（仅 ${plan.executionPlan.hourlySchedule.length} 条）。请保留并加细其它块，重点补全 hourlySchedule 至 24～60 条（HH:mm，覆盖多日与周末），输出完整 JSON。`,
      )
      const denser = normalizeAiOpsPlanResult(obj)
      if (denser && denser.executionPlan.hourlySchedule.length > plan.executionPlan.hourlySchedule.length) {
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

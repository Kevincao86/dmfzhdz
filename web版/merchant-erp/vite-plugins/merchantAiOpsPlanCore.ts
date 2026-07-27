/**
 * AI 运营方案：菜单/毛利/预算/多平台 → 六块结构化 JSON
 */
import {
  buildAiOpsRoiLookupForPrompt,
  enrichAiOpsPlanPostProcess,
  ensureSimplePlanDetailDepth,
  isAiOpsPlanResultUsable,
  normalizeAiOpsPlanResult,
  type AiOpsPlanEdition,
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

/** 截断 JSON 补全引号/括号，尽量救回 DeepSeek 等长输出被截断的结果 */
function repairTruncatedJson(text: string): string {
  let s = text.trim()
  const fenced = s.match(/```(?:json)?\s*([\s\S]*)/i)
  if (fenced?.[1]) s = fenced[1].replace(/```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return s
  s = s.slice(start)
  let inString = false
  let escape = false
  const stack: Array<'{' | '['> = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }
  if (inString) s += '"'
  s = s.replace(/,\s*$/, '')
  while (stack.length) {
    const open = stack.pop()
    s += open === '{' ? '}' : ']'
  }
  return s
}

function extractJsonObject(text: string): Record<string, unknown> {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? t
  const start = raw.indexOf('{')
  if (start < 0) throw new Error('模型未返回有效 JSON')
  const tryParse = (slice: string): Record<string, unknown> | null => {
    try {
      const obj = JSON.parse(slice) as Record<string, unknown>
      if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).length === 0) {
        return null
      }
      return obj
    } catch {
      return null
    }
  }
  const end = raw.lastIndexOf('}')
  if (end > start) {
    const hit = tryParse(raw.slice(start, end + 1))
    if (hit) return hit
  }
  const repaired = tryParse(repairTruncatedJson(raw.slice(start)))
  if (repaired) {
    console.warn('[meoo-ai-ops-plan] JSON truncated; repaired and accepted')
    return repaired
  }
  throw new Error('模型未返回有效 JSON（可能输出过长被截断）')
}

/** 按起始下标旋转厂商顺序，便于重试时换一家先试 */
function rotateOpsPlanVendors(offset: number): string[] {
  const base = [...OPS_PLAN_AI_VENDOR_ORDER]
  if (!base.length) return base
  const n = ((offset % base.length) + base.length) % base.length
  return [...base.slice(n), ...base.slice(0, n)]
}

function vendorTimeoutMs(vendor: string): number {
  if (vendor === 'qwen' || vendor === 'doubao' || vendor === 'deepseek') return 110_000
  return 45_000
}

/**
 * 六块方案：已配置 Key 的厂商逐个轮询；鉴权/额度错误秒切，长输出厂商给足时间。
 */
async function llmJson(
  env: Record<string, string>,
  system: string,
  user: string,
  rotateOffset = 0,
): Promise<Record<string, unknown>> {
  const vendors = rotateOpsPlanVendors(rotateOffset)
  const errors: string[] = []
  for (const vendor of vendors) {
    const t0 = Date.now()
    try {
      const obj = await withUpstreamChatTimeoutMs(vendorTimeoutMs(vendor), async () => {
        const out = await merchantChatTextWithVendorFailover(env, system, user, [vendor])
        if (!out.ok) {
          throw new Error(
            (out.errors?.length ? out.errors.join('；') : out.message) || `${vendor} 调用失败`,
          )
        }
        return extractJsonObject(out.text)
      })
      console.log(
        `[meoo-ai-ops-plan] llmJson ok vendor=${vendor} ms=${Date.now() - t0}`,
      )
      return obj
    } catch (e) {
      const parseMsg = e instanceof Error ? e.message : String(e)
      errors.push(`${vendor}: ${parseMsg.slice(0, 120)}`)
      console.warn(
        `[meoo-ai-ops-plan] llmJson hop vendor=${vendor} ms=${Date.now() - t0}: ${parseMsg.slice(0, 160)}`,
      )
    }
  }
  throw new Error(
    errors.length
      ? `全部模型不可用：${errors.slice(0, 8).join('；')}`
      : '运营方案模型调用失败（未配置可用 AI Key）',
  )
}

const SYSTEM_PROMPT = `你是资深本地生活/餐饮多平台运营总监。输出须对齐标杆六表（参考宁波万象城抖音运营方案布局）：①运营方案（背景目标/组品补贴/节点活动#话题/内容流量）②具体执行（短视频链路+大场直播+BGC/UGC+爆款脚本）③营销预算④项目进度日历（周表逐日节点）⑤达人明细及预算⑥组品货盘。可直接落地，禁止空话。
只输出一个 JSON 对象（不要 Markdown），结构必须为：
{
  "opsPlan": {
    "background": "门店与商圈背景摘要（≤80字）",
    "backgroundDetail": "背景详情≥4句：门店数/商圈/品类优势/竞争格局/消费节点与动机",
    "positioning": "一句话定位",
    "activities": "活动主题与玩法摘要（含主话题#）",
    "activitiesDetail": "活动详情须含：①主题与#话题 ②组品/券面与补贴或让利逻辑 ③线上玩法（短视频/直播/POI）④线下或到店核销动作 ⑤种草→转化→复购节奏与关键日期",
    "targetAudience": "核心人群摘要",
    "audienceDetail": "人群详情：年龄段、场景、动机、决策链路、内容触点",
    "goals": ["可量化目标1（须含客单×单量推导的核销GMV）","目标2（曝光/话题/好评等）","目标3"],
    "goalsDetail": [{
      "metric":"抖音短视频核销GMV",
      "target":"≥¥xxx（客单约¥AOV×约N单）",
      "rationale":"测算说明",
      "gmvYuan":数字,
      "orders":数字,
      "aovYuan":数字
    }],
    "contentPillars": ["内容支柱1（如探店省钱）","内容支柱2（如节点借势）","内容支柱3（如直播强转化）"],
    "monthlyThemes": ["节点主题1+日期+话题#","主题2"],
    "platformStrategy": [{
      "platform":"抖音",
      "approach":"打法摘要",
      "contentTypes":"内容形态",
      "publishFreq":"发布频次",
      "kpi":"KPI",
      "examples":"爆款脚本钩子（口语化标题）",
      "detail":"怎么做：选题池/达人分层/POI与挂链/发布与投流节奏（≤120字）"
    }],
    "risks": ["风险与对策"]
  },
  "executionPlan": {
    "overview": "执行总览：短视频创作链路+大场直播+官号/私域BGC与UGC协同",
    "phases": [{
      "phase":"阶段名（如种草期）",
      "dateRange":"YYYY-MM-DD～YYYY-MM-DD",
      "actions":"动作摘要（含货盘/达人/拍摄/审片等）",
      "ownerRole":"角色",
      "deliverable":"产出",
      "successMetric":"指标",
      "detailItems":[{
        "day":"YYYY-MM-DD",
        "task":"当日任务（做什么）",
        "howTo":"怎么做：步骤/Brief标准/协作方/验收",
        "ownerRole":"角色",
        "deliverable":"产出"
      }]
    }],
    "weeklyActions": [{
      "week":"第1周",
      "dateRange":"YYYY-MM-DD～YYYY-MM-DD",
      "focus":"重点",
      "tasks":"任务摘要",
      "ownerRole":"角色",
      "detail":"本周关键节点：货盘/补贴/招募/拍摄/审片/话题/预热等"
    }],
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
      "note":"行业转化区间+客单×单量+周期合计GMV口径说明"
    }],
    "assumptions":"预算假设"
  },
  "calendar": {
    "milestones": [{
      "date":"YYYY-MM-DD",
      "time":"HH:mm",
      "kind":"collab_confirm|talent_list|shoot_start|shoot_end|merchant_video_confirm|video_publish|live_confirm|live_talent_script|live_warmup|live_go|other",
      "item":"事项（具体可执行，如：确认货盘/造话题#/直播彩排/数据战报）",
      "dependency":"依赖",
      "ownerRole":"角色",
      "statusHint":"建议"
    }]
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
      "talentType":"探店/颜值/团购等标签",
      "headcount":2,
      "unitBudgetYuan":数字,
      "subtotalYuan":数字,
      "contentForm":"短视频/直播",
      "publishWindow":"周末晚间（仅直播写具体时段）",
      "note":"粉丝量级与带货侧重"
    }]
  },
  "productBoard": {
    "combos": [{"name":"套餐","items":"组合","priceYuan":数字,"originYuan":数字,"marginHint":"毛利","platforms":"抖音","sellingPoint":"卖点","stockHint":"库存"}]
  }
}

硬性要求：
1. 只基于用户提供的菜单价目/已上架套餐/毛利/类目/竞品/预算/平台/门店范围；无菜单时用「已上架套餐」清单组品，勿编造菜名。多门店时方案须覆盖所选门店（或注明分店差异）。
2. marketingBudget.channels 合计≈totalBudget（误差≤5%）；须含 roiSummary + roiAnalysis（≥3 行，含投入/预计GMV/订单/ROI/回本天数）。
3. 【达人写死】talentBudget 必须基于用户消息中的「灵祺星选达人库」段：先按门店城市取同城；无同城则已注入全国本地生活行情。必须读清并写明：头部（销售等级5级及以上 / V5·V5+）人数与样本、腰尾部（3–4级 / V3·V4）人数与样本；budgetLines 至少覆盖「短视频达人（头部/腰部/尾部分行）」「短视频本地推」「直播达人」「直播投流」；tier 与库分层对齐；人数/单价禁止脱离库数据；无同城时 note 注明「按全国本地生活达人行情」；subtotalYuan=人数×单价+投流；talentRows≥6。
4. calendar.milestones 日期落在周期内，≥12 条；除必选 kind（collab_confirm→live_go）外，另给 other：确认货盘、造话题#、预热物料、直播彩排、数据战报等；video_publish/live_* 带 HH:mm。缺项服务端会补全。
5. platformStrategy 仅用户勾选平台；examples 须像爆款钩子文案；detail≤120字且含 POI/挂链或投流之一。
6. 组品 3～5 个，优先真实菜单名或已上架套餐名；sellingPoint 写清券面/让利卖点。
7. phases/weeklyActions 用日/周；hourlySchedule 仅 live；无直播可 []。
8. phases≥3、goals≥3；每个 phase 的 detailItems≥4 且尽量覆盖阶段内每一天（dateRange 用 YYYY-MM-DD～YYYY-MM-DD）；howTo 含步骤与验收（≤80字）。不足时服务端按日补全。
9. 【ROI】禁止「假设转化率」；按平台行业中位核销转化写 note；expectedGmvYuan=周期总GMV=客单×单量，且 ≥ max(投入×投产中位, 投入÷毛利率×1.2)；roi=毛利ROI。
10. Detail/howTo/rationale 各段≤120字；输出必须是完整可解析 JSON，控制总长，禁止截断。`

/** 简易版：detailFlow.actions 必须是 {label, detail}，detail 写满具体内容（非工作流空壳） */
const SIMPLE_SYSTEM_PROMPT = `你是本地生活门店运营教练，服务中小商家与个人店主。用大白话，禁止行话缩写（如 ROI、GMV、BGC、UGC、KPI、POI 等）。只输出一个 JSON 对象（不要 Markdown）。

【最重要】用户点开详情要看到「写满的明细」，不是工作流目录。
禁止 actions 只写「列包含项目」「定售价」「传主图」这种空壳标题。
每条 action 必须是对象：{"label":"短标题","detail":"写满的具体内容（项目名、价格、规则、可直接用的文案/话术原文）"}。
detail 至少 30 字，必须出现具体信息。

结构必须为：
{
  "planEdition": "simple",
  "hero": {
    "headline": "一句话结论（≤30字）",
    "summary": "2～3句总述",
    "storeHint": "店名或门店范围",
    "periodHint": "周期",
    "budgetHint": "预算用法"
  },
  "steps": [
    {
      "title": "第1步标题",
      "body": "卡片摘要",
      "tip": "小贴士",
      "detailFlow": [
        {
          "title": "准备",
          "body": "本阶段目标",
          "actions": [
            { "label": "主卖点原文", "detail": "可直接对外使用的 1～2 句卖点，写清谁适合买、得什么" },
            { "label": "规则条文", "detail": "有效期/预约/节假日/转赠/差价等条文，写完整" },
            { "label": "素材清单", "detail": "要拍哪些图、几张、拍什么内容" }
          ]
        }
      ],
      "detailNote": "注意"
    }
  ],
  "platforms": [
    {
      "platform": "抖音",
      "how": "发15～30秒竖屏短视频，挂小黄车，几点发",
      "detailFlow": [
        {
          "title": "选题",
          "body": "今天拍什么短视频",
          "actions": [
            { "label": "内容角度", "detail": "抖音短视频角度：完播+小黄车，写死场景" },
            { "label": "开头钩子原句", "detail": "口播原句，含价格；前3秒留人" },
            { "label": "分镜清单", "detail": "竖屏逐镜，秒数写清" }
          ]
        },
        {
          "title": "拍摄/剪辑",
          "body": "怎么拍剪短视频",
          "actions": [
            { "label": "字幕文案", "detail": "可直接贴的字幕原文" },
            { "label": "成片结构", "detail": "时间轴：秒数+画面+字幕+小黄车引导" }
          ]
        },
        {
          "title": "发布挂链",
          "body": "怎么发到抖音",
          "actions": [
            { "label": "标题原文", "detail": "抖音专用标题（含小黄车/同城等，禁止与小红书标题相同）" },
            { "label": "正文原文", "detail": "抖音专用正文与话题" },
            { "label": "挂链商品", "detail": "小黄车挂哪个套餐名/价格，如何自检" }
          ]
        },
        {
          "title": "复盘",
          "body": "看完播与小黄车",
          "actions": [
            { "label": "记录指标", "detail": "播放、完播、小黄车点击、核销" },
            { "label": "怎么改下一条", "detail": "按完播逻辑改前3秒" }
          ]
        }
      ],
      "detailNote": "真实拍摄竖屏"
    },
    {
      "platform": "小红书",
      "how": "发图文种草笔记，封面标题公式，几点发",
      "detailFlow": [
        {
          "title": "选题",
          "body": "今天发什么图文笔记",
          "actions": [
            { "label": "内容角度", "detail": "小红书种草/测评角度，不是短视频口播" },
            { "label": "封面标题公式", "detail": "封面大字2行原句，价格上封面" },
            { "label": "图片清单", "detail": "6～9张各拍什么" }
          ]
        },
        {
          "title": "图文排版",
          "body": "怎么排笔记",
          "actions": [
            { "label": "首图要求", "detail": "竖版首图要带的字" },
            { "label": "笔记结构", "detail": "痛点→体验→价格→下单，200～400字" }
          ]
        },
        {
          "title": "发布挂链",
          "body": "怎么发到小红书",
          "actions": [
            { "label": "标题原文", "detail": "小红书专用标题（测评/种草语气，禁止与抖音标题相同）" },
            { "label": "正文原文", "detail": "小红书专用正文与标签" },
            { "label": "挂链商品", "detail": "笔记商品组件挂哪个套餐" }
          ]
        },
        {
          "title": "复盘",
          "body": "看收藏与商品点击",
          "actions": [
            { "label": "记录指标", "detail": "封面点击、收藏、商品点击、核销" },
            { "label": "怎么改下一条", "detail": "按收藏逻辑改封面公式" }
          ]
        }
      ],
      "detailNote": "图文种草，勿套抖音分镜"
    }
  ],
  "combos": [
    {
      "name": "七夕情侣套餐",
      "sellingPoint": "情侣专享，节日氛围浓",
      "priceHint": "¥299",
      "items": "双人洗浴、双人按摩、节日小礼物",
      "detailFlow": [
        {
          "title": "组品",
          "body": "定清包含与规则",
          "actions": [
            { "label": "包含项目明细", "detail": "逐项写出：双人洗浴（多久）、双人按摩（多久）、礼物是什么；不可拆分等" },
            { "label": "售价与使用规则", "detail": "售价¥299；门市对比价；有效期；是否预约；节假日；差价怎么补——写成可贴商品页的条文" },
            { "label": "卖点文案", "detail": "可直接贴的 2 句卖点" },
            { "label": "成本毛利自检", "detail": "大概怎么算成本、赠品成本控制" }
          ]
        },
        {
          "title": "上架",
          "body": "怎么上平台",
          "actions": [
            { "label": "主图要求", "detail": "几张图、每张拍什么、要带哪些字" },
            { "label": "标题与描述原文", "detail": "可直接粘贴的标题+描述，含包含项目与规则" },
            { "label": "门店库存可售时间", "detail": "勾哪些店、库存建议、可售日期" }
          ]
        },
        {
          "title": "核销话术",
          "body": "到店怎么说",
          "actions": [
            { "label": "开场话术原句", "detail": "店员开口第一句，带套餐名" },
            { "label": "核销确认原句", "detail": "扫码前后要说的原文，复述包含项目" },
            { "label": "异常处理原句", "detail": "过期/门店不对时的原文" }
          ]
        }
      ],
      "detailNote": "规则写清，避免纠纷"
    }
  ],
  "checklist": [
    {
      "text": "落地事项",
      "detailFlow": [
        {
          "title": "做什么",
          "body": "今天交付什么",
          "actions": [
            { "label": "今日交付物", "detail": "具体要产出的文案/链接/截图是什么" },
            { "label": "操作顺序", "detail": "第1步…第2步…写清" }
          ]
        },
        {
          "title": "完成标准",
          "body": "怎样算完",
          "actions": [
            { "label": "内容标准", "detail": "名称/包含/价格/规则四要素齐全" },
            { "label": "一致性标准", "detail": "海报视频商品页一致" }
          ]
        }
      ],
      "detailNote": "突出优惠"
    }
  ]
}
硬性要求（违反即失败）：
1. steps 3～5；platforms≤4 仅勾选平台；combos 2～4；checklist 5～8。
2. actions 必须是对象数组 {label, detail}；detail 禁止空、禁止只有动词短语；组品必须写清「组怎样的品、含哪些项、价格与规则条文」；平台必须给出可粘贴的标题/正文/钩子原句；核销必须给店员可照读的原句。
3. items / priceHint / sellingPoint 与组品 detail 必须互相一致；有菜单则用真实菜名/项目名。
4. 禁止六表结构；口语化；优先写满 detail，宁可略缩短 steps 条数也要保证明细厚度。
5. 【平台必须差异化】每个 platform 条目的 how、标题原文、正文原文、制作步骤、复盘指标都不得互相复制粘贴。
   - 抖音：短视频+小黄车+完播；detailFlow 用「拍摄/剪辑」；标题/正文含抖音话术。
   - 小红书：图文笔记+封面标题公式+收藏；detailFlow 用「图文排版」（禁止写抖音分镜/口播时间轴）；标题/正文用种草测评语气。
   - 美团/点评：团购套餐页+评价；用「商品页优化」。
   - 快手：口语短视频+黄车；视频号：私域转发感。
   同一套餐在不同平台可以卖点相近，但标题、正文、操作步骤必须平台专用，禁止两平台标题一字不差。`

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
    storeNames?: string[]
    storeScope?: 'all' | 'selected'
    city?: string
    prospectPreview?: boolean
    menuSummary?: string
    margins?: { douyin: number; meituan: number; xhs: number }
    industryPath?: string
    competitorSummary?: string
    planEdition?: AiOpsPlanEdition | string
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

  const planEdition: AiOpsPlanEdition = body.planEdition === 'simple' ? 'simple' : 'standard'

  const margins = body.margins
  const marginLine = margins
    ? `综合毛利率（%）：抖音 ${margins.douyin}，美团 ${margins.meituan}，小红书 ${margins.xhs}。`
    : '毛利率：未配置（请在商品页配置）。'

  const storeNames = Array.isArray(body.storeNames)
    ? body.storeNames.map((x) => String(x).trim()).filter(Boolean).slice(0, 80)
    : []
  const storeScope = body.storeScope === 'selected' ? 'selected' : body.storeScope === 'all' ? 'all' : undefined
  const storeLine = (() => {
    if (storeScope === 'all') {
      return storeNames.length
        ? `门店范围：全部门店（共 ${storeNames.length} 家）：${storeNames.slice(0, 40).join('、')}${storeNames.length > 40 ? '…' : ''}`
        : '门店范围：全部门店（连锁统一方案，执行可按店拆分）'
    }
    if (storeNames.length) {
      return `门店范围：已选 ${storeNames.length} 家 — ${storeNames.join('、')}`
    }
    if (body.storeName) return `门店：${body.storeName}`
    return ''
  })()

  const storeCity = String(body.city || '').trim()

  if (planEdition === 'simple') {
    const simpleUserPrompt = [
      body.prospectPreview ? '场景：服务商洽谈预览（客户尚未签约，输出可对外讲的白话方案）。' : '',
      `勾选平台：${platforms.join('、')}`,
      `总预算（元）：${budgetYuan}`,
      `周期：${periodStart} ～ ${periodEnd}`,
      storeLine,
      storeCity ? `城市：${storeCity}` : '',
      body.industryPath ? `经营类目：${body.industryPath}` : '',
      marginLine,
      body.menuSummary
        ? String(body.menuSummary).includes('已上架套餐')
          ? `已上架套餐参考：\n${body.menuSummary}`
          : `菜单价目参考：\n${body.menuSummary}`
        : '菜单价目：未提供（按类目常规套餐结构写，勿捏造具体菜名）',
      body.competitorSummary ? `竞品摘要：\n${body.competitorSummary}` : '',
      body.goalsNote ? `商家补充目标：${body.goalsNote}` : '',
      '请按简易版 schema 输出完整 JSON；steps≤5、platforms≤4、combos≤4、checklist≤8。',
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      let obj = await llmJson(aiEnv, SIMPLE_SYSTEM_PROMPT, simpleUserPrompt, 0)
      let plan = normalizeAiOpsPlanResult(obj)
      if (!plan || !isAiOpsPlanResultUsable(plan) || plan.planEdition !== 'simple') {
        obj = await llmJson(
          aiEnv,
          SIMPLE_SYSTEM_PROMPT,
          `${simpleUserPrompt}\n\n上次输出无效，请严格按简易版 schema 重新输出完整 JSON。`,
          3,
        )
        plan = normalizeAiOpsPlanResult(obj)
      }
      if (!plan || !isAiOpsPlanResultUsable(plan)) {
        return {
          status: 502,
          body: {
            ok: false,
            error: 'ops_plan_parse_failed',
            message: '方案解析失败，请稍后重试（模型输出不完整）',
          },
        }
      }
      plan = { ...plan, planEdition: 'simple' }
      if (plan.simplePlan) {
        const h = plan.simplePlan.hero
        plan = {
          ...plan,
          simplePlan: {
            ...plan.simplePlan,
            hero: {
              ...h,
              storeHint: h.storeHint || storeLine.replace(/^门店[：:]/, '').trim() || body.storeName || '',
              periodHint: h.periodHint || `${periodStart} ～ ${periodEnd}`,
              budgetHint: h.budgetHint || `预算约 ¥${budgetYuan.toLocaleString('zh-CN')}`,
            },
          },
        }
      }
      // 补全 detailFlow.body / 最后一级 actions（模型常只吐标题）
      plan = ensureSimplePlanDetailDepth(plan)
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
            city: storeCity,
            planEdition: 'simple',
          },
        },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[meoo-ai-ops-plan] simple failed', msg.slice(0, 400))
      return {
        status: 502,
        body: {
          ok: false,
          error: 'ops_plan_failed',
          detail: msg.slice(0, 600),
          message: msg.slice(0, 200) || '生成失败，请稍后重试',
        },
      }
    }
  }

  const talentPlatform = (() => {
    const joined = platforms.join(' ')
    if (/小红书/.test(joined)) return '小红书' as const
    if (/快手/.test(joined)) return '快手' as const
    return '抖音' as const
  })()

  let talentLibraryBlock = ''
  let talentLibraryMeta: {
    city: string
    citySource: string
    matchedEntries: number
    headCount: number
    midTailCount: number
    headSamples: string[]
    midTailSamples: string[]
    sourceLabel: string
    tierAvgSummary: string
  } | null = null
  try {
    const { loadRegistrySnapshotForServer } = await import('../src/lib/registrySnapshotServerLoad.js')
    const {
      buildTalentLibraryPlanPromptBlock,
      buildTalentLibraryPlanInsight,
      resolveTalentLibraryEntriesForCity,
    } = await import('../src/lib/talentLibraryTierPricing.js')
    const reg = await loadRegistrySnapshotForServer(process.cwd())
    const entries = reg?.talentLibraryEntries ?? []
    if (entries.length) {
      const resolved = resolveTalentLibraryEntriesForCity({
        entries,
        city: storeCity,
        platform: talentPlatform,
      })
      const insight = buildTalentLibraryPlanInsight({
        entries,
        city: storeCity,
        platform: talentPlatform,
      })
      talentLibraryBlock = buildTalentLibraryPlanPromptBlock({
        entries,
        city: storeCity,
        platform: talentPlatform,
      })
      talentLibraryMeta = {
        city: storeCity || resolved.filterCity,
        citySource: resolved.source,
        matchedEntries: insight.matchedEntries,
        headCount: insight.headCount,
        midTailCount: insight.midTailCount,
        headSamples: insight.headSamples,
        midTailSamples: insight.midTailSamples,
        sourceLabel: insight.sourceLabel,
        tierAvgSummary: insight.tierAvgSummary,
      }
    } else {
      talentLibraryBlock =
        '【灵祺星选达人库】当前库内暂无达人条目；talentBudget 须按本地生活探店常规档位保守估算，并在 note 标明「达人库暂空」。'
    }
  } catch (e) {
    console.warn(
      '[meoo-ai-ops-plan] talent library inject failed',
      e instanceof Error ? e.message.slice(0, 160) : e,
    )
    talentLibraryBlock =
      '【灵祺星选达人库】读取失败；talentBudget 须保守估算并在 note 标明「达人库暂不可用」。'
  }

  const userPrompt = [
    body.prospectPreview ? '场景：服务商洽谈预览方案（客户尚未签约，输出可对外展示的专业方案草稿）。' : '',
    `勾选平台：${platforms.join('、')}`,
    `总预算（元）：${budgetYuan}`,
    `周期：${periodStart} ～ ${periodEnd}`,
    storeLine,
    storeCity ? `门店所在城市（地址推断，达人方案须优先同城达人库）：${storeCity}` : '门店所在城市：未解析到（达人方案须用全国本地生活达人库）',
    body.industryPath ? `经营类目：${body.industryPath}` : '',
    marginLine,
    body.menuSummary
      ? String(body.menuSummary).includes('已上架套餐')
        ? `已上架套餐参考（无菜单价目表，请据此组品规划）：\n${body.menuSummary}`
        : `菜单价目参考：\n${body.menuSummary}`
      : '菜单价目：未提供（请按类目与平台常规套餐结构规划，勿捏造具体菜名）',
    body.competitorSummary ? `竞品摘要：\n${body.competitorSummary}` : '',
    body.goalsNote ? `商家补充目标：${body.goalsNote}` : '',
    talentLibraryBlock,
    buildAiOpsRoiLookupForPrompt(platforms, body.industryPath),
    '请生成完整六块方案 JSON（紧凑、可一次解析完）；roiAnalysis 按【转化率查询结果】写 GMV/订单/ROI（客单×单量且覆盖毛利盈亏线）；goalsDetail 对齐；须含 budgetLines 且严格依据【灵祺达人库】；Detail/howTo 短而可执行；日历≥8 条带 kind；hourlySchedule 仅直播。',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    let obj = await llmJson(aiEnv, SYSTEM_PROMPT, userPrompt, 0)
    let plan = normalizeAiOpsPlanResult(obj)
    // 仅重试一次（旋转厂商起点）；ROI/日历/目标由 enrichAiOpsPlanPostProcess 补齐
    if (!plan || !isAiOpsPlanResultUsable(plan)) {
      obj = await llmJson(
        aiEnv,
        SYSTEM_PROMPT,
        `${userPrompt}\n\n上次输出无效或 JSON 截断，请严格按 schema 重新输出完整 JSON；Detail/howTo 各段≤200字。`,
        3,
      )
      plan = normalizeAiOpsPlanResult(obj)
    }
    if (!plan || !isAiOpsPlanResultUsable(plan)) {
      return {
        status: 502,
        body: {
          ok: false,
          error: 'ops_plan_parse_failed',
          message: '方案解析失败，请稍后重试（模型输出不完整）',
        },
      }
    }

    if (!plan.marketingBudget.totalBudget) {
      plan = {
        ...plan,
        marketingBudget: { ...plan.marketingBudget, totalBudget: budgetYuan },
      }
    }

    try {
      plan = enrichAiOpsPlanPostProcess(plan, {
        industryPath: body.industryPath,
        margins: body.margins,
        periodStart,
        periodEnd,
        platforms,
      })
    } catch (postErr) {
      console.error(
        '[meoo-ai-ops-plan] enrichAiOpsPlanPostProcess failed',
        postErr instanceof Error ? postErr.message : postErr,
      )
    }

    if (talentLibraryMeta) {
      plan = {
        ...plan,
        talentBudget: {
          ...plan.talentBudget,
          libraryInsight: {
            sourceLabel: talentLibraryMeta.sourceLabel,
            citySource: talentLibraryMeta.citySource,
            filterCity: talentLibraryMeta.city,
            platform: talentPlatform,
            headCount: talentLibraryMeta.headCount,
            midTailCount: talentLibraryMeta.midTailCount,
            headSamples: talentLibraryMeta.headSamples,
            midTailSamples: talentLibraryMeta.midTailSamples,
            tierAvgSummary: talentLibraryMeta.tierAvgSummary,
            matchedEntries: talentLibraryMeta.matchedEntries,
          },
        },
      }
    }

    // 组品不足时再补；失败忽略。有菜单草稿时优先跳过二次 LLM，降低超时概率
    if (plan.productBoard.combos.length < 2) {
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
    }

    plan = { ...plan, planEdition: 'standard' }
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
          city: storeCity,
          planEdition: 'standard',
          talentLibrary: talentLibraryMeta,
        },
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-ops-plan] failed', msg.slice(0, 400))
    return {
      status: 502,
      body: {
        ok: false,
        error: 'ops_plan_failed',
        detail: msg.slice(0, 600),
        message: msg.slice(0, 200) || '生成失败，请稍后重试',
      },
    }
  }
}

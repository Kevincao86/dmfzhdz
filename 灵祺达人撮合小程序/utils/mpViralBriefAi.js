const addonApi = require('./mpAddonMerchantApi.js')
const mpPointsSpend = require('./mpPointsSpendApi.js')

const STYLE_LABELS = {
  review: '测评理性种草',
  story: '故事场景叙事',
  listicle: '热点清单体',
  store_visit: '探店 Vlog',
  deal_push: '团购引流转化',
  atmosphere: '氛围出片感',
  guide: '本地攻略清单',
  real_review: '真实体验测评',
  holiday_theme: '节日主题活动',
  punch_in: '打卡目的地',
}

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  dianping: '大众点评',
  channels: '微信视频号',
  kuaishou: '快手',
}

const STYLE_OPTIONS = Object.keys(STYLE_LABELS).map((id) => ({ id, label: STYLE_LABELS[id] }))
const PLATFORM_OPTIONS = Object.keys(PLATFORM_LABELS).map((id) => ({ id, label: PLATFORM_LABELS[id] }))

function extractJson(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  let j = tryParse(t)
  if (j) return j
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    j = tryParse(fence[1].trim())
    if (j) return j
  }
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj) {
    j = tryParse(obj[0])
    if (j) return j
  }
  return null
}

function asStringList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x).trim()).filter(Boolean)
}

function resolvePlatform(order) {
  const p = String((order && order.platform) || '').trim()
  if (/大众|点评|dianping/i.test(p)) return 'dianping'
  if (/快手|kuaishou/i.test(p)) return 'kuaishou'
  if (/视频号|channels|weixin.*视频/i.test(p)) return 'channels'
  if (/红|xhs|xiaohongshu/i.test(p)) return 'xiaohongshu'
  return 'douyin'
}

function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || '抖音'
}

function platformBriefHint(platform) {
  switch (platform) {
    case 'xiaohongshu':
      return '小红书侧重：封面标题、真实测评感、清单/攻略结构、SEO 关键词。'
    case 'dianping':
      return '大众点评侧重：星级评价感、消费体验细节、菜品/服务描述、收藏打卡与团购引导。'
    case 'kuaishou':
      return '快手侧重：接地气口播、真实记录感、老铁互动、团购/私信转化。'
    case 'channels':
      return '微信视频号侧重：私域引流、熟人社交传播、简洁口播、公众号/小程序跳转。'
    default:
      return '抖音侧重：15～60s、强钩子、口播节奏、转化动作（到店/团购/私信）。'
  }
}

function styleBriefHint(style) {
  switch (style) {
    case 'store_visit':
      return '探店 Vlog：第一视角逛店、动线清晰、口播自然、突出招牌体验与出片点位。'
    case 'deal_push':
      return '团购引流：强调套餐性价比、限时福利、下单路径与到店核销动作。'
    case 'atmosphere':
      return '氛围出片：光影、装修、摆盘、BGM 情绪，弱化硬广、强化「想去」感。'
    case 'guide':
      return '本地攻略：清单体/路线体，适合周边逛吃、一日安排、避坑 Tips。'
    case 'real_review':
      return '真实测评：优缺点均衡、体验细节、适合建立信任与理性种草。'
    case 'holiday_theme':
      return '节日主题：结合节庆/周末/亲子/约会场景，突出限时活动与情绪价值。'
    case 'punch_in':
      return '打卡目的地：地标/网红点位、拍照机位、社交分享话术与话题标签。'
    case 'story':
      return '故事叙事：场景化人物关系或小剧情，自然带出产品/门店。'
    case 'listicle':
      return '热点清单：蹭热点或 TOP N 结构，信息密度高、节奏快。'
    default:
      return '测评种草：理性分析卖点、对比同类、给出明确推荐结论。'
  }
}

function buildOrderContext(order, extraHint) {
  const hint = String(extraHint || '').trim()
  const base = String((order && order.recruitContent) || '').trim()
  return [
    `招募标题：${(order && order.title) || '—'}`,
    `平台：${(order && order.platform) || '—'}`,
    `区域：${(order && order.region) || '—'}`,
    `品类：${(order && order.category) || '—'}`,
    hint ? `PR 补充要点：${hint}` : '',
    '',
    base || '（订单详情为空，请结合标题与品类发挥）',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatFullMarkdown(result) {
  const plat = platformLabel(result.platform)
  const styleLabel = STYLE_LABELS[result.style] || result.style
  const lines = [
    `# 爆款 Brief · ${plat} · ${styleLabel}`,
    '',
    '## 一、需求汇总',
    result.requirementSummary || '—',
    '',
    '## 二、解决方案',
  ]
  ;(result.unifiedSolutions || []).forEach((s) => {
    lines.push(`- **${s.title}**：${s.desc}`)
  })
  lines.push('', '## 三、爆款钩子（前 3 秒）')
  ;(result.hooks || []).forEach((h, i) => lines.push(`${i + 1}. ${h}`))
  lines.push('', '## 四、标题 / 封面文案')
  ;(result.titles || []).forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  lines.push('', '## 五、内容结构 / 分镜')
  ;(result.structure || []).forEach((sc, i) => {
    lines.push(`### 镜头 ${i + 1}：${sc.scene}`)
    lines.push(`- 画面：${sc.visual}`)
    lines.push(`- 口播：${sc.voice}`)
    if (sc.subtitle) lines.push(`- 字幕：${sc.subtitle}`)
  })
  lines.push('', '## 六、必提卖点')
  ;(result.mustMention || []).forEach((m) => lines.push(`- ${m}`))
  lines.push('', '## 七、禁忌事项')
  ;(result.forbidden || []).forEach((m) => lines.push(`- ${m}`))
  lines.push('', '## 八、话题 / 标签')
  lines.push((result.topics || []).join(' '))
  lines.push('', '## 九、执行分工')
  if (result.roles && result.roles.talent) lines.push(`- 达人：${result.roles.talent}`)
  if (result.roles && result.roles.shoot) lines.push(`- 拍摄：${result.roles.shoot}`)
  if (result.roles && result.roles.edit) lines.push(`- 剪辑：${result.roles.edit}`)
  lines.push('', '## 十、审片 Checklist')
  ;(result.checklist || []).forEach((c) => lines.push(`- [ ] ${c}`))
  return lines.join('\n')
}

function parseBriefResult(parsed, platform, style, fallbackText) {
  const solutions = Array.isArray(parsed.unifiedSolutions)
    ? parsed.unifiedSolutions.map((s) => ({
        title: String(s.title || '方案').trim(),
        desc: String(s.desc || '').trim(),
        relatedRoles: asStringList(s.relatedRoles),
      }))
    : []

  const structure = Array.isArray(parsed.structure)
    ? parsed.structure.map((s, i) => ({
        scene: String(s.scene || `段落${i + 1}`).trim(),
        visual: String(s.visual || '').trim(),
        voice: String(s.voice || '').trim(),
        subtitle: String(s.subtitle || '').trim() || '',
      }))
    : []

  const rolesRaw = parsed.roles && typeof parsed.roles === 'object' ? parsed.roles : {}
  const partial = {
    platform,
    style,
    requirementSummary: String(parsed.requirementSummary || '').trim() || fallbackText.slice(0, 800),
    unifiedSolutions: solutions,
    hooks: asStringList(parsed.hooks),
    titles: asStringList(parsed.titles),
    structure,
    mustMention: asStringList(parsed.mustMention),
    forbidden: asStringList(parsed.forbidden),
    topics: asStringList(parsed.topics),
    roles: {
      talent: String(rolesRaw.talent || parsed.talentRole || '').trim(),
      shoot: String(rolesRaw.shoot || parsed.shootRole || '').trim(),
      edit: String(rolesRaw.edit || parsed.editRole || '').trim(),
    },
    checklist: asStringList(parsed.checklist),
  }
  partial.fullMarkdown = formatFullMarkdown(partial)
  return partial
}

function isQuotaHopable(msg) {
  return /额度|限流|quota|limit|hopable|余额不足|insufficient/i.test(String(msg || ''))
}

async function chat(model, titleDraft, productName) {
  const models = [model || 'qwen']
  addonApi.TEXT_MODELS.forEach((m) => {
    if (models.indexOf(m.id) < 0) models.push(m.id)
  })
  let lastMsg = 'AI 请求失败'
  for (const mid of models) {
    const r = await addonApi.postDouyinAiAssist({
      model: mid,
      action: 'operation_article',
      product_name: productName,
      title_draft: titleDraft,
    })
    if (r && r.ok) return String(r.description || '').trim()
    lastMsg = (r && r.message) || lastMsg
    if (!isQuotaHopable(lastMsg)) break
  }
  throw new Error(lastMsg)
}

async function generateViralBrief(args) {
  const order = args.order
  const platform = args.platform || resolvePlatform(order)
  const style = args.style || 'review'
  const ctx = buildOrderContext(order, args.extraHint)
  const plat = platformLabel(platform)
  const styleLabel = STYLE_LABELS[style] || style
  const onProgress = typeof args.onProgress === 'function' ? args.onProgress : null

  await mpPointsSpend.spendBriefPoints({
    idempotencyKey: `brief-${String(order && order.id ? order.id : 'order')}-${Date.now()}`,
    note: `brief:${String(order && order.id ? order.id : '')}`,
  })

  if (onProgress) onProgress('正在通读招募订单需求…')

  const digestText = await chat(
    args.model || 'qwen',
    [
      `你是${plat}种草/探店内容策划。请通读下列招募订单信息，输出 JSON：`,
      '{',
      '  "requirementSummary": "400～700字：归纳传播目标、人群、主推卖点、拍摄/发布约束",',
      '  "unifiedSolutions": [{"title":"方案名","desc":"150～250字","relatedRoles":["达人/拍摄/剪辑"]}]',
      '}',
      '要求：至少 2 条 unifiedSolutions；须贴合订单真实信息，禁止套用无关行业模板。',
      '',
      ctx,
    ].join('\n'),
    `爆款Brief归纳｜${order.title}`,
  )

  const digest = extractJson(digestText)
  const requirementSummary = digest ? String(digest.requirementSummary || '').trim() : digestText.slice(0, 800)
  const unifiedSolutions =
    digest && Array.isArray(digest.unifiedSolutions)
      ? digest.unifiedSolutions.map((s) => ({
          title: String(s.title || '方案').trim(),
          desc: String(s.desc || '').trim(),
          relatedRoles: asStringList(s.relatedRoles),
        }))
      : []

  if (onProgress) onProgress('需求已汇总，正在生成爆款 Brief…')

  const briefText = await chat(
    args.model || 'qwen',
    [
      `你是${plat}爆款内容总监。风格：${styleLabel}。`,
      `基于下列需求汇总，输出${plat}达人可执行的爆款 Brief JSON：`,
      '{',
      '  "requirementSummary": "可沿用或精炼",',
      '  "unifiedSolutions": [...],',
      '  "hooks": ["前3秒钩子1","钩子2","钩子3"],',
      '  "titles": ["标题/封面文案1", "...共5条"],',
      '  "structure": [{"scene":"段落名","visual":"画面","voice":"口播","subtitle":"字幕"}],',
      '  "mustMention": ["必提卖点"],',
      '  "forbidden": ["禁忌/合规"],',
      '  "topics": ["#话题1","关键词2"],',
      '  "roles": {"talent":"达人要点","shoot":"拍摄要点","edit":"剪辑要点"},',
      '  "checklist": ["审片必达项"]',
      '}',
      platformBriefHint(platform),
      styleBriefHint(style),
      '',
      `【需求汇总】\n${requirementSummary}`,
      unifiedSolutions.length
        ? `【解决方案】\n${unifiedSolutions.map((s, i) => `${i + 1}. ${s.title}：${s.desc}`).join('\n')}`
        : '',
      '',
      `【订单原文】\n${ctx}`,
    ]
      .filter(Boolean)
      .join('\n'),
    `爆款Brief｜${plat}｜${order.title}`,
  )

  const parsed = extractJson(briefText)
  if (!parsed) {
    const partial = {
      platform,
      style,
      requirementSummary,
      unifiedSolutions,
      hooks: [],
      titles: [],
      structure: [],
      mustMention: [],
      forbidden: [],
      topics: [],
      roles: {},
      checklist: [],
      fullMarkdown: briefText || '',
    }
    if (!partial.fullMarkdown) partial.fullMarkdown = formatFullMarkdown(partial)
    return partial
  }

  if (!parsed.requirementSummary) parsed.requirementSummary = requirementSummary
  if (!parsed.unifiedSolutions && unifiedSolutions.length) parsed.unifiedSolutions = unifiedSolutions

  return parseBriefResult(parsed, platform, style, briefText)
}

module.exports = {
  STYLE_LABELS,
  STYLE_OPTIONS,
  PLATFORM_OPTIONS,
  resolvePlatform,
  platformLabel,
  formatFullMarkdown,
  generateViralBrief,
}

/**
 * 爆款 Brief：对齐 web `viralBriefAi.ts` 的平台/风格/提示词与 JSON 结构。
 */
const vs = require('./visualStudioAiMp.js')

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

function isCopyManuscriptPlatform(platform) {
  return platform === 'xiaohongshu' || platform === 'dianping'
}

function asStrList(v) {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x || '').trim()).filter(Boolean)
}

function extractJson(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const tryParse = (s) => {
    try {
      const o = JSON.parse(s)
      return o && typeof o === 'object' ? o : null
    } catch (_) {
      return null
    }
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    const p = tryParse(fenced[1].trim())
    if (p) return p
  }
  const direct = tryParse(t)
  if (direct) return direct
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) return tryParse(t.slice(start, end + 1))
  return null
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
    default:
      return ''
  }
}

function buildRequirementSummary(source, extraHint) {
  const parts = [source.title, source.category, source.region, source.content, extraHint]
    .map((x) => String(x || '').trim())
    .filter((x) => x.length >= 2)
  return parts.join('\n') || source.title || '商家需求'
}

function normalizeResult(parsed, args, requirementSummary, copyMode, rawText) {
  const p = parsed && typeof parsed === 'object' ? parsed : {}
  const structure = Array.isArray(p.structure)
    ? p.structure
        .map((sc) => ({
          scene: String((sc && sc.scene) || '').trim(),
          visual: String((sc && sc.visual) || '').trim(),
          voice: String((sc && sc.voice) || '').trim(),
          subtitle: String((sc && sc.subtitle) || '').trim(),
        }))
        .filter((sc) => sc.scene || sc.visual || sc.voice)
    : []
  const unifiedSolutions = Array.isArray(p.unifiedSolutions)
    ? p.unifiedSolutions
        .map((s) => ({
          title: String((s && s.title) || '').trim(),
          desc: String((s && s.desc) || '').trim(),
        }))
        .filter((s) => s.title || s.desc)
    : []
  const roles = p.roles && typeof p.roles === 'object' ? p.roles : {}
  const bodySections = Array.isArray(p.bodySections)
    ? p.bodySections
        .map((s) => ({
          heading: String((s && s.heading) || '').trim(),
          content: String((s && s.content) || '').trim(),
        }))
        .filter((s) => s.heading || s.content)
    : []
  return {
    outputMode: copyMode ? 'copy_manuscript' : 'video_brief',
    platform: args.platform,
    style: args.style,
    requirementSummary: String(p.requirementSummary || requirementSummary || '').trim(),
    unifiedSolutions,
    hooks: asStrList(p.hooks),
    titles: asStrList(p.titles),
    structure,
    mustMention: asStrList(p.mustMention),
    forbidden: asStrList(p.forbidden),
    topics: asStrList(p.topics),
    roles: {
      talent: String(roles.talent || '').trim(),
      shoot: String(roles.shoot || '').trim(),
      edit: String(roles.edit || '').trim(),
    },
    checklist: asStrList(p.checklist),
    coverTitles: asStrList(p.coverTitles),
    openingParagraph: String(p.openingParagraph || '').trim(),
    bodySections,
    closingParagraph: String(p.closingParagraph || '').trim(),
    fullCopy: String(p.fullCopy || (copyMode ? rawText : '') || '').trim(),
  }
}

function resultToMarkdown(r) {
  const lines = []
  if (r.outputMode === 'copy_manuscript') {
    lines.push(`# ${PLATFORM_LABELS[r.platform] || ''}图文种草文稿`, '')
    if (r.requirementSummary) lines.push('## 需求汇总', r.requirementSummary, '')
    if (r.coverTitles && r.coverTitles.length) {
      lines.push('## 封面/标题', ...r.coverTitles.map((x, i) => `${i + 1}. ${x}`), '')
    }
    if (r.openingParagraph) lines.push('## 开篇', r.openingParagraph, '')
    if (r.bodySections && r.bodySections.length) {
      lines.push('## 正文')
      r.bodySections.forEach((s) => {
        if (s.heading) lines.push(`### ${s.heading}`)
        if (s.content) lines.push(s.content, '')
      })
    }
    if (r.closingParagraph) lines.push('## 结尾', r.closingParagraph, '')
    if (r.fullCopy) lines.push('## 完整文稿', r.fullCopy, '')
  } else {
    lines.push(`# ${PLATFORM_LABELS[r.platform] || ''}爆款 Brief`, '')
    if (r.requirementSummary) lines.push('## 一、需求汇总', r.requirementSummary, '')
    if (r.unifiedSolutions.length) {
      lines.push('## 二、解决方案')
      r.unifiedSolutions.forEach((s, i) => lines.push(`${i + 1}. ${s.title}：${s.desc}`))
      lines.push('')
    }
    if (r.hooks.length) lines.push('## 三、爆款钩子', ...r.hooks.map((x, i) => `${i + 1}. ${x}`), '')
    if (r.titles.length) lines.push('## 四、标题 / 封面', ...r.titles.map((x, i) => `${i + 1}. ${x}`), '')
    if (r.structure.length) {
      lines.push('## 五、内容结构 / 分镜')
      r.structure.forEach((sc, i) => {
        lines.push(`镜头 ${i + 1}：${sc.scene}`, `画面：${sc.visual}`, `口播：${sc.voice}`)
        if (sc.subtitle) lines.push(`字幕：${sc.subtitle}`)
        lines.push('')
      })
    }
    if (r.mustMention.length) lines.push('## 六、必提卖点', ...r.mustMention.map((x) => `- ${x}`), '')
    if (r.forbidden.length) lines.push('## 七、禁忌事项', ...r.forbidden.map((x) => `- ${x}`), '')
    if (r.topics.length) lines.push('## 八、话题 / 标签', r.topics.join(' '), '')
  }
  if (r.checklist.length) lines.push('## 发布前自检', ...r.checklist.map((x) => `- ${x}`), '')
  return lines.join('\n').trim()
}

function formatBriefUserError(msg) {
  let s = String(msg || '').trim()
  s = s.replace(/^上游模型调用失败[：:]\s*/i, '')
  if (/超时|aborted|timeout/i.test(s)) {
    return '文案生成超时，请稍后重试；若多次失败请联系管理员检查 AI 配置。'
  }
  if (/权益|套餐|暂不可用|模型配置/i.test(s)) {
    return '文案模型暂不可用，请稍后重试或联系管理员检查模型配置。'
  }
  if (/未配置|NEED_VENDOR_KEY|缺少.*凭据|api key/i.test(s)) {
    return '请先在系统设置中完成 AI 模型配置。'
  }
  return s || '文案生成失败，请稍后重试。'
}

async function generateViralBriefText(args) {
  const platform = args.platform || 'douyin'
  const style = args.style || 'review'
  const source = args.source || {}
  const extraHint = String(args.extraHint || '').trim()
  const plat = PLATFORM_LABELS[platform] || '抖音'
  const styleLabel = STYLE_LABELS[style] || style
  const sourceTitle = String(source.title || '').trim() || '商家需求'
  const requirementSummary = buildRequirementSummary(source, extraHint)
  const ctx = [
    `门店/标题：${source.title || '—'}`,
    `区域：${source.region || '—'}`,
    `品类：${source.category || '—'}`,
    extraHint ? `补充要点：${extraHint}` : '',
    '',
    String(source.content || '').trim() || '（需求描述为空，请结合标题与品类发挥）',
  ]
    .filter(Boolean)
    .join('\n')
  const copyMode = isCopyManuscriptPlatform(platform)
  const jsonOnly = '只输出合法 JSON，不要 markdown 代码块以外的解释。'
  const briefPrompt = copyMode
    ? [
        jsonOnly,
        `你是${plat}图文种草爆款文案总监。风格：${styleLabel}。`,
        `基于下列商家需求汇总，输出${plat}达人可直接发布的图文种草文稿 JSON（禁止视频分镜/口播/镜头字段）：`,
        `{`,
        `  "requirementSummary": "可沿用或精炼",`,
        `  "unifiedSolutions": [{"title":"","desc":""}],`,
        `  "coverTitles": ["笔记标题/封面文案1", "...共5条"],`,
        `  "openingParagraph": "开篇钩子段落 80～150字",`,
        `  "bodySections": [{"heading":"小标题","content":"正文段落150～300字"}],`,
        `  "closingParagraph": "结尾互动与行动号召",`,
        `  "fullCopy": "完整可发布文稿（含标题+正文，800～1500字，分段换行）",`,
        `  "mustMention": ["必提卖点"],`,
        `  "forbidden": ["禁忌/合规"],`,
        `  "topics": ["#话题1","SEO关键词2"],`,
        `  "checklist": ["发布前自检项"]`,
        `}`,
        platform === 'xiaohongshu'
          ? '小红书文稿：真实体验感、emoji 适度、分段清晰、适合笔记阅读；标题要有搜索关键词。'
          : '大众点评文稿：消费体验细节、星级评价感、菜品/服务描述、收藏打卡与团购引导语气。',
        styleBriefHint(style),
        '',
        `【需求汇总】\n${requirementSummary}`,
        '',
        `【商家需求】\n${ctx}`,
      ]
        .filter(Boolean)
        .join('\n')
    : [
        jsonOnly,
        `你是${plat}爆款内容总监。风格：${styleLabel}。`,
        `基于下列商家需求汇总，输出${plat}达人可执行的爆款 Brief JSON（字段齐全，数组至少 3 项）：`,
        `{`,
        `  "requirementSummary": "可沿用或精炼",`,
        `  "unifiedSolutions": [{"title":"","desc":""}],`,
        `  "hooks": ["前3秒钩子1","钩子2","钩子3"],`,
        `  "titles": ["标题/封面文案1", "...共5条"],`,
        `  "structure": [{"scene":"段落名","visual":"画面","voice":"口播","subtitle":"字幕"}],`,
        `  "mustMention": ["必提卖点"],`,
        `  "forbidden": ["禁忌/合规"],`,
        `  "topics": ["#话题1","关键词2"],`,
        `  "roles": {"talent":"达人要点","shoot":"拍摄要点","edit":"剪辑要点"},`,
        `  "checklist": ["审片必达项"]`,
        `}`,
        platformBriefHint(platform),
        styleBriefHint(style),
        '',
        `【需求汇总】\n${requirementSummary}`,
        '',
        `【商家需求】\n${ctx}`,
      ]
        .filter(Boolean)
        .join('\n')

  const res = await vs.postAiChat(
    [
      { role: 'system', content: '你是爆款 Brief 生成器。只输出合法 JSON 对象。' },
      { role: 'user', content: briefPrompt },
    ],
    { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.45 },
  )
  if (!res.ok) {
    return { ok: false, message: formatBriefUserError(res.message) }
  }
  const parsed = extractJson(res.content)
  const result = normalizeResult(parsed, { platform, style }, requirementSummary, copyMode, res.content)
  result.fullMarkdown = resultToMarkdown(result)
  if (
    !result.requirementSummary &&
    !result.fullCopy &&
    !result.hooks.length &&
    !result.titles.length &&
    !result.structure.length
  ) {
    return { ok: false, message: '文案生成失败，请稍后重试。' }
  }
  return { ok: true, result, sourceTitle }
}

module.exports = {
  STYLE_OPTIONS,
  PLATFORM_OPTIONS,
  isCopyManuscriptPlatform,
  generateViralBriefText,
  resultToMarkdown,
  formatBriefUserError,
  PLATFORM_LABELS,
}

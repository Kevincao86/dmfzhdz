/**
 * 智能体执行流（与 Web aiAgentActionParse + aiAgentExecutionFlow 对齐的精简版）
 */

const TASK_LABELS = {
  create_product: '创建商品',
  recruit_influencer: '招募达人',
  handle_review: '处理评价',
  sync_platform: '同步平台',
  analyze_exception: '分析异常',
  generate_copywriting: '推广文案',
  file_tax: '一键报税',
}

function stripQuote(text) {
  return String(text || '')
    .replace(/\[引用[\s\S]*?\n\n/, '')
    .trim()
}

function inferTaskTypeFromText(t) {
  const x = stripQuote(t)
  if (/创建|商品|套餐|上架|团购|代金券|组品/.test(x)) return 'create_product'
  if (/达人|招募|探店|brief|种草/.test(x)) return 'recruit_influencer'
  if (/差评|评价|评论/.test(x)) return 'handle_review'
  if (/分析|原因|异常/.test(x)) return 'analyze_exception'
  if (/同步|失败/.test(x)) return 'sync_platform'
  if (/文案|推广/.test(x)) return 'generate_copywriting'
  if (/报税|税务/.test(x)) return 'file_tax'
  return undefined
}

function isPlanDesignQuery(text) {
  const x = stripQuote(text)
  if (/确认执行|开始创建|立即上架|按方案执行/.test(x)) return false
  return /规划|方案|活动安排|组品|达人合作|营销策略|推广计划|抖音推广|推广活动|帮我规划|帮我设计/.test(x)
}

function isExplicitExecutionIntent(text) {
  const x = stripQuote(text)
  return /确认执行|按.*方案执行|开始创建|立即上架|需要执行|同意执行|执行方案|确认创建|帮我执行|按上述方案|确认创建商品套餐|确认发布达人招募/.test(
    x,
  )
}

function tryParseJsonObject(raw) {
  const t = String(raw || '').trim()
  const candidates = []
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/gi)
  if (fence) {
    for (const f of fence) {
      const m = f.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (m && m[1]) candidates.push(m[1].trim())
    }
  }
  const brace = t.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  for (const s of candidates) {
    try {
      const j = JSON.parse(s)
      if (j && typeof j === 'object' && !Array.isArray(j)) return j
    } catch (_) {}
  }
  return null
}

function parseAgentActionType(content) {
  const j = tryParseJsonObject(content)
  if (!j) return undefined
  const at = String(j.actionType || j.action_type || '').trim()
  if (at === 'create_product' || at === 'create_product_batch') return 'create_product'
  if (at === 'recruit_influencer' || at === 'recruit_talents') return 'recruit_influencer'
  return undefined
}

function looksLikePlanDocument(content) {
  const c = String(content || '').slice(0, 5000)
  if (parseAgentActionType(c)) return false
  if (c.length < 120) return false
  if (/活动安排|套餐搭配|组品|达人合作|推广策略|商品套餐|内容营销/.test(c)) return true
  if (/^#{1,4}\s/m.test(c) && c.length > 200) return true
  return false
}

function inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType) {
  const types = new Set()
  const agentAction = assistantContent ? parseAgentActionType(assistantContent) : undefined
  if (agentAction) return [agentAction]

  const userType = inferTaskTypeFromText(userText)
  if (userType) types.add(userType)

  if (assistantContent && looksLikePlanDocument(assistantContent)) {
    const c = assistantContent
    if (/商品|套餐|组品|团购|上架|代金券/.test(c)) types.add('create_product')
    if (/达人|招募|探店|种草|KOL|网红|达人合作/.test(c)) types.add('recruit_influencer')
  }

  if (explicitTaskType && !types.size) types.add(explicitTaskType)
  return [...types]
}

function hasCombinedProductAndRecruitPlan(userText, assistantContent, explicitTaskType) {
  const types = inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType)
  return types.includes('create_product') && types.includes('recruit_influencer')
}

function shouldDeferTaskPreview(userText, assistantContent, explicitTaskType) {
  if (hasCombinedProductAndRecruitPlan(userText, assistantContent, explicitTaskType)) return true
  if (assistantContent && tryParseJsonObject(assistantContent)?.confirmRequired === true) return true
  if (parseAgentActionType(assistantContent || '')) return false
  if (isExplicitExecutionIntent(userText)) return false
  if (isPlanDesignQuery(userText)) return true
  if (assistantContent && looksLikePlanDocument(assistantContent)) return true
  return false
}

function buildPlanExecutionConsultation(taskTypes) {
  const filtered = (taskTypes || []).filter((t) => TASK_LABELS[t])
  if (!filtered.length) return ''
  const labels = filtered.map((t) => TASK_LABELS[t])
  if (filtered.length === 1) {
    return `\n\n——\n\n若需要我按上述方案执行「${labels[0]}」，请回复「确认执行」。`
  }
  return `\n\n——\n\n若需要我按上述方案执行，请回复「确认执行」。\n将为 ${filtered.length} 项场景（${labels.join('、')}）分别生成独立预览卡片，您可在各卡片内单独确认。`
}

function formatAssistantDisplayText(content) {
  let s = String(content || '')
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  s = s.replace(/```(?:json)?\s*[\s\S]*?```/gi, '')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

function parsePlanIntentLabels(assistantContent) {
  const c = String(assistantContent || '')
  const labels = []
  const re = /(?:^|\n)\s*(?:\d+[.、]\s*)?(?:#{1,4}\s*)?([^\n：:]{2,24}(?:套餐|代金券|团购|方案))[^\n]*/gim
  let m
  while ((m = re.exec(c)) && labels.length < 6) {
    const label = String(m[1] || '').trim()
    if (label && !labels.includes(label)) labels.push(label)
  }
  const priceRe = /(\d+(?:\.\d+)?)\s*元[^\n]{0,20}(?:套餐|餐|券|团购)/g
  while ((m = priceRe.exec(c)) && labels.length < 6) {
    const label = m[0].replace(/\s+/g, '').slice(0, 24)
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

function createAgentExecutionState() {
  return { stage: 'idle', plan: null }
}

function storeDeferredPlan(state, userBrief, assistantContent, taskTypes) {
  const filtered = (taskTypes || []).filter((t) => TASK_LABELS[t])
  if (!filtered.length) return state
  if (state.stage !== 'idle' && state.stage !== 'awaiting_execute_confirm') return state
  return {
    stage: 'awaiting_execute_confirm',
    plan: { userBrief, assistantContent, taskTypes: filtered },
  }
}

function buildCombinedBrief(plan) {
  if (!plan) return ''
  return plan.assistantContent
    ? `${plan.userBrief}\n\n【方案要点】\n${plan.assistantContent.slice(0, 3500)}`
    : plan.userBrief
}

module.exports = {
  TASK_LABELS,
  inferTaskTypeFromText,
  isPlanDesignQuery,
  isExplicitExecutionIntent,
  inferTaskTypesFromCombinedContext,
  shouldDeferTaskPreview,
  buildPlanExecutionConsultation,
  formatAssistantDisplayText,
  parsePlanIntentLabels,
  createAgentExecutionState,
  storeDeferredPlan,
  buildCombinedBrief,
}

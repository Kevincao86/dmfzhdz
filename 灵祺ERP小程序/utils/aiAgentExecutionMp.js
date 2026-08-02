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

function isAgentShortcutTaskLine(text) {
  return /^使用快捷任务：/.test(stripQuote(text))
}

function isInformationalOnlyQuery(text) {
  const x = stripQuote(text)
  if (!x) return false
  if (isAgentShortcutTaskLine(x) || isExplicitExecutionIntent(x)) return false
  if (/ICP|EDI|备案|资质|许可证|托管协议|域名证书|通信管理局|增值电信|经营性|非经营性|电信业务/.test(x)) {
    return true
  }
  if (
    /(?:是否|是不是|要不要|需不需要|有没有必要|应该选择|选哪个|怎么选|如何选择|有什么区别|区别是|哪个更|还是做|抑或)/.test(
      x,
    ) &&
    !/(?:创建|上架|组品|上传|发布|帮我做|帮我上|立即|确认执行|开始创建)/.test(x)
  ) {
    return true
  }
  if (
    /^(?:请问|帮我看|了解一下|想知道|咨询一下|咨询|想了解|能否解释|解释一下)/.test(x) &&
    !/(?:创建|上架|组品|上传|发布|帮我做|帮我上|立即|确认执行|开始创建)/.test(x)
  ) {
    return true
  }
  return false
}

function inferTaskTypeFromText(t) {
  const x = stripQuote(t)
  if (isInformationalOnlyQuery(x)) return undefined
  if (
    /创建|上架|组品|上传.*(商品|套餐|券)|发布.*(?:商品|套餐|团购)|帮我.*(?:上架|创建|组品)|做(?:一|个).*(?:商品|套餐|团购)/.test(
      x,
    ) ||
    (/团购|套餐|代金券|商品/.test(x) && /帮我|我要|需要|请|想要|打算|准备|立即|马上/.test(x))
  ) {
    return 'create_product'
  }
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
  if (
    at === 'recruit_influencer' ||
    at === 'recruit_talents' ||
    at === 'create_recruitment'
  )
    return 'recruit_influencer'
  if (
    at === 'generate_copywriting' ||
    at === 'analyze_exception' ||
    at === 'sync_platform' ||
    at === 'handle_review' ||
    at === 'optimize_local_ads' ||
    at === 'follow_local_lead' ||
    at === 'file_tax'
  ) {
    return at
  }
  return undefined
}

function collectAgentActionTypes(content) {
  const found = new Set()
  const c = String(content || '')
  for (const re of [/\"actionType\"\s*:\s*\"([^\"]+)\"/gi, /\"action_type\"\s*:\s*\"([^\"]+)\"/gi]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(c)) !== null) {
      const t = parseAgentActionType(`{"actionType":"${m[1]}"}`)
      if (t) found.add(t)
    }
  }
  const single = parseAgentActionType(c)
  if (single) found.add(single)
  return [...found]
}

function looksLikePlanDocument(content) {
  const c = String(content || '').slice(0, 5000)
  if (parseAgentActionType(c)) return false
  if (c.length < 120) return false
  if (/活动安排|套餐搭配|组品|达人合作|推广策略|商品套餐|内容营销/.test(c)) return true
  if (/^#{1,4}\s/m.test(c) && c.length > 200) return true
  return false
}

function isPlanOrNineScenarioQuery(text) {
  const x = stripQuote(text)
  if (!x) return false
  if (isAgentShortcutTaskLine(x)) return true
  if (/9\s*大\s*场景|九大场景|九\s*大/.test(x)) return true
  if (/方案/.test(x)) return true
  return isPlanDesignQuery(x)
}

function inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType) {
  const types = new Set()
  const planIntent = isPlanOrNineScenarioQuery(userText) && !isInformationalOnlyQuery(userText)
  if (assistantContent && planIntent) {
    for (const t of collectAgentActionTypes(assistantContent)) types.add(t)
    const c = assistantContent
    if (/商品|套餐|组品|团购|上架|代金券/.test(c)) types.add('create_product')
    if (/达人|招募|探店|种草|KOL|网红|达人合作|brief|Brief|create_recruitment/.test(c))
      types.add('recruit_influencer')
  }

  const userType = inferTaskTypeFromText(userText)
  if (userType) types.add(userType)

  if (explicitTaskType && (isAgentShortcutTaskLine(userText) || planIntent)) types.add(explicitTaskType)
  return [...types]
}

function hasCombinedProductAndRecruitPlan(userText, assistantContent, explicitTaskType) {
  const types = inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType)
  return types.includes('create_product') && types.includes('recruit_influencer')
}

function shouldDeferTaskPreview(userText, assistantContent, explicitTaskType) {
  if (isAgentShortcutTaskLine(userText)) return false
  if (isExplicitExecutionIntent(userText)) return false
  if (isInformationalOnlyQuery(userText)) return true
  if (inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType).length > 0) {
    return true
  }
  if (hasCombinedProductAndRecruitPlan(userText, assistantContent, explicitTaskType)) return true
  if (assistantContent && tryParseJsonObject(assistantContent)?.confirmRequired === true) return true
  if (isPlanOrNineScenarioQuery(userText)) return true
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

const AGENT_MACHINE_JSON_HINT =
  /"(?:confirmRequired|confirm_required|actionType|action_type|originalId|stepId|requiredPermissions|riskLevel|previewSteps)"/

function looksLikeAgentMachineJson(slice) {
  return AGENT_MACHINE_JSON_HINT.test(slice)
}

/** 去掉供系统解析的预览 JSON（英文键），避免气泡出现乱码 */
function stripAgentMachineJsonFromDisplay(content) {
  let s = String(content || '')
  s = s.replace(/```(?:json)?\s*[\s\S]*?```/gi, '\n')
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] !== '{') {
      out += s[i]
      i += 1
      continue
    }
    let depth = 0
    let j = i
    let inStr = false
    let esc = false
    for (; j < s.length; j += 1) {
      const ch = s[j]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') {
        inStr = true
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          j += 1
          break
        }
      }
    }
    const slice = s.slice(i, j)
    if (looksLikeAgentMachineJson(slice)) {
      i = j
      if (out && !/\s$/.test(out)) out += '\n'
      continue
    }
    out += slice
    i = j
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

function summarizeAssistantContent(content) {
  const taskType = parseAgentActionType(content)
  if (!taskType) return null
  const labels = {
    create_product: '已理解您的上架需求，请在下方核对预览并确认。',
    recruit_influencer: '已理解您的达人招募需求，请在下方查看 Brief 并确认。',
    file_tax: '已理解您的报税需求，请在下方核对后确认。',
    generate_copywriting: '已准备推广文案方案，请在下方确认后继续。',
    analyze_exception: '已完成异常诊断，请查看下方结论与待办。',
    sync_platform: '已整理平台同步方案，请在下方确认后继续。',
    handle_review: '已准备评价处理方案，请在下方确认后继续。',
    optimize_local_ads: '已准备本地推优化方案，请在下方确认后继续。',
    follow_local_lead: '已准备线索跟进方案，请在下方确认后继续。',
  }
  return labels[taskType] || '请在下方确认执行预览后继续。'
}

function formatAssistantDisplayText(content) {
  const summary = summarizeAssistantContent(content)
  let s = String(content || '')
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  s = stripAgentMachineJsonFromDisplay(s)
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  if (!s && summary) return summary
  if (AGENT_MACHINE_JSON_HINT.test(s) || /"originalId"\s*:/.test(s)) {
    return summary || '方案已就绪，请在下方预览卡片中确认后继续（详情不再以代码形式展示）。'
  }
  return s
}

function parsePlanIntentLabels(assistantContent) {
  const c = String(assistantContent || '')
  const labels = []
  const seen = new Set()

  function push(label) {
    const s = String(label || '').replace(/\*\*/g, '').trim().slice(0, 48)
    if (s.length < 2 || seen.has(s) || /优惠券设计|达人招募|直播安排|费用分配/.test(s)) return
    seen.add(s)
    labels.push(s)
  }

  const numberedTag =
    /(?:^|\n)\s*(?:\d+[.、]|[-•]\s*)?\*{0,2}((?:主推爆款|套餐组合|限时折扣|爆款套餐|组合套餐|引流套餐|福利套餐|加购套餐|次推套餐|形象套餐)[^*\n：:]{0,10})\*{0,2}[：:]\s*\*{0,2}([^*\n*]{2,56})\*{0,2}/gi
  let m
  while ((m = numberedTag.exec(c)) && labels.length < 6) {
    const tag = String(m[1] || '').trim()
    const name = String(m[2] || '').trim()
    if (/优惠券|达人|直播|招募/.test(tag)) continue
    push(name && tag ? `${tag} · ${name}` : name || tag)
  }

  if (labels.length < 2) {
    const generic =
      /(?:^|\n)\s*(\d+)[.、]\s*\*{0,2}([^*\n：:]{2,20})\*{0,2}[：:]\s*\*{0,2}([^*\n*]{2,56})\*{0,2}/g
    while ((m = generic.exec(c)) && labels.length < 6) {
      const tag = String(m[2] || '').trim()
      const name = String(m[3] || '').trim()
      if (/优惠券|达人|直播|招募/.test(tag)) continue
      push(name && tag ? `${tag} · ${name}` : name || tag)
    }
  }

  const re = /(?:^|\n)\s*(?:\d+[.、]\s*)?(?:#{1,4}\s*)?([^\n：:]{2,24}(?:套餐|代金券|团购|方案|套装|组合))[^\n]*/gim
  while ((m = re.exec(c)) && labels.length < 6) {
    push(m[1])
  }

  const priceRe = /(\d+(?:\.\d+)?)\s*元[^\n]{0,20}(?:套餐|餐|券|团购)/g
  while ((m = priceRe.exec(c)) && labels.length < 6) {
    push(m[0].replace(/\s+/g, '').slice(0, 24))
  }

  return labels
}

function createAgentExecutionState() {
  return { stage: 'idle', plan: null }
}

function canAcceptDeferredPlan(state) {
  return state.stage === 'idle' || state.stage === 'awaiting_execute_confirm'
}

function storeDeferredPlan(state, userBrief, assistantContent, taskTypes) {
  const filtered = (taskTypes || []).filter((t) => TASK_LABELS[t])
  if (!filtered.length) return state
  if (!canAcceptDeferredPlan(state)) return state
  return {
    stage: 'awaiting_execute_confirm',
    plan: { userBrief, assistantContent, taskTypes: filtered },
  }
}

function markPreviewsActive(state) {
  return Object.assign({}, state, { stage: 'previews_active' })
}

function isPendingPreviewMessage(m) {
  return m && m.role === 'task_preview' && (m.previewStatus || 'pending') === 'pending'
}

function hasPendingPreviewForTask(messages, taskType) {
  return (messages || []).some(
    (m) => isPendingPreviewMessage(m) && m.preview && m.preview.taskType === taskType,
  )
}

function hasConfirmedPreviewForTask(messages, taskType) {
  return (messages || []).some(
    (m) =>
      m &&
      m.role === 'task_preview' &&
      m.previewStatus === 'confirmed' &&
      m.preview &&
      m.preview.taskType === taskType,
  )
}

/** 计划中尚未展示待确认预览的场景 */
function taskTypesNeedingPreview(plan, messages) {
  if (!plan || !plan.taskTypes) return []
  return plan.taskTypes.filter((t) => !hasPendingPreviewForTask(messages, t))
}

/** 组合方案并行生成各自独立预览卡片 */
function taskTypesForNextPreviewBatch(plan, messages) {
  return taskTypesNeedingPreview(plan, messages)
}

function syncStageAfterPreviewChange(state, messages) {
  const hasPending = (messages || []).some((m) => isPendingPreviewMessage(m))
  if (hasPending) return markPreviewsActive(state)
  const plan = state.plan
  if (!plan) return state
  const allConfirmed = plan.taskTypes.every((t) => hasConfirmedPreviewForTask(messages, t))
  if (allConfirmed) return { stage: 'idle', plan: null }
  if (state.stage === 'previews_active' || state.stage === 'awaiting_execute_confirm') {
    return { stage: 'awaiting_execute_confirm', plan }
  }
  return state
}

function isRecruitExecutionIntent(text) {
  return /确认执行达人招募|确认发布达人招募|执行达人招募|达人招募流程也发|发一下达人招募/.test(
    stripQuote(text),
  )
}

function recoverPlanFromMessages(messages) {
  const list = messages || []
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (!m || m.role !== 'assistant') continue
    const content = String(m.content || '')
    if (!looksLikePlanDocument(content)) continue
    let userBrief = ''
    for (let j = i - 1; j >= 0; j--) {
      if (list[j] && list[j].role === 'user') {
        userBrief = stripQuote(list[j].content || '')
        break
      }
    }
    const taskTypes = inferTaskTypesFromCombinedContext(userBrief, content, undefined)
    if (!taskTypes.length) continue
    return { userBrief, assistantContent: content, taskTypes }
  }
  return null
}

function resolveExecutionUserMessage(state, messages, strippedLine) {
  let plan = state.plan
  if (!plan && (isExplicitExecutionIntent(strippedLine) || isRecruitExecutionIntent(strippedLine))) {
    plan = recoverPlanFromMessages(messages)
    if (plan) state = storeDeferredPlan(state, plan.userBrief, plan.assistantContent, plan.taskTypes)
  }

  if (
    (state.stage === 'awaiting_execute_confirm' || state.stage === 'previews_active') &&
    plan &&
    (isExplicitExecutionIntent(strippedLine) || isRecruitExecutionIntent(strippedLine))
  ) {
    let taskTypes = taskTypesForNextPreviewBatch(plan, messages)
    if (isRecruitExecutionIntent(strippedLine) && plan.taskTypes.includes('recruit_influencer')) {
      if (!hasPendingPreviewForTask(messages, 'recruit_influencer')) {
        taskTypes = ['recruit_influencer']
      }
    }
    if (!taskTypes.length) {
      return {
        state,
        action: 'none',
        assistantLine: '当前方案下的场景预览已在对话中展示，请分别在对应卡片确认或修改。',
      }
    }
    return {
      state: markPreviewsActive(state),
      action: 'spawn_previews',
      plan,
      taskTypes,
      assistantLine:
        taskTypes.length > 1
          ? `好的，将为 ${taskTypes.length} 项场景生成独立预览，请分别在各自卡片确认。`
          : taskTypes[0] === 'recruit_influencer'
            ? '好的，正在生成达人招募 Brief 预览…'
            : '好的，正在生成执行预览…',
    }
  }

  return { state, action: 'none' }
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
  isRecruitExecutionIntent,
  inferTaskTypesFromCombinedContext,
  hasCombinedProductAndRecruitPlan,
  shouldDeferTaskPreview,
  buildPlanExecutionConsultation,
  formatAssistantDisplayText,
  parsePlanIntentLabels,
  createAgentExecutionState,
  canAcceptDeferredPlan,
  storeDeferredPlan,
  markPreviewsActive,
  hasPendingPreviewForTask,
  hasConfirmedPreviewForTask,
  taskTypesNeedingPreview,
  taskTypesForNextPreviewBatch,
  syncStageAfterPreviewChange,
  recoverPlanFromMessages,
  resolveExecutionUserMessage,
  buildCombinedBrief,
}

const config = require('./config.js')
const api = require('./api.js')
const devAuth = require('./devAuth.js')
const registry = require('./aiModelRegistryMp.js')
const merchantIntelMp = require('./merchantIntelMp.js')
const exec = require('./aiAgentExecutionMp.js')
const previewMp = require('./aiAgentPreviewMp.js')
const platformBindingsMp = require('./platformBindingsMp.js')
const habitsMp = require('./agentUserHabitsMp.js')
const stateCloudMp = require('./agentUserStateCloudMp.js')
const sessionSync = require('./merchantSessionSyncMp.js')

const AI_AGENT_SYSTEM_PROMPT = `你是「经营助手」，嵌入灵祺商家 ERP，同时也是开放型通用对话助手（与电脑端商家后台助手同源规则）。

【开放对话】用户可以询问任何类型的问题，均须正常、完整、友好地作答；不要以「只能帮商家经营」等理由拒绝。若缺少实时外部数据，说明限制并给出查法或常识参考，仍应尽力回答。

【ERP 专有能力】仅当用户主动提出经营、商品、达人、报税等相关需求时：涉及创建、修改、发布等写操作须先输出执行预览 JSON（供系统解析，含 actionType、confirmRequired: true），不得直接执行；用户确认前不要假设写操作已完成。

【展示铁律】给用户看的正文必须是通顺中文；禁止在对话气泡展示英文键名或机器 JSON（如 actionType、confirmRequired、originalId、stepId）。用户可见部分只用中文说明「请确认下方预览」。

【九大场景工作流】create_product、recruit_influencer、handle_review、optimize_local_ads、follow_local_lead、sync_platform、analyze_exception、generate_copywriting、file_tax。用户通过快捷任务进入时须按场景推进；分析异常可作为路由中枢，按根因衔接到对应场景。

【分析异常 · analyze_exception】
1) 先根据上下文「已绑定平台」清单：只分析已绑定平台；未绑定平台必须写「跳过」，禁止编造。
2) 按维度诊断（有数据给结论，无数据标明缺口）：组品、价格、毛利、评价、销量、客群分析、竞争对手分析、Geo 优化分析；可附带同步/审核等技术异常。
3) 输出修复 Todo 并映射下游场景；需要写操作时再给预览 JSON（confirmRequired: true）。
4) 禁止只列笼统「六大故障」而不做绑定过滤与维度诊断。`

const AI_AGENT_SHORTCUTS = [
  { type: 'create_product', label: '创建商品', prompt: '我想创建一个新的团购商品，请告诉我需要准备哪些信息' },
  { type: 'recruit_influencer', label: '招募达人', prompt: '我想发起达人探店招募，需要准备哪些信息' },
  { type: 'handle_review', label: '处理评价', prompt: '有一条差评需要回复，请给回复思路' },
  { type: 'optimize_local_ads', label: '优化本地推', prompt: '本地推投放预算怎么拆比较合理' },
  { type: 'follow_local_lead', label: '跟进线索', prompt: '帮我整理本地推线索跟进的要点' },
  { type: 'sync_platform', label: '同步平台', prompt: '商品同步失败可能有哪些原因' },
  {
    type: 'analyze_exception',
    label: '分析异常',
    prompt:
      '进入【分析异常】：请先根据我账号已绑定平台做诊断（未绑定平台跳过）；按组品、价格、毛利、评价、销量、客群分析、竞争对手分析、Geo 优化分析等维度给出结论与修复 Todo。',
  },
  { type: 'generate_copywriting', label: '生成推广文案', prompt: '帮我写一段探店推广文案（多平台标题/短描述/话题标签）' },
  { type: 'file_tax', label: '一键报税', prompt: '本月报税需要准备哪些数据和步骤' },
]

/** 与 CS aiAgentPlan.shortcutsForPlan 对齐 */
function shortcutsForPlan(plan) {
  const blocked = new Set()
  if (plan === 'free') {
    blocked.add('file_tax')
    blocked.add('optimize_local_ads')
    blocked.add('follow_local_lead')
  }
  return AI_AGENT_SHORTCUTS.filter((s) => !blocked.has(s.type))
}

function membershipAllowsAiTask(plan, task) {
  if (plan === 'free' && task === 'file_tax') return false
  if (plan === 'free' && (task === 'optimize_local_ads' || task === 'follow_local_lead')) return false
  return true
}

const STORAGE_KEY_BASE = 'meoo_agent_thread_v2'
const THREAD_UID_KEY = '_meoo_agent_thread_uid'
const MAX_ATTACH = 8

/** @type {string | null} */
let currentUserId = null

function setCurrentUserId(userId) {
  currentUserId = userId && String(userId).trim() ? String(userId).trim() : null
  try {
    if (currentUserId) wx.setStorageSync(THREAD_UID_KEY, currentUserId)
    else wx.removeStorageSync(THREAD_UID_KEY)
  } catch (_) {}
}

function getCurrentUserId() {
  if (currentUserId) return currentUserId
  try {
    const raw = wx.getStorageSync(THREAD_UID_KEY)
    return raw && String(raw).trim() ? String(raw).trim() : null
  } catch (_) {
    return null
  }
}

function threadStorageKey() {
  let tid = ''
  try {
    tid = String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {}
  const uid = getCurrentUserId()
  if (tid && uid) return `${STORAGE_KEY_BASE}@${tid}_${uid}`
  if (tid) return `${STORAGE_KEY_BASE}@${tid}`
  return STORAGE_KEY_BASE
}

function apiBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function inferTaskTypeFromText(t) {
  return exec.inferTaskTypeFromText(t) || undefined
}

function detectImageGenerationIntent(t) {
  return /生图|画图|生成.*图|海报|封面|文生图|图生图/.test(String(t || ''))
}

function resolveImagePickerKey(chatPickerKey, options, userLine, hasImages) {
  if (registry.isAgentImagePickerKey(chatPickerKey)) return chatPickerKey
  if (!hasImages && !detectImageGenerationIntent(userLine)) return chatPickerKey
  const parsed = registry.parseAiModelPickerKey(chatPickerKey)
  if (parsed && parsed.provider === 'doubao') return 'img::v::doubao'
  if (parsed && parsed.provider === 'qwen') return 'img::v::qwen'
  if (parsed && parsed.provider === 'minimax') return 'img::v::minimax'
  return 'img::v::auto'
}

function agentNativeImageRouteFromPickerKey(key) {
  const p = registry.parseAgentImagePickerKey(key)
  if (p && p.kind === 'style') return { route: 'tokenmix', tokenmixImageModel: p.modelId }
  if (p && p.kind === 'vendor' && p.vendor !== 'auto') {
    return { route: 'builtin', preferredVendor: p.vendor }
  }
  return { route: 'builtin' }
}

function loadThread() {
  try {
    const raw = wx.getStorageSync(threadStorageKey())
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveThread(messages) {
  const slice = messages.slice(-40)
  try {
    wx.setStorageSync(threadStorageKey(), JSON.stringify(slice))
  } catch (_) {}
  const uid = getCurrentUserId()
  if (uid) {
    const habits = habitsMp.loadAgentUserHabits(uid)
    stateCloudMp.schedulePushAgentUserState({ habits, thread: slice })
  }
}

function clearThread() {
  try {
    wx.removeStorageSync(threadStorageKey())
  } catch (_) {}
  const uid = getCurrentUserId()
  if (uid) {
    stateCloudMp.schedulePushAgentUserState({
      habits: habitsMp.loadAgentUserHabits(uid),
      thread: [],
    })
  }
}

async function syncAgentStateFromCloud() {
  const uid = getCurrentUserId()
  if (!uid) return null
  const data = await stateCloudMp.pullAgentUserState()
  if (!data) return null
  if (data.habits) habitsMp.applyCloudHabits(uid, data.habits)
  if (Array.isArray(data.thread) && data.thread.length) {
    try {
      wx.setStorageSync(threadStorageKey(), JSON.stringify(data.thread.slice(-40)))
    } catch (_) {}
  }
  return data
}

function devMockReply(userText) {
  const t = String(userText || '').trim()
  if (/商品|上架|团购/.test(t)) {
    return '建议：「功能 → 商品 → 新建商品」先选团购/外卖与平台再走类目流程。'
  }
  if (/招募|达人/.test(t))
    return '打开「功能 → 运营 → 达人招募」进入与电脑端一致的五步流程；订单列表请点击「查看达人订单」。'
  if (/评论|差评/.test(t)) return '请打开「功能 → 运营 → 评论管理」。'
  if (/投流|广告/.test(t)) return '请打开「功能 → 投流 → 投流管理」。'
  if (/方案|规划|推广|活动|618|抖音/.test(t)) {
    return (
      '（开发预览）活动方案等内容需走后端服务。\n\n' +
      '请：\n' +
      '1. utils/config.local.js：MERCHANT_API_BASE_URL=http://127.0.0.1:5173（真机预览改为电脑的局域网 IP:5173）\n' +
      '2. 电脑 cd web版/merchant-erp 并 npm run dev\n' +
      '3.（二选一）在「我的」登录；或未登录时在 ERP 目录 .env.local 设 MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED=1（仅本地，生产勿开）并配置 MERCHANT_AI_QWEN_KEY 等后重启 dev\n' +
      '4. 微信开发者工具：详情→本地设置→勾选「不校验合法域名...」'
    )
  }
  return (
    '（开发预览）未联调后端。请复制 config.local.example.js 为 utils/config.local.js，至少设置 MERCHANT_API_BASE_URL，并按上一条说明启动 ERP（或登录后使用云端地址）。'
  )
}

function readFileDataUrl(filePath, mime) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        const m = mime || 'image/jpeg'
        resolve(`data:${m};base64,${res.data || ''}`)
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '读取文件失败'))
      },
    })
  })
}

function authHeaders() {
  const token = api.getBearerToken()
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token && token !== devAuth.DEV_TOKEN) h.Authorization = `Bearer ${token}`
  return h
}

function ensureRealAuthForAi() {
  if (api.isRealAuthed()) return
  throw new Error('请先登录后再使用经营助手（「我的」页或登录页完成登录）。免登录游览模式不支持对话。')
}

function merchantApiFriendlyError(statusCode, body) {
  const rawErr = typeof body?.error === 'string' ? body.error : ''
  const rawDetail = typeof body?.detail === 'string' ? body.detail : ''
  const rawMsg = typeof body?.message === 'string' ? body.message : ''
  const code = Number(statusCode) || 0
  if (code === 401 || rawErr === 'unauthorized')
    return '服务端未放行：未检测到有效登录。请在「我的」登录后再试；游客浏览不支持对话。'
  if (rawErr === 'tenant_not_found' || (rawDetail && rawDetail.includes('未找到租户')))
    return rawDetail || '当前账号未关联商户租户，无法使用完整助手能力。请使用已在后台绑定门店的账号登录。'
  /** 服务端已返回可读说明 */
  if (rawDetail) return rawDetail.length > 800 ? `${rawDetail.slice(0, 800)}…` : rawDetail
  if (rawMsg) return rawMsg.length > 800 ? `${rawMsg.slice(0, 800)}…` : rawMsg
  if (rawErr) return rawErr
  return `请求失败（HTTP ${code || '?'}）`
}

/** AI 对话/生图默认 120s（微信默认约 60s 易 request:fail timeout） */
const AI_REQUEST_TIMEOUT_MS = 120000

function friendlyNetworkError(errMsg) {
  const em = String(errMsg || '网络异常')
  if (/timeout|超时|TIMED_OUT|timed\s*out/i.test(em)) {
    return '请求超时：模型响应较慢或网络不稳定，请缩短问题后重试；若刚登录可先退出再登录。'
  }
  const hb = apiBase()
  let hint = ''
  if (/fail|ECONNRESET|域名|ssl|certificate/i.test(em) && hb && /5173|:443/.test(hb)) {
    hint =
      ' 若调试本机 ERP：请先在本机启动 web版/merchant-erp（npm run dev）；真机请把 MERCHANT_API_BASE_URL 改为电脑局域网 IP，并在开发者工具勾选「不校验合法域名」。'
  }
  return em + hint
}

function requestJson(path, data, opts) {
  const base = apiBase()
  if (!base) return Promise.reject(new Error('未配置商家后台 API'))
  const timeout = Math.max(10000, Number(opts && opts.timeoutMs) || AI_REQUEST_TIMEOUT_MS)
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}${path}`,
      method: 'POST',
      header: authHeaders(),
      data,
      timeout,
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.ok !== false) {
          resolve(body)
          return
        }
        reject(new Error(merchantApiFriendlyError(res.statusCode, body || {})))
      },
      fail(err) {
        reject(new Error(friendlyNetworkError(err && err.errMsg)))
      },
    })
  })
}

function buildChatMessages(history, userLine, imageDataUrls, userId) {
  const messages = [{ role: 'system', content: AI_AGENT_SYSTEM_PROMPT }]
  try {
    messages.push({ role: 'system', content: merchantIntelMp.formatMerchantIntelContext() })
  } catch (_) {}
  try {
    const habits = habitsMp.buildAgentUserHabitsContext(userId || getCurrentUserId())
    if (habits) messages.push({ role: 'system', content: habits })
  } catch (_) {}
  for (const m of history.slice(-20)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  let line = String(userLine || '').trim()
  if (!line && imageDataUrls.length) line = '请结合附图说明你的需求。'
  messages.push({ role: 'user', content: line })
  return messages
}

async function postAiChatRequest(opts) {
  ensureRealAuthForAi()
  const base = apiBase()
  if (!base) {
    if (devAuth.isDevSkipLogin()) {
      return {
        ok: true,
        content: devMockReply(opts.userLine),
        provider: 'dev',
        model: 'preview',
      }
    }
    throw new Error('未配置 MERCHANT_API_BASE_URL，请在 utils/config.local.js 设置商家后台地址')
  }
  const parsed = registry.parseAiModelPickerKey(registry.effectiveChatPickerKey(opts.pickerKey))
  if (!parsed) throw new Error('模型配置无效')
  let chatModel = parsed.model
  if (parsed.provider === 'tokenmix' && !chatModel) {
    chatModel = registry.defaultModelIdForFamily(parsed.modelFamily)
  }
  const taskType = opts.taskType || inferTaskTypeFromText(opts.userLine)
  const body = {
    provider: parsed.provider,
    model: chatModel || undefined,
    messages: buildChatMessages(
      opts.history,
      opts.userLine,
      opts.imageDataUrls || [],
      getCurrentUserId(),
    ),
    agentPickerKey: opts.pickerKey,
  }
  if (taskType) body.taskType = taskType
  if (parsed.provider === 'tokenmix') body.modelFamily = parsed.modelFamily
  if (opts.imageDataUrls && opts.imageDataUrls.length) body.imageDataUrls = opts.imageDataUrls
  const data = await requestJson('/api/meoo-ai-chat', body)
  return {
    ok: true,
    content: String(data.content || ''),
    provider: data.provider,
    model: data.model,
  }
}

async function postAiAgentNativeImage(prompt, pickerKey, referenceImageDataUrl) {
  ensureRealAuthForAi()
  const route = agentNativeImageRouteFromPickerKey(pickerKey)
  const body = { prompt }
  const ref = referenceImageDataUrl && referenceImageDataUrl.trim()
  if (ref) body.reference_image = ref
  if (route.route === 'tokenmix' && route.tokenmixImageModel) {
    body.image_route = 'tokenmix'
    body.tokenmix_image_model = route.tokenmixImageModel
  } else if (route.preferredVendor) {
    body.preferred_vendor = route.preferredVendor
  }
  const data = await requestJson('/api/meoo-ai-agent-image', body)
  const imageUrl = String(data.imageUrl || '').trim()
  if (!imageUrl) throw new Error('生图未返回图片地址')
  let caption = '已生成图片，见下图。'
  if (data.fallbackNote) caption += `\n\n${data.fallbackNote}`
  return { ok: true, content: caption, imageUrl }
}

/**
 * 发送一轮对话（含附件、模型路由，与 Web AiAgentContext.sendUserText 对齐）
 */
async function sendAgentTurn(opts) {
  const {
    userLine,
    history = [],
    attachments = [],
    pickerKey,
    modelOptions = [],
  } = opts
  const imageDataUrls = []
  const bubbleImageUrls = []
  for (const a of attachments) {
    if (a.dataUrl) {
      imageDataUrls.push(a.dataUrl)
      bubbleImageUrls.push(a.preview || a.dataUrl)
    }
  }
  const line =
    String(userLine || '').trim() ||
    (attachments.some((a) => a.kind === 'video')
      ? '请结合附带的视频（已提供首帧）说明你的需求。'
      : attachments.length
        ? '请结合附图说明你的需求。'
        : '')

  const imagePickerKey = resolveImagePickerKey(
    pickerKey,
    modelOptions,
    line,
    imageDataUrls.length > 0,
  )

  if (registry.isAgentImagePickerKey(imagePickerKey) || detectImageGenerationIntent(line)) {
    try {
      const imgRes = await postAiAgentNativeImage(line, imagePickerKey, imageDataUrls[0])
      return {
        userMsg: {
          id: `u-${Date.now()}`,
          role: 'user',
          content: line,
          imageUrls: bubbleImageUrls.length ? bubbleImageUrls : undefined,
        },
        assistantMsg: {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: imgRes.content,
          imageUrls: [imgRes.imageUrl],
        },
      }
    } catch (e) {
      if (!registry.isAgentImagePickerKey(imagePickerKey)) {
        /* 对话模型附图时生图失败则回退对话 */
      } else {
        throw e
      }
    }
  }

  const chatRes = await postAiChatRequest({
    history,
    userLine: line,
    imageDataUrls,
    pickerKey,
    taskType: inferTaskTypeFromText(line),
  })
  return {
    userMsg: {
      id: `u-${Date.now()}`,
      role: 'user',
      content: line,
      imageUrls: bubbleImageUrls.length ? bubbleImageUrls : undefined,
    },
    assistantMsg: {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: chatRes.content,
    },
    rawAssistantContent: chatRes.content,
  }
}

/**
 * 一轮对话 + 方案确认/预览卡片（与 Web AiAgentContext 对齐）
 */
async function processAgentTurn(opts, executionState) {
  const line =
    String(opts.userLine || '').trim() ||
    (opts.attachments && opts.attachments.length ? '请结合附图说明你的需求。' : '')
  const history = opts.history || []
  let state = executionState || exec.createAgentExecutionState()

  const flow = exec.resolveExecutionUserMessage(state, history, line)
  state = flow.state
  if (flow.action === 'spawn_previews' && flow.plan && flow.taskTypes && flow.taskTypes.length) {
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: line,
    }
    const assistantMsgs = []
    if (flow.assistantLine) {
      assistantMsgs.push({
        id: `a-${Date.now()}-line`,
        role: 'assistant',
        content: flow.assistantLine,
      })
    }
    const previewMsgs = await previewMp.spawnPreviewsForTaskTypes(flow.plan, flow.taskTypes)
    assistantMsgs.push(...previewMsgs)
    return {
      userMsg,
      assistantMsgs,
      executionState: exec.syncStageAfterPreviewChange(state, history.concat([userMsg], assistantMsgs)),
    }
  }
  if (flow.action === 'none' && flow.assistantLine) {
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: line,
    }
    return {
      userMsg,
      assistantMsgs: [
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: flow.assistantLine,
        },
      ],
      executionState: state,
    }
  }

  const turn = await sendAgentTurn(opts)
  const taskType = exec.inferTaskTypeFromText(line)
  const raw = turn.rawAssistantContent || turn.assistantMsg.content
  let display = exec.formatAssistantDisplayText(raw)
  let nextState = state

  if (exec.shouldDeferTaskPreview(line, raw, taskType)) {
    const types = exec.inferTaskTypesFromCombinedContext(line, raw, taskType)
    nextState = exec.storeDeferredPlan(state, line, raw, types)
    display += exec.buildPlanExecutionConsultation(types)
  }

  turn.assistantMsg.content = display || '（无文本回复）'
  delete turn.rawAssistantContent
  return {
    userMsg: turn.userMsg,
    assistantMsgs: [turn.assistantMsg],
    executionState: nextState,
  }
}

/** 语音转文字：优先 VOICE_DRAFT_URL，module=agent */
async function transcribeVoiceTempPath(tempFilePath) {
  const url = (config.VOICE_DRAFT_URL || '').trim()
  const token = api.getBearerToken()
  if (devAuth.isDevSkipLogin() && (!url || !tempFilePath)) {
    return { ok: true, text: '（演示）帮我看一下今天最该优先处理的三件事' }
  }
  if (!url || !tempFilePath) {
    return { ok: false, message: '请配置 VOICE_DRAFT_URL 以使用语音输入' }
  }
  return new Promise((resolve) => {
    wx.uploadFile({
      url,
      filePath: tempFilePath,
      name: 'audio',
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        apikey: config.SUPABASE_ANON_KEY,
      },
      formData: { module: 'agent' },
      success(res) {
        try {
          const body = JSON.parse(res.data || '{}')
          const text = String(
            body.text || body.transcript || (body.draft && body.draft.rawText) || '',
          ).trim()
          if (res.statusCode >= 200 && res.statusCode < 300 && text) {
            resolve({ ok: true, text })
            return
          }
          resolve({
            ok: false,
            message: body.error || body.message || `识别失败 ${res.statusCode}`,
          })
        } catch (e) {
          resolve({ ok: false, message: e.message || '解析失败' })
        }
      },
      fail(err) {
        resolve({ ok: false, message: (err && err.errMsg) || '上传失败' })
      },
    })
  })
}

module.exports = {
  AI_AGENT_SYSTEM_PROMPT,
  AI_AGENT_SHORTCUTS,
  MAX_ATTACH,
  shortcutsForPlan,
  membershipAllowsAiTask,
  setCurrentUserId,
  getCurrentUserId,
  syncAgentStateFromCloud,
  loadThread,
  saveThread,
  clearThread,
  sendAgentTurn,
  processAgentTurn,
  readFileDataUrl,
  transcribeVoiceTempPath,
  inferTaskTypeFromText,
  apiBase,
  devMockReply,
}

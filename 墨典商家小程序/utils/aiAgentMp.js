const config = require('./config.js')
const api = require('./api.js')
const devAuth = require('./devAuth.js')
const registry = require('./aiModelRegistryMp.js')

const AI_AGENT_SYSTEM_PROMPT = `你是「墨典 AI 智能体」，服务于本地生活商家 ERP。
你可以帮助用户咨询问题，也可以生成商品创建、达人招募、评价处理、平台同步、异常分析、推广文案等任务方案。
当任务涉及创建、修改、删除、发布、回复、邀约、同步等真实业务动作时，你必须先输出执行预览，不得直接执行。
执行预览必须包含 JSON 或清晰结构，且至少包含 confirmRequired: true。
在得到用户明确确认之前，不要假设任何写操作已完成。`

const AI_AGENT_SHORTCUTS = [
  { type: 'create_product', label: '创建商品', prompt: '我想创建一个新的团购商品，请告诉我需要准备哪些信息' },
  { type: 'recruit_influencer', label: '招募达人', prompt: '我想发起达人探店招募，需要准备哪些信息' },
  { type: 'handle_review', label: '处理评价', prompt: '有一条差评需要回复，请给回复思路' },
  { type: 'optimize_local_ads', label: '优化本地推', prompt: '本地推投放预算怎么拆比较合理' },
  { type: 'follow_local_lead', label: '跟进线索', prompt: '帮我整理本地推线索跟进的要点' },
  { type: 'sync_platform', label: '同步平台', prompt: '商品同步失败可能有哪些原因' },
  { type: 'analyze_exception', label: '分析异常', prompt: '帮我分析最近经营数据异常的可能原因' },
  { type: 'generate_copywriting', label: '推广文案', prompt: '帮我写一段探店推广文案' },
  { type: 'file_tax', label: '一键报税', prompt: '本月报税需要准备哪些数据和步骤' },
]

const STORAGE_KEY = 'meoo_agent_thread_v2'
const MAX_ATTACH = 4

function apiBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function inferTaskTypeFromText(t) {
  const x = String(t || '')
    .replace(/\[引用[\s\S]*?\n\n/, '')
    .trim()
  if (/创建|商品|套餐|上架|团购|代金券/.test(x)) return 'create_product'
  if (/达人|招募|探店|brief|种草/.test(x)) return 'recruit_influencer'
  if (/差评|评价|评论/.test(x)) return 'handle_review'
  if (/分析|原因|异常/.test(x)) return 'analyze_exception'
  if (/同步|失败/.test(x)) return 'sync_platform'
  if (/报税|税务|申报/.test(x)) return 'file_tax'
  if (/投流|广告|本地推/.test(x)) return 'optimize_local_ads'
  if (/线索/.test(x)) return 'follow_local_lead'
  if (/文案|推广/.test(x)) return 'generate_copywriting'
  return 'general'
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
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveThread(messages) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
  } catch (_) {}
}

function clearThread() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (_) {}
}

function devMockReply(userText) {
  const t = String(userText || '').trim()
  if (/商品|上架|团购/.test(t)) {
    return '建议：「功能 → 商品 → 新建商品」按平台与类目创建；或使用语音录入生成草稿。'
  }
  if (/招募|达人/.test(t)) return '请打开「功能 → 运营 → 达人招募」。'
  if (/评论|差评/.test(t)) return '请打开「功能 → 运营 → 评论管理」。'
  if (/投流|广告/.test(t)) return '请打开「功能 → 投流 → 投流管理」。'
  return '（开发预览）已收到。配置 MERCHANT_API_BASE_URL 并登录后可使用完整智能体。'
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
  const token = api.getAccessToken()
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token && token !== devAuth.DEV_TOKEN) h.Authorization = `Bearer ${token}`
  return h
}

function requestJson(path, data) {
  const base = apiBase()
  if (!base) return Promise.reject(new Error('未配置商家后台 API'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}${path}`,
      method: 'POST',
      header: authHeaders(),
      data,
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.ok !== false) {
          resolve(body)
          return
        }
        const msg =
          (body && (body.detail || body.error || body.message)) || `请求失败 ${res.statusCode}`
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

function buildChatMessages(history, userLine, imageDataUrls) {
  const messages = [{ role: 'system', content: AI_AGENT_SYSTEM_PROMPT }]
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
  if (devAuth.isDevSkipLogin()) {
    return {
      ok: true,
      content: devMockReply(opts.userLine),
      provider: 'dev',
      model: 'preview',
    }
  }
  const parsed = registry.parseAiModelPickerKey(registry.effectiveChatPickerKey(opts.pickerKey))
  if (!parsed) throw new Error('模型配置无效')
  let chatModel = parsed.model
  if (parsed.provider === 'tokenmix' && !chatModel) {
    chatModel = registry.defaultModelIdForFamily(parsed.modelFamily)
  }
  const body = {
    provider: parsed.provider,
    model: chatModel || undefined,
    messages: buildChatMessages(opts.history, opts.userLine, opts.imageDataUrls || []),
    taskType: opts.taskType || inferTaskTypeFromText(opts.userLine),
    agentPickerKey: opts.pickerKey,
  }
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
  }
}

/** 语音转文字：优先 VOICE_DRAFT_URL，module=agent */
async function transcribeVoiceTempPath(tempFilePath) {
  const url = (config.VOICE_DRAFT_URL || '').trim()
  const token = api.getAccessToken()
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
  loadThread,
  saveThread,
  clearThread,
  sendAgentTurn,
  readFileDataUrl,
  transcribeVoiceTempPath,
  inferTaskTypeFromText,
  apiBase,
  devMockReply,
}

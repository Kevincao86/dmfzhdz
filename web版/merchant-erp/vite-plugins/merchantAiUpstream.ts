/**
 * 抖音商品创建 — AI 网关（仅跑在 Vite Node 端，密钥来自环境变量，勿写入前端包）。
 * 文案：MiniMax / 通义千问 / 豆包 对话 API（与各厂商 OpenAI 兼容或官方路径对齐）。
 * 生图：通义万相 wanx-v1（异步）、MiniMax image_generation、豆包 Seedream（Ark images/generations）。
 * 可选环境变量：MERCHANT_AI_QWEN_CHAT_MODEL、MERCHANT_AI_MINIMAX_CHAT_* 等见 .env.example。
 */
import type { ServerResponse } from 'node:http'

import { isBuiltinAiVendorId, isValidAiVendorSlug } from '../src/lib/aiVendorCatalogShared.js'

export type MerchantAiEnv = Record<string, string>

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function vendorBillingHintForModel(model: string): string {
  switch (model) {
    case 'doubao':
      return '火山引擎方舟 / 豆包'
    case 'qwen':
      return '阿里云 DashScope（通义）'
    case 'minimax':
      return 'MiniMax'
    default:
      return '模型服务商'
  }
}

/** 将上游 OpenAI 兼容接口常见报错转为用户可读说明；无法识别时返回原文 */
function humanizeUpstreamModelErrorMessage(raw: string, model: string): string {
  const lower = raw.toLowerCase()
  const billing =
    lower.includes('insufficient balance') ||
    /\b1008\b/.test(raw) ||
    lower.includes('insufficient_quota') ||
    (lower.includes('billing') &&
      (lower.includes('exhaust') || lower.includes('debt') || lower.includes('unpaid')))
  if (billing) {
    const who = vendorBillingHintForModel(model)
    return `模型账户可用余额或套餐额度不足（上游返回 insufficient balance / 1008 等）。请到 ${who} 控制台充值、开通按量计费或更换有效 API Key 后重试。`
  }
  if (
    lower.includes('invalid_api_key') ||
    (lower.includes('invalid') && lower.includes('api') && lower.includes('key'))
  ) {
    return `API Key 无效或未通过鉴权：${raw}`
  }
  if (lower.includes('401') || lower.includes('unauthorized')) {
    return `鉴权失败（401）：请检查服务端配置的 API Key。${raw}`
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('throttl')) {
    return `请求过于频繁或触发限流，请稍后重试。${raw}`
  }
  return raw
}

function formatAssistUpstreamCatchMessage(err: unknown, model: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const friendly = humanizeUpstreamModelErrorMessage(raw, model)
  if (friendly !== raw) return friendly
  return `上游模型调用失败：${raw}`
}

/**
 * 火山方舟 OpenAPI 根路径（须以 /api/v3 结尾）。
 * 官方当前常用域名为 volces.com（旧 volcengineapi.com 可能不可用）。
 * 环境变量可填 origin（自动补 /api/v3）或完整 …/api/v3。
 */
function doubaoArkApiV3Root(env: MerchantAiEnv): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

function doubaoChatModelId(env: MerchantAiEnv): string {
  return (env.MERCHANT_AI_DOUBAO_CHAT_MODEL ?? 'doubao-pro-32k').trim() || 'doubao-pro-32k'
}

/** 主模型（如旧版 doubao-pro-32k）不可用时再试，见方舟控制台可用模型名 */
function doubaoChatFallbackModelId(env: MerchantAiEnv): string {
  return (env.MERCHANT_AI_DOUBAO_CHAT_FALLBACK_MODEL ?? 'doubao-seed-1-6-251015').trim()
}

/** 通义千问 OpenAI 兼容模式 model 参数，见 DashScope compatible-mode 文档 */
function qwenChatModelId(env: MerchantAiEnv): string {
  return (env.MERCHANT_AI_QWEN_CHAT_MODEL ?? 'qwen-turbo').trim() || 'qwen-turbo'
}

function doubaoImageModelId(env: MerchantAiEnv): string {
  return (
    env.MERCHANT_AI_DOUBAO_IMAGE_MODEL ?? 'doubao-seedream-4-0-250828'
  ).trim() || 'doubao-seedream-4-0-250828'
}

function qwenWanxModelId(env: MerchantAiEnv): string {
  return (env.MERCHANT_AI_QWEN_IMAGE_MODEL ?? 'wanx-v1').trim() || 'wanx-v1'
}

function minimaxImageModelId(env: MerchantAiEnv): string {
  return (env.MERCHANT_AI_MINIMAX_IMAGE_MODEL ?? 'image-01').trim() || 'image-01'
}

function minimaxChatCompletionUrls(env: MerchantAiEnv): string[] {
  const raw = env.MERCHANT_AI_MINIMAX_CHAT_BASE?.trim().replace(/\/$/, '')
  if (raw) {
    if (raw.includes('/chat/completions')) return [raw]
    return [`${raw}/v1/chat/completions`]
  }
  return [
    'https://api.minimax.io/v1/chat/completions',
    'https://api.minimaxi.com/v1/chat/completions',
  ]
}

function extractVendorKeyFromBody(body: Record<string, unknown>, model: string): string | null {
  const raw = body.vendor_keys
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const v = o[model]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

/**
 * 优先使用服务端 .env 中的 Key；仅当环境变量未配置时才用请求体 vendor_keys（浏览器弹窗）。
 * 避免 localStorage 里曾保存的错误/过期 Key 覆盖 .env 里已配置的正确密钥（此前会导致「只有通义能用」）。
 */
function pickEffectiveKey(
  env: MerchantAiEnv,
  model: string,
  body: Record<string, unknown>,
): { key: string | null; label: string } {
  const fromEnv = pickKey(env, model)
  const fromBody = extractVendorKeyFromBody(body, model)
  if (fromEnv.key) return fromEnv
  if (fromBody) return { key: fromBody, label: '浏览器补充 Key' }
  return fromEnv
}

function pickKey(
  env: MerchantAiEnv,
  model: string,
): { key: string | null; label: string } {
  const e = env as Record<string, string | undefined>
  switch (model) {
    case 'qwen':
      return {
        key: (e.MERCHANT_AI_QWEN_KEY ?? e.DASHSCOPE_API_KEY ?? '').trim() || null,
        label: 'MERCHANT_AI_QWEN_KEY（或 DASHSCOPE_API_KEY）',
      }
    case 'doubao':
      return {
        key: (e.MERCHANT_AI_DOUBAO_KEY ?? e.ARK_API_KEY ?? '').trim() || null,
        label: 'MERCHANT_AI_DOUBAO_KEY（或 ARK_API_KEY）',
      }
    case 'minimax':
      return {
        key: (e.MERCHANT_AI_MINIMAX_KEY ?? e.MINIMAX_API_KEY ?? '').trim() || null,
        label: 'MERCHANT_AI_MINIMAX_KEY（或 MINIMAX_API_KEY）',
      }
    default:
      return { key: null, label: 'MERCHANT_AI_*' }
  }
}

function sliceTitle(s: string, maxChars: number): string {
  const arr = [...s]
  return arr.length <= maxChars ? s : arr.slice(0, maxChars).join('')
}

async function readJson(res: globalThis.Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function messageContentToText(msg: Record<string, unknown> | undefined): string | null {
  if (!msg) return null
  const c = msg.content
  if (typeof c === 'string' && c.trim()) return c.trim()
  if (Array.isArray(c)) {
    const parts: string[] = []
    for (const p of c) {
      if (typeof p === 'string' && p.trim()) parts.push(p.trim())
      else if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>
        if (typeof o.text === 'string' && o.text.trim()) parts.push(o.text.trim())
      }
    }
    if (parts.length) return parts.join('\n')
  }
  return null
}

/** MiniMax 等厂商在 message.content 中夹带 <think>…</think>，需去掉再作为标题/说明 */
function polishVisibleAssistantText(s: string): string {
  let t = s.trim()
  t = t.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '').trim()
  return t
}

function extractChatCompletionText(data: Record<string, unknown>): string {
  const err = data.error as Record<string, unknown> | undefined
  if (err) {
    const em =
      (typeof err.message === 'string' && err.message) ||
      (typeof err.msg === 'string' && err.msg) ||
      (typeof (err as { Message?: string }).Message === 'string' &&
        (err as { Message?: string }).Message)
    if (em) throw new Error(em)
  }
  const choices = data.choices as unknown[] | undefined
  const c0 = choices?.[0] as Record<string, unknown> | undefined
  if (c0) {
    const msg = c0.message as Record<string, unknown> | undefined
    const fromMsg = messageContentToText(msg)
    if (fromMsg) return polishVisibleAssistantText(fromMsg)
    const reasoning =
      msg && typeof msg.reasoning_content === 'string' ? msg.reasoning_content.trim() : ''
    if (reasoning) return polishVisibleAssistantText(reasoning)
    if (typeof c0.text === 'string' && c0.text.trim())
      return polishVisibleAssistantText(c0.text.trim())
  }
  if (typeof data.reply === 'string' && data.reply.trim())
    return polishVisibleAssistantText(data.reply.trim())
  const output = data.output as Record<string, unknown> | undefined
  if (output && typeof output.text === 'string' && output.text.trim())
    return polishVisibleAssistantText(output.text.trim())
  if (typeof data.text === 'string' && data.text.trim())
    return polishVisibleAssistantText(data.text.trim())
  throw new Error(`无法解析模型输出：${JSON.stringify(data).slice(0, 320)}`)
}

async function openAiStyleChat(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  bodyOverrides?: Record<string, unknown>,
  fetchSignal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.65,
      stream: false,
      ...bodyOverrides,
    }),
    signal: fetchSignal,
  })
  const data = await readJson(res)
  if (!res.ok) {
    const errObj = data.error as { message?: string; msg?: string } | undefined
    const msg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      (typeof errObj?.msg === 'string' && errObj.msg) ||
      (typeof data.message === 'string' && data.message) ||
      JSON.stringify(data).slice(0, 400)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  const br = data.base_resp as { status_code?: number; status_msg?: string } | undefined
  if (br && typeof br.status_code === 'number' && br.status_code !== 0) {
    throw new Error(br.status_msg || `上游 status_code=${br.status_code}`)
  }
  return extractChatCompletionText(data)
}

async function callMinimaxChat(
  apiKey: string,
  env: MerchantAiEnv,
  system: string,
  user: string,
): Promise<string> {
  /**
   * platform.minimax.io OpenAI 兼容：仅枚举 MiniMax-M2.7 / M2.5 / M2.1 等；国内 api.minimaxi.com 仍常用 abab6.5s-chat。
   * temperature ∈ (0,1]，文档默认 1；显式 stream:false。
   */
  const tempPayload = { temperature: 1, stream: false }
  const customBase = (env.MERCHANT_AI_MINIMAX_CHAT_BASE ?? '').trim()
  const envModel = (env.MERCHANT_AI_MINIMAX_CHAT_MODEL ?? '').trim()

  if (customBase) {
    const urls = minimaxChatCompletionUrls(env)
    const model = envModel || 'MiniMax-M2.7'
    let lastErr: Error | null = null
    for (const url of urls) {
      try {
        return await openAiStyleChat(url, apiKey, model, system, user, tempPayload)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('MiniMax 文案请求失败')
  }

  if (envModel) {
    const urls = [
      'https://api.minimax.io/v1/chat/completions',
      'https://api.minimaxi.com/v1/chat/completions',
    ]
    let lastErr: Error | null = null
    for (const url of urls) {
      try {
        return await openAiStyleChat(url, apiKey, envModel, system, user, tempPayload)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('MiniMax 文案请求失败')
  }

  const pairs: Array<[string, string]> = [
    ['https://api.minimax.io/v1/chat/completions', 'MiniMax-M2.7'],
    ['https://api.minimax.io/v1/chat/completions', 'MiniMax-M2.5'],
    ['https://api.minimax.io/v1/chat/completions', 'MiniMax-M2.1'],
    ['https://api.minimaxi.com/v1/chat/completions', 'abab6.5s-chat'],
  ]
  let lastErr: Error | null = null
  for (const [url, mmModel] of pairs) {
    try {
      return await openAiStyleChat(url, apiKey, mmModel, system, user, tempPayload)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('MiniMax 文案请求失败')
}

function doubaoChatModelCandidates(env: MerchantAiEnv): string[] {
  const primary = doubaoChatModelId(env)
  const fallback = doubaoChatFallbackModelId(env)
  const out: string[] = []
  for (const m of [primary, fallback]) {
    const t = m.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out.length ? out : ['doubao-pro-32k']
}

async function callDoubaoChat(
  apiKey: string,
  env: MerchantAiEnv,
  system: string,
  user: string,
  chatOverrides?: Record<string, unknown>,
  fetchSignal?: AbortSignal,
): Promise<string> {
  const url = `${doubaoArkApiV3Root(env)}/chat/completions`
  let lastErr: Error | null = null
  for (const mid of doubaoChatModelCandidates(env)) {
    try {
      return await openAiStyleChat(url, apiKey, mid, system, user, chatOverrides, fetchSignal)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('豆包对话请求失败')
}

async function callModelText(
  model: string,
  apiKey: string,
  env: MerchantAiEnv,
  system: string,
  user: string,
): Promise<string> {
  switch (model) {
    case 'qwen':
      return openAiStyleChat(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey,
        qwenChatModelId(env),
        system,
        user,
      )
    case 'doubao':
      return callDoubaoChat(apiKey, env, system, user)
    case 'minimax':
      return callMinimaxChat(apiKey, env, system, user)
    default:
      throw new Error(`不支持的 model：${model}`)
  }
}

function buildImagePrompt(
  productName: string,
  titleDraft: string,
  imageRole: string,
  mode: 't2i' | 'i2i',
): string {
  const name = productName.trim() || '本地生活服务'
  const base =
    mode === 'i2i'
      ? `在保留原图主体与构图的前提下，提升清晰度与色彩层次，适合抖音来客团购展示；商品/服务：${name}。`
      : `为抖音来客团购设计一张高质量商品图，主体清晰、光线自然、无牛皮癣文字；商品/服务：${name}。`
  if (imageRole === 'aux') {
    return `${base}侧重细节特写、套餐搭配或卖点展示，竖版或方图均可。`
  }
  if (imageRole === 'env') {
    return `${base}侧重门店环境、氛围与信任感，干净明亮。`
  }
  if (titleDraft && titleDraft !== productName) {
    return `${base}标题参考：${titleDraft.slice(0, 80)}。`
  }
  return `${base}主图风格，构图留白适中。`
}

async function qwenWanxCreateTask(
  apiKey: string,
  env: MerchantAiEnv,
  input: Record<string, unknown>,
  parameterExtras?: Record<string, unknown>,
): Promise<string> {
  const wanxModel = qwenWanxModelId(env)
  const res = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: wanxModel,
        input,
        parameters: {
          style: '<auto>',
          size: '1024*1024',
          n: 1,
          ...parameterExtras,
        },
      }),
    },
  )
  const data = await readJson(res)
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      JSON.stringify(data).slice(0, 400)
    throw new Error(msg || `万相创建任务 HTTP ${res.status}`)
  }
  const output = data.output as Record<string, unknown> | undefined
  const taskId = typeof output?.task_id === 'string' ? output.task_id : ''
  if (!taskId) throw new Error(`万相未返回 task_id：${JSON.stringify(data).slice(0, 280)}`)
  return taskId
}

async function qwenWanxPollUrls(apiKey: string, taskId: string): Promise<string[]> {
  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`
  for (let i = 0; i < 45; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await readJson(res)
    if (!res.ok) {
      throw new Error(
        (typeof data.message === 'string' && data.message) ||
          JSON.stringify(data).slice(0, 320) ||
          `查询任务 HTTP ${res.status}`,
      )
    }
    const output = data.output as Record<string, unknown> | undefined
    const status = String(output?.task_status ?? '')
    if (status === 'SUCCEEDED') {
      const results = (output?.results as unknown[]) ?? []
      const urls: string[] = []
      for (const row of results) {
        const r = row as Record<string, unknown>
        if (typeof r.url === 'string' && r.url.trim()) urls.push(r.url.trim())
      }
      if (urls.length === 0) throw new Error('万相任务成功但未返回图片 URL')
      return urls
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      const msg =
        (typeof output?.message === 'string' && output.message) ||
        (typeof data.message === 'string' && data.message) ||
        '万相任务失败'
      throw new Error(msg)
    }
    await sleep(2000)
  }
  throw new Error('万相任务排队超时，请稍后重试')
}

async function qwenWanxOneImage(
  apiKey: string,
  env: MerchantAiEnv,
  prompt: string,
  refImageUrl?: string,
): Promise<string> {
  const input: Record<string, unknown> = { prompt }
  let parameterExtras: Record<string, unknown> | undefined
  if (refImageUrl) {
    input.ref_image = refImageUrl
    input.negative_prompt = '模糊, 低质量, 畸形文字, 水印'
    parameterExtras = { ref_strength: 0.75, ref_mode: 'repaint' }
  }
  const taskId = await qwenWanxCreateTask(apiKey, env, input, parameterExtras)
  const urls = await qwenWanxPollUrls(apiKey, taskId)
  return urls[0]!
}

async function minimaxImageUrls(apiKey: string, body: Record<string, unknown>): Promise<string[]> {
  /** 文生文为 api.minimaxi.com；生图官方域名为 api.minimax.io，勿混用 */
  const res = await fetch('https://api.minimax.io/v1/image_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await readJson(res)
  const br = data.base_resp as { status_code?: number; status_msg?: string } | undefined
  if (br && typeof br.status_code === 'number' && br.status_code !== 0) {
    throw new Error(br.status_msg || `MiniMax 图像 status_code=${br.status_code}`)
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : `MiniMax 图像 HTTP ${res.status}`,
    )
  }
  const d = data.data as Record<string, unknown> | undefined
  const urls = d?.image_urls as unknown[] | undefined
  if (Array.isArray(urls) && urls.length > 0) {
    return urls.map((x) => String(x)).filter(Boolean)
  }
  const b64 = d?.image_base64 as unknown[] | undefined
  if (Array.isArray(b64) && typeof b64[0] === 'string' && b64[0].length > 0) {
    return [`data:image/png;base64,${String(b64[0])}`]
  }
  throw new Error(`MiniMax 未返回图片：${JSON.stringify(data).slice(0, 240)}`)
}

async function doubaoSeedreamUrls(
  env: MerchantAiEnv,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const res = await fetch(`${doubaoArkApiV3Root(env)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await readJson(res)
  if (!res.ok) {
    const err = data.error as { message?: string } | undefined
    throw new Error(
      (typeof err?.message === 'string' && err.message) ||
        (typeof data.message === 'string' && data.message) ||
        JSON.stringify(data).slice(0, 400),
    )
  }
  const arr = data.data as unknown[] | undefined
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`豆包生图无 data：${JSON.stringify(data).slice(0, 280)}`)
  }
  const out: string[] = []
  for (const item of arr) {
    const row = item as Record<string, unknown>
    if (typeof row.url === 'string' && row.url.trim()) {
      out.push(row.url.trim().replace(/\\u0026/g, '&'))
    }
  }
  if (out.length === 0) throw new Error('豆包生图未返回 url')
  return out
}

async function runImageGenerate(
  model: string,
  key: string,
  env: MerchantAiEnv,
  productName: string,
  titleDraft: string,
  imageRole: string,
): Promise<string[]> {
  const prompt = buildImagePrompt(productName, titleDraft, imageRole, 't2i')
  if (model === 'qwen') {
    const u = await qwenWanxOneImage(key, env, prompt)
    return [u]
  }
  if (model === 'minimax') {
    const mmModel = minimaxImageModelId(env)
    return minimaxImageUrls(key, {
      model: mmModel,
      prompt,
      aspect_ratio: '1:1',
      response_format: 'url',
      n: 1,
      prompt_optimizer: true,
    })
  }
  if (model === 'doubao') {
    const imgModel = doubaoImageModelId(env)
    return doubaoSeedreamUrls(env, key, {
      model: imgModel,
      prompt,
      size: '2K',
      response_format: 'url',
    })
  }
  throw new Error(`不支持的生图 model：${model}`)
}

async function runImageEnhanceOne(
  model: string,
  key: string,
  env: MerchantAiEnv,
  productName: string,
  titleDraft: string,
  imageRole: string,
  sourceUrl: string,
): Promise<string> {
  const prompt = buildImagePrompt(productName, titleDraft, imageRole, 'i2i')
  if (model === 'qwen') {
    return qwenWanxOneImage(key, env, prompt, sourceUrl)
  }
  if (model === 'minimax') {
    const mmModel = minimaxImageModelId(env)
    const urls = await minimaxImageUrls(key, {
      model: mmModel,
      prompt,
      aspect_ratio: '1:1',
      response_format: 'url',
      n: 1,
      prompt_optimizer: true,
      subject_reference: [{ type: 'character', image_file: sourceUrl }],
    })
    return urls[0]!
  }
  if (model === 'doubao') {
    const imgModel = doubaoImageModelId(env)
    const urls = await doubaoSeedreamUrls(env, key, {
      model: imgModel,
      prompt,
      image: sourceUrl,
      size: '2K',
      response_format: 'url',
    })
    return urls[0]!
  }
  throw new Error(`不支持的图生图 model：${model}`)
}

const VENDOR_LABEL: Record<string, string> = {
  minimax: 'MiniMax',
  qwen: '通义千问（DashScope）',
  doubao: '豆包（火山 Ark）',
}

function normalizeAiModelPreserveCustom(raw: unknown): string {
  const s = String(raw ?? 'qwen').trim().toLowerCase()
  if (s === 'deepseek') return 'qwen'
  if (!s) return 'qwen'
  if (isBuiltinAiVendorId(s)) return s
  if (isValidAiVendorSlug(s)) return s
  return 'qwen'
}

function missingVendorKeyBody(env: MerchantAiEnv, model: string) {
  const { label } = pickKey(env, model)
  const name = VENDOR_LABEL[model] ?? model
  return {
    ok: false as const,
    code: 'NEED_VENDOR_KEY',
    vendor: model,
    message: `缺少「${name}」的有效 API Key。请在弹窗中粘贴 Key（仅存本机浏览器）或在服务端配置：${label}。`,
  }
}

const TITLE_SYSTEM = `你是抖音来客「本地生活」商品标题专家。请只输出一条商品标题正文：
- 更吸睛、适合团购场景，合规、无违禁承诺；
- 不超过 40 个字符（按 Unicode 字符计）；
- 不要引号、不要前缀说明、不要换行。`

const DESC_SYSTEM = `你是抖音来客商品详情文案专家。请输出一段商品说明（纯文本）：
- 根据用户给出的商品名称，写清服务亮点、适用场景、规格或套餐提示（可适度虚构合理细节）；
- 约 150～320 字，口语自然；
- 不要 Markdown、不要小标题、不要「商品说明：」这类前缀。`

const OPERATION_ARTICLE_SYSTEM = `你是本地生活门店的内容运营作者。请根据用户给出的门店名与写作要点，输出一篇可发布在公众号、小红书或抖音图文的中文稿件。
- 结构清晰，可用「一、二、三」等中文小节标题，总字数约 450～900 字；
- 语气真实可信，避免绝对化承诺与违禁医疗功效表述；
- 不要使用 Markdown 代码围栏；少用 # 号标题，以中文小标题行为主。`

const OPERATION_TOPIC_SYSTEM = `你是本地生活门店的短视频与图文选题策划。请根据门店名与品类/客群重点，输出 6～10 条本周可用的选题。
- 每条独立成行，格式：序号. 选题标题 — 一句话切入角度；
- 结合团购、到店体验、节日热点等场景；避免敏感违规话题；
- 不要 JSON、不要代码围栏，只输出纯文本列表。`

const GEO_AI_CONSULT_SYSTEM = `你是本地生活门店在「生成式搜索 / AI 问答」场景下的咨询助手，当前处于 GEO（生成式引擎优化）联调测试。
用户会提供两段输入：【门店 GEO 知识包】与【当前用户咨询】。知识包来自商家 ERP 中维护的结构化事实、FAQ、问法覆盖摘要等，可能仍含示例或占位数据。

作答要求：
- 优先严格依据知识包中已写明的事实作答；知识包未写明或写「待完善」「示例」之处，用简短话说明「资料未提供」或「请以门店最新公示为准」，不要编造具体门牌、价格、电话、营业时间。
- 面向最终顾客：先给一句可执行的结论，必要时再补充 2～5 句说明。
- 不要使用 Markdown 代码围栏；不要使用 JSON；全文建议不超过 600 字。`

const GEO_AI_SCORE_SYSTEM = `你是本地生活 GEO（生成式引擎优化）评估专家。用户会提供 JSON：抖音来客已绑定门店的事实摘要（可能为多店按账户/品牌聚合，或仅单店）。

你必须只输出一段合法 JSON（不要使用 Markdown 代码围栏、不要任何前后缀说明），顶层必须为：
{
  "infoCompletenessPercent": 整数 0-100,
  "questionCoveragePercent": 整数 0-100,
  "contentFreshnessPercent": 整数 0-100,
  "rationale_zh": "字符串，120 字内中文说明三维度打分依据",
  "todos": [ { "title": "字符串", "type": "门店|规则|内容|问法", "priority": "high|medium" } ],
  "covered_queries": [ { "q": "典型用户问法", "covered": true } ]
}

评分原则（与业务权重一致，请在心中核算健康分 ≈ 信息×0.4 + 问法×0.35 + 新鲜×0.25）：
- 信息完整度：门店名称、地址、营业时间、电话、门头图、公告里是否体现停车/预约等关键事实。
- 问法覆盖率：用户常问的营业、位置、停车、电话、团购/预约等能否从给定事实中直接回答。
- 内容新鲜度：综合各门店 updated_at；若普遍陈旧或缺失更新时间，应压低分数并在 rationale_zh 说明。
todos 不超过 5 条、与事实一致且可执行；covered_queries 给出 5～8 条即可，covered 必须与事实一致。`

const QUALITY_ANALYSIS_SYSTEM_BASE = `你是抖音来客与本地生活团购的商品质量评估专家。用户会提供若干「已上传/已同步」商品的结构化资料（名称、价格、标题、主图 URL 或说明、详情摘要）。请只根据给定信息做保守、可落地的评估；未提供的图片或页面不要编造细节，须在对应点评中说明依据有限。

你必须只输出一段合法 JSON（不要使用 Markdown 代码围栏、不要任何前后缀说明），顶层为：
{"items":[...]}
items 中每一项必须包含：
- productId: 字符串，与输入商品 id 一致
- productName: 字符串，与输入商品名称一致
- overall: 整数 0-100，综合质量分（须统筹标题、主图、详情与价格等维度）
- titleHeat: { "score": 整数0-100, "comment": 中文短评，点评标题吸引力与搜索热度相关点 }
- mainImage: { "score": 整数0-100, "comment": 中文短评，点评主图构图、清晰度、卖点半表达 }
- detailPage: { "score": 整数0-100, "comment": 中文短评，点评详情信息完整度、信任感与转化要素 }
- priceAnalysis: { "score": 整数0-100, "comment": 中文短评，点评团购标价相对品类/人数场景的合理性、性价比感知，以及是否与商家毛利目标大体协调；无 price_yuan 时 score 不超过 70 且 comment 须说明缺少售价字段 }
- suggestions: 中文字符串数组，2-5 条可执行优化建议（可含定价、加购、套餐搭配等）

刻度参考：80+ 良好；60-79 中等；低于 60 需重点优化。若缺少主图或详情信息，对应维度 score 不得超过 72，comment 须明确说明依据不足。`

const QUALITY_PRICING_APPEND = `

若用户另附「门店定价与毛利」JSON（pricing_context），其中含商家自填的各平台综合毛利率 merchant_gross_margin_percent（%）、可选的行业参考 suggested_benchmark_percent 与 benchmark_note：你必须结合团购价 price_yuan 做定性判断——在不明示具体食材/人力成本的前提下，判断标价与商家毛利目标是否大体协调；**主要结论须写入 priceAnalysis 的 score 与 comment**（可简要呼应于 detailPage.comment），若标价相对行业参考或商家毛利明显偏低/偏高，须在 suggestions 中给出温和、可执行的定价或套餐组合建议，并避免捏造未提供的成本数字。`

const QUALITY_ANALYSIS_SYSTEM = QUALITY_ANALYSIS_SYSTEM_BASE

function stripAssistantJsonFence(text: string): string {
  let t = text.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)
  if (m?.[1]) return m[1].trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[^\n]*\n?/i, '').replace(/\n?```$/i, '').trim()
  }
  return t
}

function parseGeoAiScoreFromModelText(text: string): {
  infoCompletenessPercent: number
  questionCoveragePercent: number
  contentFreshnessPercent: number
  rationale_zh: string
  todos: { title: string; type: string; priority: string }[]
  covered_queries?: { q: string; covered: boolean }[]
} | null {
  let raw = stripAssistantJsonFence(text)
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  raw = raw.slice(first, last + 1)
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const todos: { title: string; type: string; priority: string }[] = []
    const tArr = o.todos
    if (Array.isArray(tArr)) {
      for (const row of tArr.slice(0, 8)) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const title = typeof r.title === 'string' ? r.title.trim() : ''
        if (!title) continue
        const type = typeof r.type === 'string' ? r.type.trim() : '门店'
        const pr = typeof r.priority === 'string' ? r.priority.trim().toLowerCase() : 'medium'
        todos.push({ title, type, priority: pr === 'high' ? 'high' : 'medium' })
      }
    }
    const covered_queries: { q: string; covered: boolean }[] = []
    const cq = o.covered_queries ?? o.coveredQueries
    if (Array.isArray(cq)) {
      for (const row of cq.slice(0, 12)) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const q = typeof r.q === 'string' ? r.q.trim() : ''
        if (!q) continue
        covered_queries.push({ q, covered: Boolean(r.covered) })
      }
    }
    return {
      infoCompletenessPercent: clampQualityScore(o.infoCompletenessPercent ?? o.info_completeness_percent),
      questionCoveragePercent: clampQualityScore(o.questionCoveragePercent ?? o.question_coverage_percent),
      contentFreshnessPercent: clampQualityScore(o.contentFreshnessPercent ?? o.content_freshness_percent),
      rationale_zh:
        (typeof o.rationale_zh === 'string' && o.rationale_zh.trim()) ||
        (typeof o.rationale === 'string' && o.rationale.trim()) ||
        '',
      todos,
      ...(covered_queries.length ? { covered_queries } : {}),
    }
  } catch {
    return null
  }
}

function clampQualityScore(n: unknown): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

function normDim(o: unknown): { score: number; comment: string } {
  if (!o || typeof o !== 'object') return { score: 0, comment: '模型未返回该维度' }
  const rec = o as Record<string, unknown>
  const comment =
    (typeof rec.comment === 'string' && rec.comment.trim()) ||
    (typeof rec.summary === 'string' && rec.summary.trim()) ||
    (typeof rec.remark === 'string' && rec.remark.trim()) ||
    ''
  return { score: clampQualityScore(rec.score), comment: comment || '—' }
}

function pickDimFromRow(row: Record<string, unknown>, keys: string[]): { score: number; comment: string } {
  for (const k of keys) {
    const v = row[k]
    if (v && typeof v === 'object') return normDim(v)
  }
  return { score: 0, comment: '模型未返回该维度' }
}

function parseQualityAnalysisJson(
  text: string,
  fallbackNames: Map<string, string>,
): { items: unknown[]; error?: string } {
  let raw = stripAssistantJsonFence(text)
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1)
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { items: [], error: '模型输出不是合法 JSON' }
  }
  const itemsRaw = data.items ?? data.products ?? data.data
  if (!Array.isArray(itemsRaw)) return { items: [], error: 'JSON 缺少 items 数组' }
  const items: unknown[] = []
  for (const row of itemsRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const productId = String(r.productId ?? r.id ?? '').trim()
    const productName =
      String(r.productName ?? r.name ?? fallbackNames.get(productId) ?? '').trim() ||
      '未命名商品'
    const titleHeat = pickDimFromRow(r, ['titleHeat', 'title_heat', 'titleHot', '标题热度'])
    const mainImage = pickDimFromRow(r, ['mainImage', 'main_image', 'cover', '主图质量'])
    const detailPage = pickDimFromRow(r, ['detailPage', 'detail_page', 'detail', '详情页质量'])
    const rawPriceDim =
      r.priceAnalysis ??
      r.price_analysis ??
      r.priceCompetitiveness ??
      r.pricingAnalysis ??
      r['价格分析']
    let priceAnalysis =
      rawPriceDim && typeof rawPriceDim === 'object'
        ? normDim(rawPriceDim)
        : { score: 0, comment: '模型未返回该维度' }
    if (!rawPriceDim || typeof rawPriceDim !== 'object') {
      priceAnalysis = {
        score: Math.round((titleHeat.score + mainImage.score + detailPage.score) / 3),
        comment:
          '模型未返回独立 priceAnalysis 字段，暂以三项均分占位；请重试质检或确认提示词版本。',
      }
    }
    items.push({
      productId: productId || `row-${items.length}`,
      productName,
      overall: clampQualityScore(r.overall ?? r.score ?? r.total),
      titleHeat,
      mainImage,
      detailPage,
      priceAnalysis,
      suggestions: (() => {
        const s = r.suggestions ?? r.advice ?? r.tips
        if (!Array.isArray(s)) return [] as string[]
        return s.map((x) => String(x).trim()).filter(Boolean)
      })(),
    })
  }
  if (items.length === 0) return { items: [], error: 'items 为空或无法解析' }
  return { items }
}

export type GrossMarginAiPack = {
  suggestedPercent: { douyin: number; meituan: number; xhs: number }
  benchmarkNote: string
  /** doubao | qwen */
  modelVendor: string
}

function clampMarginPctAi(n: unknown): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 0
  return Math.min(92, Math.max(28, x))
}

function parseGrossMarginAiJson(text: string): Omit<GrossMarginAiPack, 'modelVendor'> | null {
  let raw = stripAssistantJsonFence(text)
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1)
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const noteRaw = typeof o.note_zh === 'string' ? o.note_zh.trim() : ''
    const note =
      noteRaw ||
      '以上为结合类目特征的模型估算，供内部参考，不构成财务或定价承诺。'
    const prefix =
      '综合毛利率结合到店团购场景的公开信息与行业常见区间作粗粒度对齐，由大模型给出三平台参考中位值；实际以门店成本、平台佣金与活动规则为准。'
    return {
      suggestedPercent: {
        douyin: clampMarginPctAi(o.douyin),
        meituan: clampMarginPctAi(o.meituan),
        xhs: clampMarginPctAi(o.xhs),
      },
      benchmarkNote: `${prefix} ${note}`.slice(0, 420),
    }
  } catch {
    return null
  }
}

/**
 * 门店毛利「行业建议」：优先豆包（火山 Ark），其次通义千问；均未配置 Key 时返回 null。
 * 供本地 dev 网关 `/api/merchant/store/gross-margin-advisor` 调用。
 */
export async function generateGrossMarginSuggestionByAi(
  env: MerchantAiEnv,
  ctx: { industryPath: string; industryName?: string },
): Promise<GrossMarginAiPack | null> {
  const path = (ctx.industryPath || ctx.industryName || '').trim()
  if (!path) return null
  const system = `你是本地生活到店团购的经营分析助手。用户会给出「经营类目路径」（如 餐饮 > 自助餐）。请仅输出一段合法 JSON 对象，不要 Markdown、不要代码围栏、不要任何前缀或后缀说明。JSON 字段必须为：
- douyin: 整数，抖音来客渠道下该品类常见「综合毛利率」参考中位值（百分比整数）
- meituan: 整数，美团/大众点评渠道
- xhs: 整数，小红书渠道
三者均在 28～92 之间；可轻微体现各平台佣金与流量成本差异。
- note_zh: 字符串，80 字以内中文，客观说明这是粗粒度参考而非审计结论。禁止出现：mock、占位、假数据 等措辞。`
  const user = `经营类目路径：${path}`
  const doubaoK = pickKey(env, 'doubao').key
  const qwenK = pickKey(env, 'qwen').key
  let raw: string | null = null
  let vendor: 'doubao' | 'qwen' | '' = ''
  if (doubaoK) {
    try {
      raw = await callModelText('doubao', doubaoK, env, system, user)
      vendor = 'doubao'
    } catch {
      raw = null
    }
  }
  if (!raw && qwenK) {
    try {
      raw = await callModelText('qwen', qwenK, env, system, user)
      vendor = 'qwen'
    } catch {
      raw = null
    }
  }
  if (!raw || !vendor) return null
  const parsed = parseGrossMarginAiJson(raw)
  if (!parsed) return null
  return { ...parsed, modelVendor: vendor }
}

export type MerchantReviewReplySentiment = 'good' | 'neutral' | 'bad'

/** 单条评价公开回复话术：仅豆包；须紧扣该条「评价原文」，区分好评 / 中评 / 差评语气。 */
export async function generateReviewReplyByDoubao(
  env: MerchantAiEnv,
  ctx: {
    platformLabel: string
    userName: string
    reviewText: string
    ratingStars: number
    sentiment: MerchantReviewReplySentiment
  },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const { key, label } = pickKey(env, 'doubao')
  if (!key) {
    return {
      ok: false,
      message: `未配置豆包 API Key，无法生成智能回复。请在服务端配置 ${label}。`,
    }
  }
  const starLine = `评价星级：${ctx.ratingStars} 星。`
  const tone =
    ctx.sentiment === 'good'
      ? '这是一条好评。'
      : ctx.sentiment === 'neutral'
        ? '这是一条中评。'
        : '这是一条差评。'
  const task =
    ctx.sentiment === 'good'
      ? '写一条用于平台展示的公开回复：真诚感谢顾客，并至少点出「评价原文」里提到的一个具体点（如口味、环境、服务等），用简短复述让顾客感到被认真读过；欢迎再次光临。'
      : ctx.sentiment === 'neutral'
        ? '写一条公开回复：先感谢反馈，再针对「评价原文」里提到的具体问题或感受分别回应；语气务实；可邀请私信或到店沟通细节。'
        : '写一条公开回复：诚恳致歉，针对「评价原文」里指出的问题分别回应；给出可执行的改进或补偿路径（如欢迎私信/到店核实）；语气专业克制。'
  const system = `你是「${ctx.platformLabel}」门店的客服负责人。${tone}${starLine}
硬性要求：回复必须根据下方用户消息中的「评价原文」撰写，正文中至少自然体现原文里的一个关键词或一件具体事；禁止全文只有万能套话、禁止写与这条评价无关的内容。
${task}
格式要求：不要 Markdown、不要编号列表；全文不超过 220 字；只输出回复正文一段。`
  const user = `顾客昵称：${ctx.userName}\n评价原文（你必须逐句阅读并据此写回复）：\n${ctx.reviewText}`
  try {
    const text = (await callDoubaoChat(key, env, system, user)).trim()
    if (!text) return { ok: false, message: '豆包未返回有效回复' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** @deprecated 请使用 generateReviewReplyByDoubao，sentiment 固定为 bad */
export async function generateNegativeReviewReplyByDoubao(
  env: MerchantAiEnv,
  ctx: {
    platformLabel: string
    userName: string
    reviewText: string
    ratingStars: number
  },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  return generateReviewReplyByDoubao(env, { ...ctx, sentiment: 'bad' })
}

/** 处理 POST /api/merchant/douyin/goods/ai/assist（已解析 JSON body） */
export async function handleDouyinGoodsAiAssist(
  res: ServerResponse,
  body: Record<string, unknown>,
  env: MerchantAiEnv,
): Promise<void> {
  const model = normalizeAiModelPreserveCustom(body.model)
  if (!isBuiltinAiVendorId(model)) {
    json(res, 200, {
      ok: false,
      code: 'UNSUPPORTED_AI_VENDOR',
      vendor: model,
      message: `本地网关尚未接入「${model}」的文案 / 生图能力，请改用 MiniMax、通义千问或豆包。（新增供应商已同步至 ERP 后，仍须在本项目扩展上游路由方可实际调用。）`,
    })
    return
  }
  const action = String(body.action ?? '')
  const productName = String(body.product_name ?? '').trim() || '本店服务'
  const titleDraft = String(body.title_draft ?? '').trim() || productName
  const imageUrls = Array.isArray(body.image_urls)
    ? (body.image_urls as unknown[]).map((x) => String(x)).filter(Boolean)
    : []
  const imageRole = String(body.image_role ?? 'head').trim() || 'head'

  if (action === 'analyze_product_quality') {
    const rawList = body.products
    if (!Array.isArray(rawList) || rawList.length === 0) {
      json(res, 400, { ok: false, message: '缺少 products 数组或为空' })
      return
    }
    const { key } = pickEffectiveKey(env, 'doubao', body)
    if (!key) {
      json(res, 200, missingVendorKeyBody(env, 'doubao'))
      return
    }
    const compact: Record<string, unknown>[] = []
    const nameById = new Map<string, string>()
    for (const row of rawList.slice(0, 18)) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const id = String(o.id ?? o.productId ?? '').trim()
      if (!id) continue
      const rawName = String(o.name ?? o.productName ?? '').trim()
      const name = rawName || `未命名商品-${id}`
      nameById.set(id, name)
      const one: Record<string, unknown> = { id, name }
      const py = typeof o.price_yuan === 'number' ? o.price_yuan : Number(o.price_yuan ?? o.price)
      if (Number.isFinite(py)) one.price_yuan = py
      if (typeof o.title === 'string' && o.title.trim()) one.title = o.title.trim()
      if (typeof o.main_image_url === 'string' && o.main_image_url.trim())
        one.main_image_url = o.main_image_url.trim()
      if (typeof o.detail_excerpt === 'string' && o.detail_excerpt.trim())
        one.detail_excerpt = o.detail_excerpt.trim()
      compact.push(one)
    }
    if (compact.length === 0) {
      json(res, 400, { ok: false, message: 'products 中无有效 id 与 name' })
      return
    }
    const pricingCtx = body.pricing_context
    const hasPricingCtx =
      pricingCtx !== null &&
      pricingCtx !== undefined &&
      typeof pricingCtx === 'object' &&
      !Array.isArray(pricingCtx)
    const systemPrompt = hasPricingCtx
      ? `${QUALITY_ANALYSIS_SYSTEM_BASE}${QUALITY_PRICING_APPEND}`
      : QUALITY_ANALYSIS_SYSTEM
    let user = `以下为待评估商品（JSON）：\n${JSON.stringify({ products: compact }, null, 2)}`
    if (hasPricingCtx) {
      user += `\n\n以下为门店定价与毛利上下文（JSON，供评估售价合理性）：\n${JSON.stringify(pricingCtx, null, 2)}`
    }
    const chatOpts: Record<string, unknown> = { temperature: 0.25, stream: false }
    const qualityCtrl = new AbortController()
    const qualityTimer = setTimeout(() => qualityCtrl.abort(), 130_000)
    try {
      let text = await callDoubaoChat(
        key,
        env,
        systemPrompt,
        user,
        chatOpts,
        qualityCtrl.signal,
      )
      let parsed = parseQualityAnalysisJson(text, nameById)
      if (parsed.error) {
        try {
          const text2 = await callDoubaoChat(key, env, systemPrompt, user, {
            ...chatOpts,
            response_format: { type: 'json_object' },
          }, qualityCtrl.signal)
          text = text2
          parsed = parseQualityAnalysisJson(text2, nameById)
        } catch {
          /* 保留首次模型输出用于排错 */
        }
      }
      if (parsed.error) {
        json(res, 200, {
          ok: true,
          quality_items: [],
          quality_parse_error: parsed.error,
          quality_raw_excerpt: stripAssistantJsonFence(text).slice(0, 1600),
        })
        return
      }
      json(res, 200, { ok: true, quality_items: parsed.items })
      return
    } catch (e) {
      const aborted =
        typeof e === 'object' &&
        e !== null &&
        'name' in e &&
        (e as { name: string }).name === 'AbortError'
      const msg = e instanceof Error ? e.message : String(e)
      json(res, aborted ? 504 : 502, {
        ok: false,
        message: aborted
          ? '豆包质检请求超时（>130s），请检查网络或稍后重试'
          : `豆包质检失败：${msg}`,
      })
      return
    } finally {
      clearTimeout(qualityTimer)
    }
  }

  if (action === 'image_generate' || action === 'image_enhance') {
    if (action === 'image_enhance' && imageUrls.length === 0) {
      json(res, 400, { ok: false, message: '请先上传图片后再进行美化' })
      return
    }
    const { key } = pickEffectiveKey(env, model, body)
    if (!key) {
      json(res, 200, missingVendorKeyBody(env, model))
      return
    }

    try {
      if (action === 'image_generate') {
        const urls = await runImageGenerate(model, key, env, productName, titleDraft, imageRole)
        json(res, 200, { ok: true, image_urls: urls })
        return
      }
      const enhanced: string[] = []
      for (const u of imageUrls) {
        enhanced.push(await runImageEnhanceOne(model, key, env, productName, titleDraft, imageRole, u))
      }
      json(res, 200, { ok: true, image_urls: enhanced })
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 502, { ok: false, message: `生图上游失败：${msg}` })
      return
    }
  }

  const { key } = pickEffectiveKey(env, model, body)
  if (
    !key &&
    (action === 'optimize_title' ||
      action === 'generate_desc' ||
      action === 'operation_article' ||
      action === 'operation_topic' ||
      action === 'geo_ai_consult' ||
      action === 'geo_ai_score')
  ) {
    json(res, 200, missingVendorKeyBody(env, model))
    return
  }

  try {
    if (action === 'geo_ai_score') {
      const ctxRaw = String(body.geo_score_context ?? '').trim()
      if (ctxRaw.length < 40) {
        json(res, 400, { ok: false, message: 'geo_score_context 过短或缺失' })
        return
      }
      const payloadSlice = ctxRaw.length > 38000 ? `${ctxRaw.slice(0, 38000)}\n…（上下文已截断）` : ctxRaw
      const user = `以下为抖音来客门店事实 JSON（仅用于 GEO 评分，勿外泄）：\n${payloadSlice}`
      const text = (await callModelText(model, key!, env, GEO_AI_SCORE_SYSTEM, user)).trim()
      const parsed = parseGeoAiScoreFromModelText(text)
      if (!parsed) {
        json(res, 200, {
          ok: true,
          geo_ai_score: null,
          geo_ai_parse_error: '模型输出不是合法 JSON，请前端回退规则评分',
          geo_ai_raw_excerpt: stripAssistantJsonFence(text).slice(0, 1600),
        })
        return
      }
      json(res, 200, { ok: true, geo_ai_score: parsed })
      return
    }
    if (action === 'geo_ai_consult') {
      const geoPack = String(body.geo_knowledge_pack ?? '').trim()
      if (titleDraft.length < 4) {
        json(res, 400, { ok: false, message: '请输入至少 4 个字的咨询内容' })
        return
      }
      if (geoPack.length < 24) {
        json(res, 400, {
          ok: false,
          message: 'GEO 知识包过短：请先在各子页维护足够的事实与内容后再测（演示环境可刷新页面重试）',
        })
        return
      }
      const user = `门店名称（上下文）：${productName}\n\n【门店 GEO 知识包】\n${geoPack}\n\n【当前用户咨询】\n${titleDraft}`
      const description = (await callModelText(model, key!, env, GEO_AI_CONSULT_SYSTEM, user)).trim()
      json(res, 200, { ok: true, description })
      return
    }
    if (action === 'optimize_title') {
      const user = `候选标题：${titleDraft}\n商品背景名：${productName}`
      const raw = await callModelText(model, key!, env, TITLE_SYSTEM, user)
      const title = sliceTitle(raw.replace(/^["'「]|["'」]$/g, '').trim(), 40)
      json(res, 200, { ok: true, title: title || titleDraft.slice(0, 40) })
      return
    }
    if (action === 'generate_desc') {
      const user = `商品名称：${productName}`
      const description = (await callModelText(model, key!, env, DESC_SYSTEM, user)).trim()
      json(res, 200, { ok: true, description })
      return
    }
    if (action === 'operation_article') {
      if (titleDraft.length < 8) {
        json(res, 400, { ok: false, message: '写作要点至少 8 个字符，请补充活动、卖点或受众等信息' })
        return
      }
      const user = `门店名称：${productName}\n写作要点与活动信息：\n${titleDraft}`
      const description = (await callModelText(model, key!, env, OPERATION_ARTICLE_SYSTEM, user)).trim()
      json(res, 200, { ok: true, description })
      return
    }
    if (action === 'operation_topic') {
      if (titleDraft.length < 6) {
        json(res, 400, { ok: false, message: '品类或经营重点至少 6 个字符' })
        return
      }
      const user = `门店名称：${productName}\n品类与客群/经营重点：\n${titleDraft}`
      const description = (await callModelText(model, key!, env, OPERATION_TOPIC_SYSTEM, user)).trim()
      json(res, 200, { ok: true, description })
      return
    }
    json(res, 400, { ok: false, message: `未知 action：${action}` })
  } catch (e) {
    json(res, 502, { ok: false, message: formatAssistUpstreamCatchMessage(e, model) })
  }
}

/** 短视频长片策划等：走豆包 / 通义对话，Key 与商品 AI 相同（.env、注册表或请求体 vendor_keys）。 */
export async function merchantChatCompletion(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  model: 'doubao' | 'qwen',
  system: string,
  user: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const { key, label } = pickEffectiveKey(env, model, body)
  if (!key) {
    return {
      ok: false,
      message: `未配置 ${model === 'doubao' ? '豆包' : '通义千问'} API Key（${label}）。可在「系统设置 → AI 模型绑定」填写，或由服务端环境变量配置。`,
    }
  }
  try {
    const raw = await callModelText(model, key, env, system, user)
    return { ok: true, text: polishVisibleAssistantText(raw) }
  } catch (e) {
    return { ok: false, message: formatAssistUpstreamCatchMessage(e, model) }
  }
}

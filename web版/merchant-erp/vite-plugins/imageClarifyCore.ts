/**
 * 图片变清晰：先用视觉模型看图，再选万相超分或千问图像编辑。
 * 实拍、人像、文字走万相 super_resolution；插画走 qwen-image-edit。
 */
import { chatVisionAgentFromRequest } from './merchantVisionLlmChat.js'
import { extractQwenVisionImageUrlsFromPayload } from '../src/lib/qwenVisionApi.js'
import { signVolcVisualJsonPost } from './volcVisualSign.js'

export type ClarifyRoute = 'wanx_sr_1' | 'wanx_sr_2' | 'qwen_edit'

export type ClarifyChoice = {
  route: ClarifyRoute
  label: string
  detail: string
  reason: string
  visionModel?: string
}

const JUDGE_SYSTEM = `你只判断一张图适合哪种变清晰方式。只输出 JSON，不要解释。
字段：
scene: portrait | product | text | photo | screenshot | illustration
blur: light | heavy
reason: 不超过16个汉字
画面里只要有真实的人，无论远近、无论背景是不是风景，scene 都必须是 portrait。没有人的商品用 product。以文字或界面为主用 text 或 screenshot。没有人的风景才用 photo。只有卡通、插画、手绘才用 illustration。`

const EDIT_PROMPT =
  '这是同一张插画的高清修复。保持画面里的人物、物体、构图和颜色不变，只提高清晰度和线条细节。不要重画，不要换风格，不要加字，不要改背景。'

const FACE_LOCK_PROMPT =
  '图像超分。人物五官、脸型、表情、身份和姿势必须与原图完全一致，禁止重画人脸，只提高清晰度。'

const DASHSCOPE = 'https://dashscope.aliyuncs.com'

function qwenKey(env: Record<string, string>): string {
  return (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
}

function volcVisualCredentials(env: Record<string, string>): {
  accessKeyId: string
  secretAccessKey: string
  region: string
} | null {
  const accessKeyId = (
    env.JIMENG_ACCESS_KEY_ID ??
    env.MERCHANT_AI_VOLC_ACCESS_KEY ??
    env.VOLC_ACCESSKEY ??
    env.VOLC_ACCESS_KEY_ID ??
    env.VOLC_AK ??
    ''
  ).trim()
  const secretAccessKey = (
    env.JIMENG_SECRET_ACCESS_KEY ??
    env.MERCHANT_AI_VOLC_SECRET_KEY ??
    env.VOLC_SECRETKEY ??
    env.VOLC_SECRET_ACCESS_KEY ??
    env.VOLC_SK ??
    ''
  ).trim()
  if (!accessKeyId || !secretAccessKey) return null
  const region =
    (env.JIMENG_REGION ?? env.MERCHANT_AI_VOLC_REGION ?? env.VOLC_REGION ?? 'cn-north-1').trim() ||
    'cn-north-1'
  return { accessKeyId, secretAccessKey, region }
}

function parseJudge(text: string): { scene: string; blur: string; reason: string } {
  const raw = text.trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] || raw).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body
  try {
    const parsed = JSON.parse(slice) as { scene?: unknown; blur?: unknown; reason?: unknown }
    return {
      scene: String(parsed.scene || '').trim().toLowerCase(),
      blur: String(parsed.blur || '').trim().toLowerCase(),
      reason: String(parsed.reason || '').trim().slice(0, 40),
    }
  } catch {
    return { scene: '', blur: '', reason: '' }
  }
}

export function chooseClarifyRoute(
  sceneRaw: string,
  blurRaw: string,
  width: number,
  height: number,
  reasonRaw: string,
): ClarifyChoice {
  const scene = sceneRaw
  const blur = blurRaw === 'heavy' ? 'heavy' : 'light'
  const reason = reasonRaw || '按画面内容选择变清晰方式'
  const small = width > 0 && height > 0 && Math.min(width, height) < 960
  if (scene === 'illustration') {
    return {
      route: 'qwen_edit',
      label: '清晰处理',
      detail: '保持原画，只让线条更清楚',
      reason,
    }
  }
  if (scene === 'portrait' || scene === 'photo' || scene === 'text' || scene === 'screenshot') {
    return {
      route: 'wanx_sr_1',
      label: '清晰处理',
      detail: '保持原图，只让画面更清楚',
      reason,
    }
  }
  if (blur === 'heavy' || small) {
    return {
      route: 'wanx_sr_2',
      label: '清晰处理',
      detail: '把模糊的地方补清楚',
      reason,
    }
  }
  return {
    route: 'wanx_sr_1',
    label: '清晰处理',
    detail: '保持原图，只让画面更清楚',
    reason,
  }
}

export function normalizeClarifyRoute(raw: unknown): ClarifyRoute | null {
  const v = String(raw || '').trim()
  if (v === 'wanx_sr_1' || v === 'wanx_sr_2' || v === 'qwen_edit') return v
  return null
}

export function describeClarifyRoute(route: ClarifyRoute, reason?: string): ClarifyChoice {
  if (route === 'qwen_edit') {
    return {
      route,
      label: '清晰处理',
      detail: '保持原画，只让线条更清楚',
      reason: reason || '这张图按原画变清晰',
    }
  }
  if (route === 'wanx_sr_2') {
    return {
      route,
      label: '清晰处理',
      detail: '把模糊的地方补清楚',
      reason: reason || '这张图有点糊，正在补清楚',
    }
  }
  return {
    route: 'wanx_sr_1',
    label: '清晰处理',
    detail: '保持原图，只让画面更清楚',
    reason: reason || '这张图按原样变清晰',
  }
}

export async function judgeClarifyImage(
  env: Record<string, string>,
  imageDataUrl: string,
  width: number,
  height: number,
): Promise<ClarifyChoice> {
  try {
    const res = await chatVisionAgentFromRequest(
      {
        provider: 'qwen',
        messages: [
          { role: 'system', content: JUDGE_SYSTEM },
          { role: 'user', content: '判断这张图适合哪种变清晰方式。' },
        ],
        imageDataUrls: [imageDataUrl],
        stream: false,
        temperature: 0,
      },
      env,
      'qwen',
    )
    const judged = parseJudge(res.content || '')
    const choice = chooseClarifyRoute(judged.scene, judged.blur, width, height, judged.reason)
    return { ...choice, visionModel: res.model }
  } catch {
    return describeClarifyRoute('wanx_sr_1', '按原图变清晰，不改人脸')
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTimed(url: string, init: RequestInit, ms = 20_000): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('处理时间有点长，请再试一次')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return { message: text.slice(0, 240) }
  }
}

function usableImageUrl(src: string): string {
  const url = src.trim()
  if (url.startsWith('https://') || url.startsWith('data:image/')) return url
  throw new Error('成图地址无效')
}

async function pollDashscope(apiKey: string, taskId: string): Promise<string> {
  const url = `${DASHSCOPE}/api/v1/tasks/${encodeURIComponent(taskId)}`
  for (let i = 0; i < 36; i++) {
    const res = await fetchTimed(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    const data = await readJson(res)
    if (!res.ok) {
      throw new Error(
        (typeof data.message === 'string' && data.message) || `查询任务 HTTP ${res.status}`,
      )
    }
    const output = data.output as Record<string, unknown> | undefined
    const status = String(output?.task_status || '')
    if (status === 'SUCCEEDED') {
      const urls = extractQwenVisionImageUrlsFromPayload(data)
      const first = urls[0]
      if (!first) throw new Error('清晰处理完成但没有图片')
      return first
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(
        (typeof output?.message === 'string' && output.message) ||
          (typeof data.message === 'string' && data.message) ||
          '清晰处理失败',
      )
    }
    await sleep(i < 8 ? 700 : 1200)
  }
  throw new Error('处理时间有点长，请再试一次')
}

async function runLensKeepFace(env: Record<string, string>, imageDataUrl: string): Promise<string> {
  const cred = volcVisualCredentials(env)
  if (!cred) throw new Error('画质增强未配置')
  const b64 = imageDataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim()
  if (!b64) throw new Error('请上传图片')
  const signed = signVolcVisualJsonPost({
    accessKeyId: cred.accessKeyId,
    secretAccessKey: cred.secretAccessKey,
    region: cred.region,
    action: 'CVProcess',
    version: '2022-08-31',
    body: {
      req_key: 'lens_lqir',
      binary_data_base64: [b64],
      resolution_boundary: '144p',
      enable_hdr: false,
      enable_wb: false,
      result_format: 1,
      jpg_quality: 95,
      return_url: true,
    },
  })
  const res = await fetchTimed(
    signed.url,
    { method: 'POST', headers: signed.headers, body: signed.body },
    40_000,
  )
  const data = await readJson(res)
  if (!res.ok || Number(data.code) !== 10000) {
    const msg = typeof data.message === 'string' ? data.message : ''
    throw new Error(msg || '清晰处理失败')
  }
  const payload = (data.data as Record<string, unknown> | undefined) ?? data
  const urls = payload.image_urls
  const first = Array.isArray(urls) ? urls.find((u) => typeof u === 'string' && u.trim()) : ''
  if (typeof first === 'string') return usableImageUrl(first)
  throw new Error('清晰处理没有返回图片')
}

async function runWanxSuperResolution(apiKey: string, imageDataUrl: string): Promise<string> {
  const res = await fetchTimed(`${DASHSCOPE}/api/v1/services/aigc/image2image/image-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'wanx2.1-imageedit',
      input: {
        function: 'super_resolution',
        prompt: FACE_LOCK_PROMPT,
        base_image_url: imageDataUrl,
      },
      parameters: { upscale_factor: 1, n: 1 },
    }),
  })
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(
      (typeof data.message === 'string' && data.message) || `清晰处理失败 HTTP ${res.status}`,
    )
  }
  const output = data.output as Record<string, unknown> | undefined
  const taskId = typeof output?.task_id === 'string' ? output.task_id : ''
  if (!taskId) throw new Error('清晰处理没有返回任务号')
  const remote = await pollDashscope(apiKey, taskId)
  return usableImageUrl(remote)
}

async function runQwenImageEdit(apiKey: string, imageDataUrl: string): Promise<string> {
  const res = await fetchTimed(`${DASHSCOPE}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-image-edit',
      input: {
        messages: [
          {
            role: 'user',
            content: [{ image: imageDataUrl }, { text: EDIT_PROMPT }],
          },
        ],
      },
      parameters: { n: 1 },
    }),
  })
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(
      (typeof data.message === 'string' && data.message) || `清晰处理失败 HTTP ${res.status}`,
    )
  }
  const urls = extractQwenVisionImageUrlsFromPayload(data)
  const first = urls[0]
  if (!first) throw new Error('清晰处理没有返回图片')
  return usableImageUrl(first)
}

export async function runClarifyImage(
  env: Record<string, string>,
  imageDataUrl: string,
  route: ClarifyRoute,
): Promise<{ imageUrl: string; choice: ClarifyChoice; fallbackNote?: string }> {
  const choice = describeClarifyRoute(route)
  if (route !== 'qwen_edit') {
    try {
      const imageUrl = await runLensKeepFace(env, imageDataUrl)
      return { imageUrl, choice }
    } catch (lensErr) {
      const key = qwenKey(env)
      if (!key) throw lensErr instanceof Error ? lensErr : new Error('清晰处理暂时不可用')
      console.error(
        '[image-clarify] lens failed',
        lensErr instanceof Error ? lensErr.message.slice(0, 200) : 'unknown',
      )
      const imageUrl = await runWanxSuperResolution(key, imageDataUrl)
      return { imageUrl, choice, fallbackNote: '已换成不改人脸的清晰处理' }
    }
  }
  const key = qwenKey(env)
  if (!key) throw new Error('未配置通义千问 Key，无法变清晰')
  try {
    const imageUrl = await runQwenImageEdit(key, imageDataUrl)
    return { imageUrl, choice }
  } catch {
    const imageUrl = await runLensKeepFace(env, imageDataUrl)
    return {
      imageUrl,
      choice: describeClarifyRoute('wanx_sr_1', choice.reason),
      fallbackNote: '已换成不改人脸的清晰处理',
    }
  }
}

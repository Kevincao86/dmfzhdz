/**
 * 图片变清晰：先用视觉模型看图，再选万相超分或千问图像编辑。
 * 实拍、人像、文字走万相 super_resolution；插画走 qwen-image-edit。
 */
import { chatVisionAgentFromRequest } from './merchantVisionLlmChat.js'
import { extractQwenVisionImageUrlsFromPayload } from '../src/lib/qwenVisionApi.js'

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
有真实人脸用 portrait。有商品用 product。以文字或界面为主用 text 或 screenshot。实拍风景人物用 photo。只有卡通、插画、手绘才用 illustration。`

const EDIT_PROMPT =
  '这是同一张插画的高清修复。保持画面里的人物、物体、构图和颜色不变，只提高清晰度和线条细节。不要重画，不要换风格，不要加字，不要改背景。'

const DASHSCOPE = 'https://dashscope.aliyuncs.com'

function qwenKey(env: Record<string, string>): string {
  return (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
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
      label: '千问图像编辑',
      detail: '插画只补清晰度',
      reason,
    }
  }
  if (scene === 'portrait' || scene === 'text' || scene === 'screenshot') {
    return {
      route: 'wanx_sr_1',
      label: '万相超分',
      detail: '保持原尺寸，只提高清晰度',
      reason,
    }
  }
  if (blur === 'heavy' || small) {
    return {
      route: 'wanx_sr_2',
      label: '万相超分',
      detail: '放大并补充细节',
      reason,
    }
  }
  return {
    route: 'wanx_sr_1',
    label: '万相超分',
    detail: '保持原尺寸，只提高清晰度',
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
      label: '千问图像编辑',
      detail: '插画只补清晰度',
      reason: reason || '插画适合图像编辑',
    }
  }
  if (route === 'wanx_sr_2') {
    return {
      route,
      label: '万相超分',
      detail: '放大并补充细节',
      reason: reason || '画面偏小或比较糊',
    }
  }
  return {
    route: 'wanx_sr_1',
    label: '万相超分',
    detail: '保持原尺寸，只提高清晰度',
    reason: reason || '实拍照片按原图超分',
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
    return describeClarifyRoute(
      width > 0 && height > 0 && Math.min(width, height) < 960 ? 'wanx_sr_2' : 'wanx_sr_1',
      '没看清画面，按实拍照片做超分',
    )
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return { message: text.slice(0, 240) }
  }
}

async function downloadDataUrl(src: string): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 25_000)
  try {
    const res = await fetch(src, { signal: ac.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`成图下载失败 HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('成图为空')
    if (buf.length > 8 * 1024 * 1024) throw new Error('成图过大')
    const ctRaw = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() || 'image/jpeg'
    const ct = /^image\//i.test(ctRaw) ? ctRaw : 'image/jpeg'
    return `data:${ct};base64,${buf.toString('base64')}`
  } finally {
    clearTimeout(timer)
  }
}

async function pollDashscope(apiKey: string, taskId: string): Promise<string> {
  const url = `${DASHSCOPE}/api/v1/tasks/${encodeURIComponent(taskId)}`
  for (let i = 0; i < 36; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
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
      if (!first) throw new Error('超分完成但没有图片')
      return first
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(
        (typeof output?.message === 'string' && output.message) ||
          (typeof data.message === 'string' && data.message) ||
          '超分失败',
      )
    }
    await sleep(i < 8 ? 700 : 1200)
  }
  throw new Error('超分超时，请稍后重试')
}

async function runWanxSuperResolution(
  apiKey: string,
  imageDataUrl: string,
  factor: 1 | 2,
): Promise<string> {
  const res = await fetch(`${DASHSCOPE}/api/v1/services/aigc/image2image/image-synthesis`, {
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
        prompt: '图像超分。',
        base_image_url: imageDataUrl,
      },
      parameters: { upscale_factor: factor, n: 1 },
    }),
  })
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(
      (typeof data.message === 'string' && data.message) || `万相超分 HTTP ${res.status}`,
    )
  }
  const output = data.output as Record<string, unknown> | undefined
  const taskId = typeof output?.task_id === 'string' ? output.task_id : ''
  if (!taskId) throw new Error('万相超分没有返回任务号')
  const remote = await pollDashscope(apiKey, taskId)
  return downloadDataUrl(remote)
}

async function runQwenImageEdit(apiKey: string, imageDataUrl: string): Promise<string> {
  const res = await fetch(`${DASHSCOPE}/api/v1/services/aigc/multimodal-generation/generation`, {
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
      (typeof data.message === 'string' && data.message) || `千问图像编辑 HTTP ${res.status}`,
    )
  }
  const urls = extractQwenVisionImageUrlsFromPayload(data)
  const first = urls[0]
  if (!first) throw new Error('千问图像编辑没有返回图片')
  if (first.startsWith('data:image/')) return first
  return downloadDataUrl(first)
}

export async function runClarifyImage(
  env: Record<string, string>,
  imageDataUrl: string,
  route: ClarifyRoute,
): Promise<{ imageUrl: string; choice: ClarifyChoice; fallbackNote?: string }> {
  const key = qwenKey(env)
  if (!key) throw new Error('未配置通义千问 Key，无法变清晰')
  const choice = describeClarifyRoute(route)
  if (route === 'qwen_edit') {
    try {
      const imageUrl = await runQwenImageEdit(key, imageDataUrl)
      return { imageUrl, choice }
    } catch {
      const imageUrl = await runWanxSuperResolution(key, imageDataUrl, 1)
      return {
        imageUrl,
        choice: describeClarifyRoute('wanx_sr_1', choice.reason),
        fallbackNote: '千问图像编辑失败，已改用万相超分',
      }
    }
  }
  const imageUrl = await runWanxSuperResolution(key, imageDataUrl, route === 'wanx_sr_2' ? 2 : 1)
  return { imageUrl, choice }
}

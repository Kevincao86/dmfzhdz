import { mpApiFetchCandidates } from '../mpApiBase'
import { getToken } from '../mpSession'

export const COVER_AI_POINTS = 8
export const COVER_AI_RECHARGE_PATH = '/profile/points-recharge'

function mpAuthHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}`, 'X-Mp-Session': token }
}

function buildPrompt(ctx: { title?: string; platform?: string; region?: string }, userText?: string) {
  const title = String(ctx.title || '').trim()
  const platform = String(ctx.platform || '').trim()
  const region = String(ctx.region || '').trim()
  const user = String(userText || '').trim()
  return [
    '横版 5:4 微信小程序分享封面（宽:高=5:4，约 1280×1024），生活服务商业摄影质感，画面干净、光影自然。',
    '不要做成竖版海报、9:16 长图或上下留白；构图按横版卡片铺满，主视觉居中。',
    title ? `招募主题：${title}` : '',
    platform ? `投放平台氛围：${platform}` : '',
    region ? `城市场景：${region}` : '',
    user
      ? `用户补充要求（封面文字与风格）：${user}`
      : '未提供额外文案时，以探店/生活方式氛围为主视觉，构图简洁有质感。',
  ]
    .filter(Boolean)
    .join('\n')
}

async function postJson(apiPath: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const urls = mpApiFetchCandidates(apiPath)
  let lastErr = 'request_failed'
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...mpAuthHeaders() },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && data.ok !== false) return data
      lastErr = String(data.message || data.error || `HTTP ${res.status}`)
      if (res.status === 404) continue
      throw new Error(lastErr)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not_found/i.test(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

export function isCoverAiInsufficient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /积分不足|insufficient_points/i.test(msg)
}

export function pickReferenceDataUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('未选择图片'))
        return
      }
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const maxDim = 768
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        const scale = Math.min(1, maxDim / Math.max(w, h, 1))
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('图片处理失败'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('读取参考图失败'))
      }
      img.src = url
    }
    input.click()
  })
}

export async function generateRecruitCoverImage(opts: {
  title?: string
  platform?: string
  region?: string
  userText?: string
  referenceImage?: string
}): Promise<{ imageUrl: string; pointsCharged: number }> {
  const afford = await postJson('/api/meoo-ops-mp-auth', {
    action: 'mp_ai_points_afford',
    kind: 'visual_studio_image',
    sessionToken: getToken(),
    token: getToken(),
  }).catch((e) => {
    if (isCoverAiInsufficient(e)) throw e
    return null
  })
  if (afford && afford.mpAiPointsBalance != null) {
    const balance = Math.max(0, Math.floor(Number(afford.mpAiPointsBalance) || 0))
    if (balance < COVER_AI_POINTS) {
      throw new Error(
        `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${COVER_AI_POINTS}），请充值积分或升级套餐后再试`,
      )
    }
  }

  const prompt = buildPrompt(
    { title: opts.title, platform: opts.platform, region: opts.region },
    opts.userText,
  )
  const imageBody: Record<string, unknown> = {
    prompt,
    exact_prompt: true,
    prefer_wanx_poster: false,
    aspect_ratio: '4:3',
    wanx_size: '1280*1024',
    preferred_vendor: 'qwen',
  }
  const ref = String(opts.referenceImage || '').trim()
  if (ref) imageBody.reference_image = ref
  const gen = await postJson('/api/meoo-ai-agent-image', imageBody)
  const imageUrl = String(gen.imageUrl || gen.url || gen.image_url || '').trim()
  if (!imageUrl) throw new Error('未返回图片地址')

  const spend = await postJson('/api/meoo-ops-mp-auth', {
    action: 'mp_ai_points_spend',
    kind: 'visual_studio_image',
    idempotencyKey: `recruit-cover-ai-${Date.now()}`,
    note: '招募封面生图',
    sessionToken: getToken(),
    token: getToken(),
  })
  return {
    imageUrl,
    pointsCharged: Math.max(0, Math.floor(Number(spend.pointsCharged) || COVER_AI_POINTS)),
  }
}

/**
 * 百炼视觉多 API 路由：wanx 文生图、图生图、qwen-image 多模态、视频合成。
 */

const DASHSCOPE = 'https://dashscope.aliyuncs.com'

export type QwenVisionRequest = {
  url: string
  body: Record<string, unknown>
}

function isQwenImageModel(modelId: string): boolean {
  return /^qwen-image/i.test(modelId.trim())
}

function isQwenImageEditModel(modelId: string): boolean {
  const m = modelId.toLowerCase()
  return /qwen-image-edit|imageedit|repaint|out-painting|i2i-preview/.test(m)
}

function isWanxLegacyModel(modelId: string): boolean {
  const m = modelId.toLowerCase()
  return /^wanx/i.test(m) || /^wan2\.[0-6]-/i.test(m) || m === 'z-image-turbo'
}

/** 构建异步生图任务请求体 */
export function buildQwenVisionImageRequest(
  modelId: string,
  prompt: string,
  opts?: {
    refImageUrl?: string
    parameterExtras?: Record<string, unknown>
    negativePrompt?: string
  },
): QwenVisionRequest {
  const ref = opts?.refImageUrl?.trim()
  const parameters = {
    size: '1024*1024',
    n: 1,
    ...(opts?.parameterExtras ?? {}),
  }

  if (isQwenImageEditModel(modelId) && ref) {
    return {
      url: `${DASHSCOPE}/api/v1/services/aigc/image2image/image-synthesis`,
      body: {
        model: modelId,
        input: {
          prompt,
          image_url: ref,
          ...(opts?.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
        },
        parameters,
      },
    }
  }

  if (isQwenImageModel(modelId)) {
    return {
      url: `${DASHSCOPE}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: modelId,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
        },
        parameters,
      },
    }
  }

  const input: Record<string, unknown> = { prompt }
  if (ref) {
    input.ref_image = ref
    if (opts?.negativePrompt) input.negative_prompt = opts.negativePrompt
  }

  const url = isWanxLegacyModel(modelId)
    ? `${DASHSCOPE}/api/v1/services/aigc/text2image/image-synthesis`
    : `${DASHSCOPE}/api/v1/services/aigc/text2image/image-synthesis`

  return {
    url,
    body: {
      model: modelId,
      input,
      parameters: {
        style: '<auto>',
        ...parameters,
      },
    },
  }
}

/** 从百炼任务结果提取图片 URL（兼容 wanx / qwen-image 多模态） */
export function extractQwenVisionImageUrls(output: Record<string, unknown> | undefined): string[] {
  if (!output) return []
  const urls: string[] = []
  const results = output.results as unknown[] | undefined
  if (Array.isArray(results)) {
    for (const row of results) {
      const r = row as Record<string, unknown>
      if (typeof r.url === 'string' && r.url.trim()) urls.push(r.url.trim())
    }
  }
  const choices = output.choices as unknown[] | undefined
  if (Array.isArray(choices)) {
    for (const row of choices) {
      const msg = (row as { message?: { content?: unknown } }).message
      const content = msg?.content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (!part || typeof part !== 'object') continue
        const p = part as Record<string, unknown>
        if (typeof p.image === 'string' && p.image.trim()) urls.push(p.image.trim())
        if (typeof p.url === 'string' && p.url.trim()) urls.push(p.url.trim())
      }
    }
  }
  if (typeof output.url === 'string' && output.url.trim()) urls.push(output.url.trim())
  return urls
}

/** wan2.7 图生视频新协议：input.media 必填，url 须为公网 https */
export function isQwenWan27VideoModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  return /^wan2\.7-/.test(m) || m === 'wan2.7-i2v' || m === 'wan2.7-t2v' || m === 'wan2.7-r2v'
}

export function isQwenWan27I2vModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  return /-i2v/.test(m) || m === 'wan2.7-r2v'
}

function wan27ResolutionFromRatio(ratio?: string): string {
  if (ratio === '16:9' || ratio === '1:1') return '720P'
  return '720P'
}

/** 构建视频合成请求 */
export function buildQwenVisionVideoRequest(
  modelId: string,
  prompt: string,
  opts?: {
    imgUrl?: string
    duration?: number
    ratio?: string
  },
): QwenVisionRequest {
  const text = prompt || '生成连贯竖屏口播短视频，人物口型自然。'
  const img = opts?.imgUrl?.trim()
  const useWan27 = isQwenWan27VideoModel(modelId)

  if (useWan27) {
    const input: Record<string, unknown> = { prompt: text }
    if (img && isQwenWan27I2vModel(modelId)) {
      input.media = [{ type: 'first_frame', url: img }]
    }
    const parameters: Record<string, unknown> = {
      resolution: wan27ResolutionFromRatio(opts?.ratio),
      prompt_extend: true,
      watermark: false,
    }
    const dur = opts?.duration
    if (dur && Number.isFinite(dur)) {
      parameters.duration = Math.max(2, Math.min(15, Math.round(dur)))
    }
    return {
      url: `${DASHSCOPE}/api/v1/services/aigc/video-generation/video-synthesis`,
      body: { model: modelId, input, parameters },
    }
  }

  const input: Record<string, unknown> = { prompt: text }
  if (img) {
    input.img_url = img
    input.first_frame_url = img
    input.image_url = img
  }
  const size =
    opts?.ratio === '16:9' ? '1280*720' : opts?.ratio === '1:1' ? '960*960' : '720*1280'
  const parameters: Record<string, unknown> = { size }
  if (opts?.duration) parameters.duration = opts.duration

  return {
    url: `${DASHSCOPE}/api/v1/services/aigc/video-generation/video-synthesis`,
    body: { model: modelId, input, parameters },
  }
}

/** 万相数字人 wan2.2-s2v：单张人像 + 口播音频 → 对口型视频（音频须公网 https） */
export function buildQwenWanS2vRequest(opts: {
  imageUrl: string
  audioUrl: string
  resolution?: '480P' | '720P'
}): QwenVisionRequest {
  return {
    url: `${DASHSCOPE}/api/v1/services/aigc/image2video/video-synthesis`,
    body: {
      model: 'wan2.2-s2v',
      input: {
        image_url: opts.imageUrl.trim(),
        audio_url: opts.audioUrl.trim(),
      },
      parameters: {
        resolution: opts.resolution ?? '720P',
      },
    },
  }
}

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

/** wan2.7 / wan2.6-image 走 multimodal-generation（messages），非旧版 wanx text2image */
export function isWan27MultimodalImageModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  return /^wan2\.7-image/.test(m) || m === 'wan2.6-image'
}

/** 万相/wan2.x 自定义像素：边长 768–4096，宽高比须在 1:4～4:1（上游硬限制） */
const WANX_SIZE_MIN_SIDE = 768
const WANX_SIZE_MAX_SIDE = 4096
const WANX_SIZE_MAX_ASPECT = 4

/**
 * 规范化万相 size：
 * - 支持 1K/2K/4K 或 `宽*高`
 * - 纠正「超宽横幅被对调成竖条」的 461×4096 类非法尺寸
 * - 钳制到最长边比 ≤4:1，避免 Aspect ratio must be between 1:4 and 4:1
 */
export function normalizeWan27ImageSizeParam(raw?: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return '2K'
  if (/^(1k|2k|4k)$/i.test(t)) return t.toUpperCase()
  const m = /^(\d{3,5})\s*[*×x]\s*(\d{3,5})$/i.exec(t)
  if (!m) return '2K'

  let w = Math.max(1, Math.round(Number(m[1]) || 1024))
  let h = Math.max(1, Math.round(Number(m[2]) || 1024))

  // 超高竖条（常见于超宽五连图被对调）：先还原为横图再钳比例
  if (h > w && h / w > WANX_SIZE_MAX_ASPECT + 0.001) {
    const tmp = w
    w = h
    h = tmp
  }

  if (w / h > WANX_SIZE_MAX_ASPECT + 0.001) {
    h = Math.max(1, Math.round(w / WANX_SIZE_MAX_ASPECT))
  } else if (h / w > WANX_SIZE_MAX_ASPECT + 0.001) {
    w = Math.max(1, Math.round(h / WANX_SIZE_MAX_ASPECT))
  }

  if (Math.max(w, h) > WANX_SIZE_MAX_SIDE) {
    const s = WANX_SIZE_MAX_SIDE / Math.max(w, h)
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
  }
  if (Math.min(w, h) < WANX_SIZE_MIN_SIDE) {
    const s = WANX_SIZE_MIN_SIDE / Math.min(w, h)
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
  }

  w = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, w))
  h = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, h))

  // 对齐 16 像素，降低 wan2.x 对非对齐尺寸返回 Common error 的概率
  w = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, Math.floor(w / 16) * 16))
  h = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, Math.floor(h / 16) * 16))

  if (w / h > WANX_SIZE_MAX_ASPECT + 0.001) {
    h = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, Math.floor(Math.round(w / WANX_SIZE_MAX_ASPECT) / 16) * 16))
  } else if (h / w > WANX_SIZE_MAX_ASPECT + 0.001) {
    w = Math.max(WANX_SIZE_MIN_SIDE, Math.min(WANX_SIZE_MAX_SIDE, Math.floor(Math.round(h / WANX_SIZE_MAX_ASPECT) / 16) * 16))
  }

  return `${w}*${h}`
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
  const rawExtras = { ...(opts?.parameterExtras ?? {}) }
  /** multimodal / edit 不认旧版 wanx 的 ref_strength / ref_mode，带上会 InvalidParameter */
  const { ref_strength: _rs, ref_mode: _rm, ...safeExtras } = rawExtras as Record<string, unknown> & {
    ref_strength?: unknown
    ref_mode?: unknown
  }
  void _rs
  void _rm

  if (isQwenImageEditModel(modelId) && ref) {
    const parameters = {
      size: '1024*1024',
      n: 1,
      ...safeExtras,
    }
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

  if (isQwenImageModel(modelId) || isWan27MultimodalImageModel(modelId)) {
    const content: Array<Record<string, string>> = [{ text: prompt }]
    if (ref) content.push({ image: ref })
    const sizeRaw = safeExtras.size
    const size =
      typeof sizeRaw === 'string' && sizeRaw.trim()
        ? normalizeWan27ImageSizeParam(sizeRaw)
        : isWan27MultimodalImageModel(modelId)
          ? '2K'
          : '1024*1024'
    const { size: _dropSize, ...restExtras } = safeExtras
    void _dropSize
    return {
      url: `${DASHSCOPE}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: modelId,
        input: {
          messages: [
            {
              role: 'user',
              content,
            },
          ],
        },
        parameters: {
          n: 1,
          ...restExtras,
          size,
          watermark: false,
          ...(isWan27MultimodalImageModel(modelId) ? { thinking_mode: true } : {}),
        },
      },
    }
  }

  const { size: _legacySizeDrop, ...legacyExtras } = rawExtras as Record<string, unknown> & {
    size?: unknown
  }
  void _legacySizeDrop
  const legacySizeRaw =
    typeof rawExtras.size === 'string' && rawExtras.size.trim()
      ? normalizeWan27ImageSizeParam(rawExtras.size)
      : '1024*1024'
  const parameters = {
    n: 1,
    ...legacyExtras,
    size: legacySizeRaw,
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

/** 从百炼同步 multimodal 响应或异步 task 查询结果提取图片 URL */
export function extractQwenVisionImageUrlsFromPayload(
  payload: Record<string, unknown> | undefined,
): string[] {
  if (!payload) return []
  const fromOutput = extractQwenVisionImageUrls(
    (payload.output as Record<string, unknown> | undefined) ?? undefined,
  )
  if (fromOutput.length > 0) return fromOutput
  return extractQwenVisionImageUrls(payload)
}

/** wan2.7 / qwen-image 等多模态生图：同步返回；旧版 wanx：须 X-DashScope-Async + 轮询 */
export function qwenVisionImageUsesAsyncHeader(modelId: string): boolean {
  return !isQwenImageModel(modelId) && !isWan27MultimodalImageModel(modelId)
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

/** 单张参考图图生视频（排除 t2v / r2v / kf2v 误配到 i2v 场景） */
export function isQwenSingleFrameI2vModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  if (/-t2v/.test(m) && !/-i2v/.test(m)) return false
  if (/-r2v|kf2v|vace/.test(m)) return false
  return /-i2v/.test(m) || m === 'wan2.6-i2v' || m === 'wan2.6-i2v-flash'
}

/** 文生视频（排除 videoretalk / liveportrait / r2v / 口型等需 video_url 的模型） */
export function isQwenT2vCompatibleModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  if (!m) return false
  if (
    /-r2v|kf2v|vace|videoretalk|liveportrait|animate-anyone|videoedit|video-edit|style-transform|s2v|emo-v1|-animate-/.test(
      m,
    )
  ) {
    return false
  }
  if (/-i2v/.test(m) && !/-t2v/.test(m)) return false
  return /-t2v|\.t2v|wanx.*t2v|happyhorse.*t2v/.test(m) || m === 'wan2.6-t2v' || m === 'wan2.7-t2v'
}

/** wan2.6 可直接用 base64；wan2.7 需 OSS https，故排后 */
export function sortQwenSingleFrameI2vModels(ids: readonly string[]): string[] {
  const wan26: string[] = []
  const mid: string[] = []
  const wan27: string[] = []
  const rest: string[] = []
  for (const id of ids) {
    const m = id.toLowerCase()
    if (/wan2\.6.*i2v/.test(m)) wan26.push(id)
    else if (/wan2\.7.*i2v/.test(m)) wan27.push(id)
    else if (/wan2\.[25].*i2v|wanx2\./.test(m)) mid.push(id)
    else rest.push(id)
  }
  return [...wan26, ...mid, ...rest, ...wan27]
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
    if (isQwenWan27I2vModel(modelId) && img) {
      input.media = [{ type: 'first_frame', url: img }]
    }
    const parameters: Record<string, unknown> = {
      resolution: wan27ResolutionFromRatio(opts?.ratio),
      ratio:
        opts?.ratio === '16:9' || opts?.ratio === '9:16' || opts?.ratio === '1:1'
          ? opts.ratio
          : '9:16',
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

const S2V_SYNTH_URL = `${DASHSCOPE}/api/v1/services/aigc/image2video/video-synthesis`
const EMO_FACE_DETECT_URL = `${DASHSCOPE}/api/v1/services/aigc/image2video/face-detect`

function isEmoS2vModel(modelId: string): boolean {
  return /^emo(-v1)?$/i.test(modelId.trim())
}

function isWanS2vModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase()
  return m === 'wan2.2-s2v' || m === 'wan2.2-s2v-detect'
}

/** 数字人口播口型：仅接受「单图 + 音频」的模型（不含 videoretalk 等需 video_url 的） */
export function isQwenDhS2vCompatibleModel(modelId: string): boolean {
  const m = modelId.trim()
  return isWanS2vModel(m) || isEmoS2vModel(m)
}

/** 万相 wan2.2-s2v：单张人像 + 口播音频 → 对口型视频（音频须公网 https） */
export function buildQwenWanS2vRequest(opts: {
  modelId?: string
  imageUrl: string
  audioUrl: string
  resolution?: '480P' | '720P'
}): QwenVisionRequest {
  const model = (opts.modelId ?? 'wan2.2-s2v').trim() || 'wan2.2-s2v'
  return {
    url: S2V_SYNTH_URL,
    body: {
      model,
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

function parseEmoBBox(j: Record<string, unknown>): { face_bbox: number[]; ext_bbox: number[] } | null {
  const output = j.output as Record<string, unknown> | undefined
  const face = output?.face_bbox ?? j.face_bbox
  const ext = output?.ext_bbox ?? j.ext_bbox
  if (!Array.isArray(face) || face.length < 4 || !Array.isArray(ext) || ext.length < 4) return null
  return { face_bbox: face as number[], ext_bbox: ext as number[] }
}

/** EMO 口型：先 face-detect 再合成（需 face_bbox / ext_bbox） */
export async function buildQwenEmoS2vRequest(
  apiKey: string,
  opts: { imageUrl: string; audioUrl: string; ratio?: '1:1' | '3:4' },
): Promise<QwenVisionRequest> {
  const detectRes = await fetch(EMO_FACE_DETECT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'emo-detect-v1',
      input: { image_url: opts.imageUrl.trim() },
      parameters: { ratio: opts.ratio ?? '3:4' },
    }),
  })
  const detectJson = (await detectRes.json()) as Record<string, unknown>
  if (!detectRes.ok) {
    const msg =
      (typeof detectJson.message === 'string' && detectJson.message) ||
      `EMO 人像检测失败 HTTP ${detectRes.status}`
    throw new Error(msg)
  }
  const boxes = parseEmoBBox(detectJson)
  if (!boxes) throw new Error('EMO 人像检测未返回 face_bbox/ext_bbox，请换更清晰的正面照片')

  return {
    url: S2V_SYNTH_URL,
    body: {
      model: 'emo-v1',
      input: {
        image_url: opts.imageUrl.trim(),
        audio_url: opts.audioUrl.trim(),
        face_bbox: boxes.face_bbox,
        ext_bbox: boxes.ext_bbox,
      },
      parameters: { style_level: 'normal' },
    },
  }
}

/** 按模型构建数字人口播口型请求（wan2.2-s2v 或 emo-v1） */
export async function buildQwenDhS2vRequest(
  apiKey: string,
  modelId: string,
  opts: {
    imageUrl: string
    audioUrl: string
    resolution?: '480P' | '720P'
    frameMode?: 'half' | 'full'
  },
): Promise<QwenVisionRequest> {
  const mid = modelId.trim()
  if (isEmoS2vModel(mid)) {
    return buildQwenEmoS2vRequest(apiKey, {
      imageUrl: opts.imageUrl,
      audioUrl: opts.audioUrl,
      ratio: opts.frameMode === 'full' ? '1:1' : '3:4',
    })
  }
  if (!isWanS2vModel(mid)) {
    throw new Error(`不支持的数字人口播口型模型：${mid}`)
  }
  return buildQwenWanS2vRequest({
    modelId: mid,
    imageUrl: opts.imageUrl,
    audioUrl: opts.audioUrl,
    resolution: opts.resolution,
  })
}

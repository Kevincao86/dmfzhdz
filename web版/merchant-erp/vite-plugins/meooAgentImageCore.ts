import { wanxSizeToGptImage2Size } from '../src/lib/aiImageStudioGptSize.js'
import {
  tokenmixImagesCreate,
  tokenmixImagesGenerate,
  tokenmixImagesPollOnce,
} from './aiGateway/tokenmixImageGenerate.js'
import { runAgentFreeformTextToImage, type AgentFreeformImageOpts } from './merchantAiUpstream.js'

/**
 * data URL / 裸 base64 → OSS 公网 https（旧版 wanx 图生图常拒 data:）。
 * OSS 不可用时回退原始 data URL，供 wan2.7 multimodal / 豆包等可吃内联图的链路继续生图，避免方案墙整批失败。
 */
async function resolveReferenceImageToHttps(
  env: Record<string, string>,
  referenceImage: string | undefined,
): Promise<{ ok: true; url?: string } | { ok: false; message: string }> {
  const t = String(referenceImage || '').trim()
  if (!t) return { ok: true, url: undefined }
  if (/^https?:\/\//i.test(t)) return { ok: true, url: t }

  let buffer: Buffer
  let contentType = 'image/jpeg'
  let fileName = `agent-ref-${Date.now()}.jpg`
  const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(t)
  if (dataUrl) {
    contentType = (dataUrl[1] || 'image/jpeg').trim() || 'image/jpeg'
    const ext = /png/i.test(contentType) ? 'png' : /webp/i.test(contentType) ? 'webp' : 'jpg'
    fileName = `agent-ref-${Date.now()}.${ext}`
    try {
      buffer = Buffer.from(dataUrl[2] || '', 'base64')
    } catch {
      return { ok: false, message: '参考图数据无效，请重新上传' }
    }
  } else {
    const pure = t.replace(/\s/g, '')
    if (!/^[a-z0-9+/=]+$/i.test(pure)) {
      return { ok: false, message: '参考图格式无效，请重新上传图片' }
    }
    try {
      buffer = Buffer.from(pure, 'base64')
    } catch {
      return { ok: false, message: '参考图数据无效，请重新上传' }
    }
  }
  if (!buffer.length) return { ok: false, message: '参考图为空，请重新上传' }
  if (buffer.length > 8 * 1024 * 1024) {
    return { ok: false, message: '参考图过大，请压缩后再试（建议边长 ≤1280）' }
  }

  try {
    const { loadIceGatewayConfig } = await import('./aliyunIceGateway.js')
    const { putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(process.cwd(), env)
    if (!cfg) {
      console.warn('[meoo-agent-image] OSS 未配置，参考图回退 data URL')
      return { ok: true, url: t.startsWith('data:') ? t : `data:${contentType};base64,${buffer.toString('base64')}` }
    }
    const put = await putIceSourceObject(cfg, env, { fileName, contentType, buffer })
    if (!put.ok || !put.mediaUrl) {
      const detail = !put.ok && 'message' in put ? String(put.message || '').slice(0, 120) : ''
      console.warn('[meoo-agent-image] 参考图 OSS 上传失败，回退 data URL', detail)
      return { ok: true, url: t.startsWith('data:') ? t : `data:${contentType};base64,${buffer.toString('base64')}` }
    }
    return { ok: true, url: put.mediaUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[meoo-agent-image] 参考图处理异常，回退 data URL', msg.slice(0, 160))
    return { ok: true, url: t.startsWith('data:') ? t : `data:${contentType};base64,${buffer.toString('base64')}` }
  }
}

export type MeooAgentImageRequestInput = {
  prompt: string
  referenceImage?: string
  preferredVendor?: 'qwen' | 'doubao' | 'minimax'
  preferredModelId?: string
  imageRoute: 'builtin' | 'tokenmix'
  tokenmixImageModel?: string
  exactPrompt?: boolean
  wanxSize?: string
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  doubaoSize?: '1K' | '2K' | '4K'
  preferWanxPoster?: boolean
}

export type MeooAgentImageOkJson =
  | {
      ok: true
      imageUrl: string
      channel: 'tokenmix'
      displayModel: string
      fallbackNote?: string
    }
  | {
      ok: true
      imageUrl: string
      channel: 'builtin'
      vendorUsed: 'qwen' | 'doubao' | 'minimax'
      fallbackNote?: string
    }
  | {
      ok: true
      pending: true
      channel: 'tokenmix'
      taskId: string
      displayModel: string
      retryAfterSec?: number
    }

export type MeooAgentImageResult = MeooAgentImageOkJson | { ok: false; message: string }

function resolveGptQualityAndSize(
  modelId: string,
  wanxSize?: string,
): { size?: string; quality?: 'low' | 'medium' | 'high' } {
  const isGptImage = /^gpt-image/i.test(modelId)
  if (!isGptImage) {
    const size = wanxSize?.trim().replace(/\*/g, 'x').replace(/×/g, 'x') || undefined
    return { size }
  }
  const size = wanxSizeToGptImage2Size(wanxSize)
  const m = size?.match(/^(\d+)x(\d+)$/i)
  const w = m ? Number(m[1]) : 0
  const h = m ? Number(m[2]) : 0
  const ratio = w > 0 && h > 0 ? Math.max(w, h) / Math.min(w, h) : 1
  // 超宽五连图用 low，缩短 TokenMix 排队；禁止回退万相
  return { size, quality: ratio >= 2.2 ? 'low' : 'high' }
}

/** 仅创建 TokenMix 任务（秒级返回），供视觉工坊浏览器短轮询 */
export async function runMeooAgentImageStartTokenmix(
  env: Record<string, string>,
  input: Pick<MeooAgentImageRequestInput, 'prompt' | 'tokenmixImageModel' | 'wanxSize'>,
): Promise<MeooAgentImageResult> {
  const tm = (input.tokenmixImageModel ?? '').trim()
  if (!tm) return { ok: false, message: 'tokenmix_image_model 为空' }
  try {
    const { size, quality } = resolveGptQualityAndSize(tm, input.wanxSize)
    const created = await tokenmixImagesCreate(env, tm, input.prompt, {
      quality,
      ...(size ? { size } : {}),
    })
    if (created.kind === 'ready') {
      return { ok: true, imageUrl: created.imageUrl, channel: 'tokenmix', displayModel: created.modelUsed }
    }
    return {
      ok: true,
      pending: true,
      channel: 'tokenmix',
      taskId: created.taskId,
      displayModel: created.modelUsed,
      retryAfterSec: created.retryAfterSec,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.slice(0, 600) }
  }
}

/** 单次轮询 TokenMix 任务 */
export async function runMeooAgentImagePollTokenmix(
  env: Record<string, string>,
  input: { taskId: string; tokenmixImageModel?: string },
): Promise<MeooAgentImageResult> {
  const taskId = input.taskId.trim()
  if (!taskId) return { ok: false, message: 'task_id 为空' }
  const fallbackModel = (input.tokenmixImageModel ?? 'gpt-image-2').trim() || 'gpt-image-2'
  try {
    const once = await tokenmixImagesPollOnce(env, taskId, fallbackModel)
    if (once.kind === 'ready') {
      return { ok: true, imageUrl: once.imageUrl, channel: 'tokenmix', displayModel: once.modelUsed }
    }
    if (once.kind === 'failed') return { ok: false, message: once.message }
    return {
      ok: true,
      pending: true,
      channel: 'tokenmix',
      taskId,
      displayModel: fallbackModel,
      retryAfterSec: once.retryAfterSec,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.slice(0, 600) }
  }
}

export async function runMeooAgentImageRequest(
  env: Record<string, string>,
  input: MeooAgentImageRequestInput,
): Promise<MeooAgentImageResult> {
  const {
    prompt,
    referenceImage,
    preferredVendor,
    preferredModelId,
    imageRoute,
    tokenmixImageModel,
    exactPrompt,
    wanxSize,
    aspectRatio,
    doubaoSize,
    preferWanxPoster,
  } = input
  const resolvedRef = await resolveReferenceImageToHttps(env, referenceImage)
  if (!resolvedRef.ok) return { ok: false, message: resolvedRef.message }
  const refHttps = resolvedRef.url
  const tm = (tokenmixImageModel ?? '').trim()
  const imageOpts: AgentFreeformImageOpts = {
    referenceImage: refHttps,
    exactPrompt,
    preferredModelId,
    wanxSize,
    aspectRatio,
    doubaoSize,
    preferWanxPoster,
  }

  if (imageRoute === 'tokenmix' && tm && !refHttps) {
    try {
      const isGptImage = /^gpt-image/i.test(tm)
      const { size, quality } = resolveGptQualityAndSize(tm, wanxSize)
      const genPromise = tokenmixImagesGenerate(env, tm, prompt, {
        quality,
        ...(size ? { size } : {}),
      })
      // gpt-image-2 在 TokenMix 为异步轮询，high/超宽可能 2～3 分钟；失败不切换其它模型（禁止回退万相）
      const timeoutMs = isGptImage ? 250_000 : 120_000
      const { imageUrl, modelUsed } = await Promise.race([
        genPromise,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`高级生图超时（${Math.round(timeoutMs / 1000)}秒），请稍后重试`)),
            timeoutMs,
          )
        }),
      ])
      return { ok: true, imageUrl, channel: 'tokenmix', displayModel: modelUsed }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg.slice(0, 600) }
    }
  }

  // 用户选了高级模型但带了参考图：高级接口不支持，禁止静默切到内置引擎
  if (imageRoute === 'tokenmix' && tm && refHttps) {
    return {
      ok: false,
      message: '高级生图暂不支持参考图，请去掉参考图后重试（不会改用其它模型）',
    }
  }

  const out = await runAgentFreeformTextToImage(env, prompt, preferredVendor, imageOpts)
  if (!out.ok) return { ok: false, message: out.message }
  return { ok: true, imageUrl: out.imageUrl, channel: 'builtin', vendorUsed: out.vendorUsed }
}

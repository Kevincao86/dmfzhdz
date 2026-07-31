import { wanxSizeToGptImage2Size } from '../src/lib/aiImageStudioGptSize.js'
import { tokenmixImagesGenerate } from './aiGateway/tokenmixImageGenerate.js'
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

export type MeooAgentImageResult = MeooAgentImageOkJson | { ok: false; message: string }

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
      const gptQuality = isGptImage ? ('high' as const) : undefined
      const size = isGptImage
        ? wanxSizeToGptImage2Size(wanxSize)
        : wanxSize?.trim().replace(/\*/g, 'x').replace(/×/g, 'x') || undefined
      const { imageUrl, modelUsed } = await tokenmixImagesGenerate(env, tm, prompt, {
        quality: gptQuality,
        ...(size ? { size } : {}),
      })
      return { ok: true, imageUrl, channel: 'tokenmix', displayModel: modelUsed }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const out = await runAgentFreeformTextToImage(env, prompt, preferredVendor, imageOpts)
      if (out.ok) {
        return {
          ok: true,
          imageUrl: out.imageUrl,
          channel: 'builtin',
          vendorUsed: out.vendorUsed,
          fallbackNote: `高级模型生图不可用（${msg.slice(0, 200)}），已改用灵祺内置引擎。`,
        }
      }
      return { ok: false, message: `${msg}；回退内置：${out.message}` }
    }
  }

  const out = await runAgentFreeformTextToImage(env, prompt, preferredVendor, imageOpts)
  if (!out.ok) return { ok: false, message: out.message }
  const extra: { fallbackNote?: string } = {}
  if (imageRoute === 'tokenmix' && tm && refHttps) {
    extra.fallbackNote =
      '已上传参考图时使用灵祺内置图生图；高级图像接口暂不支持参考图，可在纯文生图时选用 OpenAI 图像模型。'
  }
  return { ok: true, imageUrl: out.imageUrl, channel: 'builtin', vendorUsed: out.vendorUsed, ...extra }
}

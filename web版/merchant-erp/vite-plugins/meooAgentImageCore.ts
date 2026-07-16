import { tokenmixImagesGenerate } from './aiGateway/tokenmixImageGenerate.js'
import { runAgentFreeformTextToImage, type AgentFreeformImageOpts } from './merchantAiUpstream.js'

/** data URL / 裸 base64 → OSS 公网 https（万相等图生图常拒 data:） */
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
      return { ok: false, message: '参考图存储未配置（OSS），请联系管理员' }
    }
    const put = await putIceSourceObject(cfg, env, { fileName, contentType, buffer })
    if (!put.ok || !put.mediaUrl) {
      return { ok: false, message: '参考图上传失败，请稍后重试' }
    }
    return { ok: true, url: put.mediaUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `参考图处理失败：${msg.slice(0, 160)}` }
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
      const { imageUrl, modelUsed } = await tokenmixImagesGenerate(env, tm, prompt)
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

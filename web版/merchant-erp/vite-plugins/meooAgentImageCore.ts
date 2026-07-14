import { tokenmixImagesGenerate } from './aiGateway/tokenmixImageGenerate.js'
import { runAgentFreeformTextToImage, type AgentFreeformImageOpts } from './merchantAiUpstream.js'

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
  const tm = (tokenmixImageModel ?? '').trim()
  const imageOpts: AgentFreeformImageOpts = {
    referenceImage,
    exactPrompt,
    preferredModelId,
    wanxSize,
    aspectRatio,
    doubaoSize,
    preferWanxPoster,
  }

  if (imageRoute === 'tokenmix' && tm && !referenceImage) {
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
  if (imageRoute === 'tokenmix' && tm && referenceImage) {
    extra.fallbackNote =
      '已上传参考图时使用灵祺内置图生图；高级图像接口暂不支持参考图，可在纯文生图时选用 OpenAI 图像模型。'
  }
  return { ok: true, imageUrl: out.imageUrl, channel: 'builtin', vendorUsed: out.vendorUsed, ...extra }
}

import { postDouyinGoodsAiAssist, postDouyinProductQualityAnalysis } from './douyinAiAssistApi'
import { resolveTextAiModelForRequest } from './merchantAiModelStorage'
import type { AiModelId } from './douyinAiAssistApi'

export type IceMaterialContext = {
  imageUrls: string[]
  videoUrls: string[]
  imageLabels: string[]
  aspectLabel: string
  clipEndSec: number
  preset: string
  userHint?: string
}

function buildMaterialSummary(ctx: IceMaterialContext): string {
  const durationLine =
    ctx.imageUrls.length > 0
      ? `生成视频总时长约：${ctx.clipEndSec} 秒`
      : `单段取用时长约：${ctx.clipEndSec} 秒`
  const lines: string[] = [
    '【云剪素材概况】',
    `画幅：${ctx.aspectLabel}`,
    durationLine,
    `画面特效：${ctx.preset}`,
    `图片素材 ${ctx.imageUrls.length} 张：`,
    ...ctx.imageUrls.map((u, i) => `  - 图${i + 1}：${ctx.imageLabels[i] ?? '素材'} · ${u}`),
    `视频素材 ${ctx.videoUrls.length} 条：`,
    ...ctx.videoUrls.map((u, i) => `  - 视频${i + 1}：${u}`),
  ]
  if (ctx.userHint?.trim()) lines.push(`商家补充说明：${ctx.userHint.trim()}`)
  return lines.join('\n')
}

import { splitIceEditBrief } from '../lib/iceEditBriefCompose'

/** 根据已上传图片/视频，推断发布意图并生成云剪剪辑文案指令 */
export async function generateIceEditBriefAi(
  ctx: IceMaterialContext,
): Promise<
  | { ok: true; brief: string; copy: string; instruction: string }
  | { ok: false; message: string }
> {
  const model = resolveTextAiModelForRequest() as AiModelId
  const hasMedia = ctx.imageUrls.length > 0 || ctx.videoUrls.length > 0
  if (!hasMedia) {
    return { ok: false, message: '请先上传至少一张图片或一条视频素材' }
  }

  let visionNotes = ''
  if (ctx.imageUrls.length > 0) {
    const products = ctx.imageUrls.slice(0, 8).map((url, i) => ({
      id: `ice-img-${i + 1}`,
      name: ctx.imageLabels[i] ?? `云剪图片${i + 1}`,
      main_image_url: url,
    }))
    try {
      const q = await postDouyinProductQualityAnalysis(products)
      if (q.ok && q.items?.length) {
        visionNotes = q.items
          .map(
            (it) =>
              `${it.productName}：主图${it.mainImage.score}分（${it.mainImage.comment}）；建议：${it.suggestions.slice(0, 2).join('；')}`,
          )
          .join('\n')
      }
    } catch {
      /* 无视觉分析时仍用文本推断 */
    }
  }

  const titleDraft = [
    '请根据下列素材，推断商家发布短视频的意图（探店种草/带货转化/门店氛围/活动促销等），',
    '并输出可直接交给阿里云智能媒体云剪的「剪辑文案指令」。',
    '结构要求：',
    '1）先写【剪辑指令】：BGM、转场、节奏、色调等操作说明（这些文字不会上屏）；',
    `2）再写【字幕文案】：列出各段要上屏的短句，用「」括起，每条 4-20 字，与图片/镜头对应；`,
    `3）全片总时长约 ${ctx.clipEndSec} 秒，与商家输出参数一致；`,
    '4）结尾可写 Slogan 或行动号召（同样放在【字幕文案】里）。',
    '只输出正文，不要 Markdown 标题，不要 JSON。',
    '',
    buildMaterialSummary(ctx),
    visionNotes ? `\n【画面理解（AI）】\n${visionNotes}` : '',
  ].join('\n')

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: '灵祺AI云剪',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description?.trim()) {
    return { ok: false, message: r.ok ? 'AI 未返回有效文案' : r.message }
  }
  const brief = r.description.trim()
  const { copy, instruction } = splitIceEditBrief(brief)
  return { ok: true, brief, copy, instruction }
}

import { postAiChat } from './ai/aiClient'
import { postDouyinProductQualityAnalysis } from './douyinAiAssistApi'
import { postVideoLastFrameFromUrl } from './videoAiApi'
import type { IceMixMaterialSlot } from '../lib/iceMixPlan'
import { runIceUploadPool } from '../lib/iceUploadPool'

const VISION_SAMPLE_MAX = 8
const VIDEO_FRAME_SAMPLE_MAX = 4
const VIDEO_FRAME_CONCURRENCY = 3

const MIX_GUIDANCE_SYSTEM = `你是本地生活/电商短视频编导，负责根据商家已上传的实拍素材，撰写「AI混剪指导文案」（中文）。
输出须覆盖：
1. 商业创意方向（探店种草/带货转化/门店氛围/活动促销等，择最贴合的一种并简述）
2. 核心卖点（3–5 条短句，来自画面可见信息，勿编造价格或未出现的品牌）
3. 目标受众与使用场景
4. 镜头与场景描述（环境、产品/服务、人物动作、光线氛围，与素材顺序大致对应）
5. 叙事节奏与情绪（如先氛围后卖点、先痛点后解决方案）

要求：约 150–380 字；具体、可画面化；适合后续 AI 自动规划分镜表。
禁止：Markdown、JSON、列表编号、「灵祺/云剪/ERP」等平台名；勿写总时长/画幅/BGM 等技术参数。
只输出指导正文一段。`

const FRAME_VISION_SYSTEM = `你是短视频素材分析师。用户会提供从实拍视频截取的采样帧（可能含门店、产品、人物、环境）。
请用中文简要描述每张图：场景类型、可见主体、色调氛围、可提炼的卖点线索。
多张图时用空行分隔，每段开头标注「素材N：」。不要 JSON。`

function sampleMaterials(materials: IceMixMaterialSlot[], max: number): IceMixMaterialSlot[] {
  if (materials.length <= max) return [...materials]
  const out: IceMixMaterialSlot[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * materials.length) / max)
    out.push(materials[idx]!)
  }
  return out
}

function pickVideoUrl(mat: IceMixMaterialSlot): string {
  return (mat.signedMediaUrl || mat.mediaUrl || '').trim()
}

function buildMaterialInventory(materials: IceMixMaterialSlot[], sampled: IceMixMaterialSlot[]): string {
  const lines = [
    '【素材清单】',
    `共 ${materials.length} 个（视频 ${materials.filter((m) => m.kind === 'video').length} · 图片 ${materials.filter((m) => m.kind === 'image').length}）`,
    '本次 AI 采样分析：',
    ...sampled.map(
      (m, i) =>
        `  ${i + 1}. ${m.kind === 'video' ? '视频' : '图片'} · ${m.label || `素材${i + 1}`}`,
    ),
  ]
  return lines.join('\n')
}

async function analyzeImageMaterials(
  images: IceMixMaterialSlot[],
): Promise<string> {
  if (images.length === 0) return ''
  const products = images.slice(0, VISION_SAMPLE_MAX).map((m, i) => ({
    id: `ice-mix-img-${i + 1}`,
    name: m.label || `图片素材${i + 1}`,
    main_image_url: pickVideoUrl(m),
  }))
  try {
    const q = await postDouyinProductQualityAnalysis(products, { timeoutMs: 90_000 })
    if (!q.ok || !q.items?.length) return ''
    return q.items
      .map(
        (it) =>
          `${it.productName}：${it.mainImage.comment}${it.suggestions?.length ? `；建议：${it.suggestions.slice(0, 2).join('；')}` : ''}`,
      )
      .join('\n')
  } catch {
    return ''
  }
}

async function extractVideoFrameDataUrls(
  videos: IceMixMaterialSlot[],
  onProgress?: (msg: string) => void,
): Promise<{ label: string; dataUrl: string }[]> {
  const picked = videos.slice(0, VIDEO_FRAME_SAMPLE_MAX)
  if (picked.length === 0) return []

  onProgress?.(`正在截取 ${picked.length} 条视频采样帧…`)
  const out: { label: string; dataUrl: string }[] = []

  await runIceUploadPool(picked, VIDEO_FRAME_CONCURRENCY, async (mat) => {
    const url = pickVideoUrl(mat)
    if (!url) return null
    const frame = await postVideoLastFrameFromUrl(url)
    if (!frame.ok) return null
    return {
      label: mat.label || '视频素材',
      dataUrl: `data:image/jpeg;base64,${frame.pureBase64}`,
    }
  }).then((results) => {
    for (const row of results) {
      if (row) out.push(row)
    }
  })

  return out
}

async function describeVideoFrames(
  frames: { label: string; dataUrl: string }[],
): Promise<string> {
  if (frames.length === 0) return ''
  try {
    const res = await postAiChat({
      provider: 'doubao',
      temperature: 0.35,
      imageDataUrls: frames.map((f) => f.dataUrl),
      messages: [
        { role: 'system', content: FRAME_VISION_SYSTEM },
        {
          role: 'user',
          content: frames.map((f, i) => `素材${i + 1}（${f.label}）`).join('\n'),
        },
      ],
    })
    return res.content?.trim() || ''
  } catch {
    return ''
  }
}

async function generateGuidanceText(
  inventory: string,
  visionNotes: string,
  opts: { targetTotalSec: number; aspectLabel: string; userHint?: string },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const userBlock = [
    inventory,
    visionNotes ? `\n【画面理解（AI）】\n${visionNotes}` : '',
    `\n目标成片约 ${opts.targetTotalSec} 秒；画幅 ${opts.aspectLabel}。`,
    opts.userHint?.trim() ? `商家补充：${opts.userHint.trim()}` : '',
    '\n请根据以上素材信息撰写混剪指导文案。',
  ]
    .filter(Boolean)
    .join('\n')

  const vendors: Array<'doubao' | 'qwen'> = ['doubao', 'qwen']
  let lastMsg = 'AI 未返回指导文案'
  for (const provider of vendors) {
    try {
      const res = await postAiChat({
        provider,
        temperature: 0.65,
        messages: [
          { role: 'system', content: MIX_GUIDANCE_SYSTEM },
          { role: 'user', content: userBlock },
        ],
      })
      const text = res.content?.trim()
      if (text && text.length >= 20) return { ok: true, text }
      lastMsg = 'AI 返回内容过短，请重试'
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastMsg }
}

/** 根据已上传混剪素材（视频/图片）AI 分析并生成指导文案 */
export async function analyzeIceMixMaterialsToGuidance(opts: {
  materials: IceMixMaterialSlot[]
  targetTotalSec: number
  aspectLabel: string
  userHint?: string
  onProgress?: (msg: string) => void
}): Promise<{ ok: true; guidance: string } | { ok: false; message: string }> {
  const materials = opts.materials.filter((m) => pickVideoUrl(m))
  if (materials.length === 0) {
    return { ok: false, message: '请先上传至少一条视频或一张图片素材' }
  }

  const sampled = sampleMaterials(materials, VISION_SAMPLE_MAX)
  const images = sampled.filter((m) => m.kind === 'image')
  const videos = sampled.filter((m) => m.kind === 'video')

  opts.onProgress?.('AI 正在分析图片素材…')
  const imageNotes = await analyzeImageMaterials(images)

  const frames = await extractVideoFrameDataUrls(videos, opts.onProgress)
  opts.onProgress?.('AI 正在理解视频画面…')
  const videoNotes = await describeVideoFrames(frames)

  const visionParts = [imageNotes, videoNotes].filter(Boolean)
  if (visionParts.length === 0 && materials.length > 0) {
    opts.onProgress?.('画面采样有限，将依据素材清单生成文案…')
  }

  opts.onProgress?.('AI 正在撰写指导文案…')
  const inventory = buildMaterialInventory(materials, sampled)
  const gen = await generateGuidanceText(inventory, visionParts.join('\n\n'), {
    targetTotalSec: opts.targetTotalSec,
    aspectLabel: opts.aspectLabel,
    userHint: opts.userHint,
  })
  if (!gen.ok) return gen
  return { ok: true, guidance: gen.text }
}

import { extractVideoFirstFramePureBase64, imageUrlToPureBase64 } from '../lib/videoFrameUtils'
import { postAiChat } from './ai/aiClient'
import { postDouyinProductQualityAnalysis } from './douyinAiAssistApi'
import { downloadVideoUrlAsBlob, postVideoLastFrameFromUrl } from './videoAiApi'
import type { IceMixMaterialSlot } from '../lib/iceMixPlan'
import type { IceMixMaterialProfile } from './iceMixEditPlanAi'
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
禁止：写「暂未获取画面」「仅获得编号」「请补充画面描述」等推脱句——下方【画面理解】已是 AI 看图结果，必须据此撰写。
只输出指导正文一段。`

const FRAME_VISION_SYSTEM = `你是短视频素材分析师。用户会附上从实拍视频/图片截取的采样帧。
请用中文描述每张图：场景类型、可见主体（产品/门店/人物/招牌文字等）、色调氛围、可提炼的卖点线索。
必须基于图像内容描述，不要复述文件名或编号；若确实看不清内容才写「画面模糊」。
多张图时空行分隔，每段开头标注「素材N：」。不要 JSON。`

const VISION_FAIL_RE =
  /暂未获取|仅获得编号|尚未获取|无法看到|看不清|没有图|无图|请补充.*画面|缺少.*画面|未提供.*画面/i

function sampleMaterials(materials: IceMixMaterialSlot[], max: number): IceMixMaterialSlot[] {
  if (materials.length <= max) return [...materials]
  const out: IceMixMaterialSlot[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * materials.length) / max)
    out.push(materials[idx]!)
  }
  return out
}

function isOssMaterialUrl(url: string): boolean {
  const u = url.trim()
  return u.startsWith('oss://') || /\.oss-[a-z0-9-]+\.aliyuncs\.com\//i.test(u)
}

/** 服务端截帧优先 canonical OSS 直链（私有桶由服务端 ICE 凭证重签） */
function visionUrlCandidates(mat: IceMixMaterialSlot): string[] {
  const media = (mat.mediaUrl || '').trim()
  const signed = (mat.signedMediaUrl || '').trim()
  const out: string[] = []
  if (media) out.push(media)
  if (signed && signed !== media) out.push(signed)
  return out
}

function buildMaterialInventory(materials: IceMixMaterialSlot[], sampled: IceMixMaterialSlot[]): string {
  const lines = [
    '【素材清单（辅助，勿在成稿中复述编号）】',
    `共 ${materials.length} 个（视频 ${materials.filter((m) => m.kind === 'video').length} · 图片 ${materials.filter((m) => m.kind === 'image').length}）`,
    ...sampled.map(
      (m, i) =>
        `  ${i + 1}. ${m.kind === 'video' ? '视频' : '图片'} · ${m.label || `素材${i + 1}`}`,
    ),
  ]
  return lines.join('\n')
}

function isVisionNotesUsable(notes: string): boolean {
  const t = notes.trim()
  if (t.length < 24) return false
  if (VISION_FAIL_RE.test(t)) return false
  return true
}

async function analyzeImageMaterials(
  images: IceMixMaterialSlot[],
): Promise<string> {
  if (images.length === 0) return ''
  const products = images.slice(0, VISION_SAMPLE_MAX).map((m, i) => ({
    id: `ice-mix-img-${i + 1}`,
    name: m.label || `图片素材${i + 1}`,
    main_image_url: visionUrlCandidates(m)[0] || '',
  }))
  try {
    const q = await postDouyinProductQualityAnalysis(products, { timeoutMs: 90_000 })
    if (q.ok && q.items?.length) {
      const text = q.items
        .map(
          (it) =>
            `${it.productName}：${it.mainImage.comment}${it.suggestions?.length ? `；建议：${it.suggestions.slice(0, 2).join('；')}` : ''}`,
        )
        .join('\n')
      if (isVisionNotesUsable(text)) return text
    }
  } catch {
    /* fallback below */
  }

  const frames: { label: string; dataUrl: string }[] = []
  for (const mat of images.slice(0, VISION_SAMPLE_MAX)) {
    for (const url of visionUrlCandidates(mat)) {
      try {
        const pure = await imageUrlToPureBase64(url)
        if (pure.length >= 64) {
          frames.push({
            label: mat.label || '图片素材',
            dataUrl: `data:image/jpeg;base64,${pure}`,
          })
          break
        }
      } catch {
        /* try next url */
      }
    }
  }
  if (frames.length === 0) return ''
  return describeVideoFrames(frames)
}

async function extractOneVideoFrame(
  mat: IceMixMaterialSlot,
  onProgress?: (msg: string) => void,
): Promise<{ label: string; dataUrl: string } | null> {
  const label = mat.label || '视频素材'
  const urls = visionUrlCandidates(mat)
  if (urls.length === 0) return null

  for (const url of urls) {
    const serverFrame = await postVideoLastFrameFromUrl(url, {
      frame: 'opening',
      onProgress,
    })
    if (serverFrame.ok) {
      return { label, dataUrl: `data:image/jpeg;base64,${serverFrame.pureBase64}` }
    }
  }

  for (const url of urls) {
    try {
      onProgress?.(`服务端截帧失败，正在本地解析「${label}」…`)
      const blob = await downloadVideoUrlAsBlob(url, { maxAttempts: 2 })
      const pure = await extractVideoFirstFramePureBase64(blob)
      if (pure.length >= 64) {
        return { label, dataUrl: `data:image/jpeg;base64,${pure}` }
      }
    } catch {
      /* try next url */
    }
  }

  return null
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
    return extractOneVideoFrame(mat, onProgress)
  }).then((results) => {
    for (const row of results) {
      if (row) out.push(row)
    }
  })

  return out
}

async function describeOneMaterialProfile(
  mat: IceMixMaterialSlot,
  index: number,
): Promise<IceMixMaterialProfile | null> {
  let dataUrl = ''
  if (mat.kind === 'image') {
    for (const url of visionUrlCandidates(mat)) {
      try {
        const pure = await imageUrlToPureBase64(url)
        if (pure.length >= 64) {
          dataUrl = `data:image/jpeg;base64,${pure}`
          break
        }
      } catch {
        /* try next */
      }
    }
  } else {
    const frame = await extractOneVideoFrame(mat)
    if (frame) dataUrl = frame.dataUrl
  }
  if (!dataUrl) {
    return {
      index,
      label: mat.label || `素材${index + 1}`,
      kind: mat.kind,
      description: mat.label || `实拍${mat.kind === 'video' ? '视频' : '图片'}`,
      estimatedDurationSec: mat.kind === 'video' ? 15 : undefined,
    }
  }
  try {
    const res = await postAiChat({
      provider: 'doubao',
      temperature: 0.3,
      imageDataUrls: [dataUrl],
      messages: [
        { role: 'system', content: FRAME_VISION_SYSTEM },
        { role: 'user', content: `素材${index + 1}（${mat.label}）` },
      ],
    })
    const desc = res.content?.trim() || mat.label
    return {
      index,
      label: mat.label || `素材${index + 1}`,
      kind: mat.kind,
      description: isVisionNotesUsable(desc) ? desc.replace(/^素材\d+[：:]\s*/, '') : mat.label,
      estimatedDurationSec: mat.kind === 'video' ? 15 : undefined,
    }
  } catch {
    return {
      index,
      label: mat.label || `素材${index + 1}`,
      kind: mat.kind,
      description: mat.label,
      estimatedDurationSec: mat.kind === 'video' ? 15 : undefined,
    }
  }
}

/** 为每条素材建立画面理解（供指令驱动混剪匹配） */
export async function buildMaterialVisionProfiles(
  materials: IceMixMaterialSlot[],
  onProgress?: (msg: string) => void,
): Promise<IceMixMaterialProfile[]> {
  const list = materials.filter((m) => visionUrlCandidates(m).length > 0)
  if (list.length === 0) return []
  onProgress?.(`正在理解 ${list.length} 条素材画面…`)
  const out: IceMixMaterialProfile[] = []
  await runIceUploadPool(list, VIDEO_FRAME_CONCURRENCY, async (mat) => {
    const idx = materials.indexOf(mat)
    return describeOneMaterialProfile(mat, idx >= 0 ? idx : out.length)
  }).then((results) => {
    for (const row of results) {
      if (row) out.push(row)
    }
  })
  return out.sort((a, b) => a.index - b.index)
}

async function describeVideoFrames(
  frames: { label: string; dataUrl: string }[],
): Promise<string> {
  if (frames.length === 0) return ''
  const imageDataUrls = frames.map((f) => f.dataUrl)
  const userText = frames.map((f, i) => `素材${i + 1}（${f.label}）`).join('\n')
  const providers: Array<'doubao' | 'qwen' | 'tokenmix'> = ['doubao', 'qwen', 'tokenmix']
  let lastErr = ''
  for (const provider of providers) {
    try {
      const res = await postAiChat({
        provider,
        ...(provider === 'tokenmix' ? { modelFamily: 'openai' as const, model: 'gpt-4o' } : {}),
        temperature: 0.35,
        imageDataUrls,
        messages: [
          { role: 'system', content: FRAME_VISION_SYSTEM },
          { role: 'user', content: userText },
        ],
      })
      const text = res.content?.trim() || ''
      if (isVisionNotesUsable(text)) return text
      lastErr = '视觉模型未返回有效画面描述'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || '视觉模型无法理解素材画面')
}

async function generateGuidanceText(
  inventory: string,
  visionNotes: string,
  opts: { targetTotalSec: number; aspectLabel: string; userHint?: string },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const userBlock = [
    `【画面理解（AI 看图）】\n${visionNotes}`,
    inventory,
    `\n目标成片约 ${opts.targetTotalSec} 秒；画幅 ${opts.aspectLabel}。`,
    opts.userHint?.trim() ? `商家补充：${opts.userHint.trim()}` : '',
    '\n请严格根据「画面理解」中的可见细节撰写混剪指导文案，勿提及素材编号或文件名。',
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
      if (text && text.length >= 20 && !VISION_FAIL_RE.test(text)) return { ok: true, text }
      lastMsg = VISION_FAIL_RE.test(text || '') ? '成稿仍缺少画面细节，请重试' : 'AI 返回内容过短，请重试'
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
}): Promise<
  | { ok: true; guidance: string; materialProfiles: IceMixMaterialProfile[] }
  | { ok: false; message: string }
> {
  const materials = opts.materials.filter((m) => visionUrlCandidates(m).length > 0)
  if (materials.length === 0) {
    return { ok: false, message: '请先上传至少一条视频或一张图片素材' }
  }

  opts.onProgress?.('AI 正在逐条理解素材画面…')
  const materialProfiles = await buildMaterialVisionProfiles(materials, opts.onProgress)
  const sampled = sampleMaterials(materials, VISION_SAMPLE_MAX)
  const images = sampled.filter((m) => m.kind === 'image')
  const videos = sampled.filter((m) => m.kind === 'video')

  opts.onProgress?.('AI 正在分析图片素材…')
  let imageNotes = ''
  try {
    imageNotes = await analyzeImageMaterials(images)
  } catch (e) {
    if (videos.length === 0) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  let videoNotes = ''
  if (videos.length > 0) {
    const frames = await extractVideoFrameDataUrls(videos, opts.onProgress)
    if (frames.length === 0) {
      const ossCount = materials.filter((m) =>
        visionUrlCandidates(m).some((u) => isOssMaterialUrl(u)),
      ).length
      return {
        ok: false,
        message:
          ossCount > 0
            ? '无法从 OSS 素材截取画面，请确认素材为 MP4/MOV 且 ICE/OSS 已配置，然后重新上传再试。'
            : '无法从素材中截取有效画面，请重新本地上传后再试。',
      }
    }
    opts.onProgress?.('AI 正在理解视频画面…')
    try {
      videoNotes = await describeVideoFrames(frames)
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'AI 无法理解视频画面，请稍后重试' }
    }
  }

  const visionParts = [
    materialProfiles.map((p) => `素材${p.index + 1}：${p.description}`).join('\n'),
    imageNotes,
    videoNotes,
  ].filter(isVisionNotesUsable)
  if (visionParts.length === 0) {
    return { ok: false, message: 'AI 未能从素材中识别有效画面内容，请换更清晰的素材或重新上传后重试。' }
  }

  opts.onProgress?.('AI 正在撰写指导文案…')
  const inventory = buildMaterialInventory(materials, sampled)
  const gen = await generateGuidanceText(inventory, visionParts.join('\n\n'), {
    targetTotalSec: opts.targetTotalSec,
    aspectLabel: opts.aspectLabel,
    userHint: opts.userHint,
  })
  if (!gen.ok) return gen
  return { ok: true, guidance: gen.text, materialProfiles }
}

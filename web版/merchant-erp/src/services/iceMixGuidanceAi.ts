import {
  compressVisionDataUrl,
} from '../lib/videoFrameUtils'
import { postAiChat } from './ai/aiClient'
import { sampleMixMaterialsEvenly, type IceMixMaterialSlot } from '../lib/iceMixPlan'
import type { IceMixMaterialProfile, MixMaterialFrameBeat } from './iceMixEditPlanAi'
import { runIceUploadPool } from '../lib/iceUploadPool'
import {
  collectMaterialTimelineFrames,
  MIX_FRAMES_PER_VIDEO,
  computeVideoFrameSamplePoints,
} from './iceMixMaterialFrames'
import { MIX_DEFAULT_SOURCE_DURATION_SEC } from '../lib/iceMixPlan'
import {
  ICE_MIX_VISION_PROVIDER_ORDER,
  ICE_MIX_TEXT_PROVIDER_ORDER,
} from './iceMixAiModels'

const VISION_SAMPLE_MAX = 48
/** 素材分析：超过此数量只抽样深度理解，其余用文件名占位 */
const MATERIAL_PROFILE_DEEP_MAX = 16
const MATERIAL_PROFILE_CONCURRENCY = 4
const MATERIAL_FRAME_TIMEOUT_MS = 45_000
const MATERIAL_FRAME_TIMEOUT_PER_FRAME_MS = 22_000
const MATERIAL_FRAME_TIMEOUT_BASE_MS = 25_000
/** 大批量素材分析时每条视频采样帧数（降低服务端压力） */
const MIX_ANALYZE_FRAMES_PER_VIDEO = 3
const MATERIAL_VISION_BATCH_TIMEOUT_MS = 90_000
const VISION_FRAMES_PER_AI_CALL = 4

const MIX_GUIDANCE_SYSTEM = `你是本地生活/电商短视频编导，负责根据商家已上传的实拍素材，撰写「AI混剪指导文案」（中文）。
输出须覆盖：
1. 商业创意方向（探店种草/带货转化/门店氛围/活动促销等，择最贴合的一种并简述）
2. 核心卖点（3–5 条短句，来自画面可见信息，勿编造价格或未出现的品牌）
3. 目标受众与使用场景
4. 镜头与场景描述（环境、产品/服务、人物动作、光线氛围，与素材顺序大致对应）
5. 叙事节奏与情绪（成片须有逻辑，时长由用户参数决定，勿按素材条数堆砌镜头）：
   - 【写死】若素材含门头/店招/门店外观：默认门头放开场，口播讲门店位置/到店指引；仅当文案明确要求「门头收尾」时才放片尾前
   - 标准结构：门头门店指引(开场) → 套餐/产品/制作(中段) → 结束语/行动号召(收尾)
   - 备选结构：产品卖点钩子(开场) → 体验/制作(中段) → 门头到店指引(收尾前) → 结束语
   - 口播句须与画面一一对应（门头讲指引、菜品讲口感、后厨讲现做）
   - 与推广/产品/门店毫无关联的素材（纯风景、马路、自拍、截帧失败等）不得写入指导文案，成片会自动跳过

要求：约 150–380 字；具体、可画面化；适合后续 AI 按目标时长规划 K 段分镜（非每条素材一段）。
禁止：Markdown、JSON、列表编号、「灵祺/云剪/ERP」等平台名；勿写总时长/画幅/BGM 等技术参数。
禁止：写「暂未获取画面」「仅获得编号」「请补充画面描述」等推脱句——下方【画面理解】已是 AI 看图结果，必须据此撰写。
只输出指导正文一段。`

const FRAME_VISION_SYSTEM = `你是短视频素材分析师。用户会附上从实拍视频/图片截取的采样帧（标注素材编号与源片时间点，如「素材3·2.4s」）。
请用中文描述每一帧：场景类型、可见主体（产品/门店/人物/招牌文字等）、动作/状态、色调氛围、可提炼的卖点线索。
必须基于图像内容描述，不要复述文件名；若确实看不清才写「画面模糊」。
每张图单独一段，开头必须标注「素材N·Xs：」其中 X 为该帧在源片中的秒数（与标签一致）。不要 JSON。`

const VISION_FAIL_RE =
  /暂未获取|仅获得编号|尚未获取|无法看到|看不清|没有图|无图|请补充.*画面|缺少.*画面|未提供.*画面/i

function sampleMaterials(materials: IceMixMaterialSlot[], max: number): IceMixMaterialSlot[] {
  return sampleMixMaterialsEvenly(materials, max)
}

/** 服务端截帧优先 canonical OSS 直链（私有桶由服务端 ICE 凭证重签） */
function visionUrlCandidates(mat: IceMixMaterialSlot): string[] {
  const media = (mat.mediaUrl || '').trim()
  const signed = (mat.signedMediaUrl || '').trim()
  const out: string[] = []
  if (signed && /^https?:\/\//i.test(signed)) out.push(signed)
  if (media && !out.includes(media)) out.push(media)
  if (signed && signed !== media && !out.includes(signed)) out.push(signed)
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

function stubMaterialProfile(mat: IceMixMaterialSlot, index: number): IceMixMaterialProfile {
  return {
    index,
    label: mat.label || `素材${index + 1}`,
    kind: mat.kind,
    description: mat.label || `实拍${mat.kind === 'video' ? '视频' : '图片'}`,
    estimatedDurationSec: mat.kind === 'video' ? 6 : undefined,
  }
}

function parseBatchVisionByIndex(text: string, indices: number[]): Map<number, string> {
  const map = new Map<number, string>()
  const raw = text.trim()
  if (!raw) return map

  for (const idx of indices) {
    const n = idx + 1
    const re = new RegExp(`素材${n}(?:·[\\d.]+s)?\\s*[：:][\\s\\S]*?(?=\\n素材\\d+(?:·[\\d.]+s)?\\s*[：:]|$)`)
    const m = raw.match(re)
    if (!m?.[0]) continue
    const desc = m[0].replace(new RegExp(`^素材${n}(?:·[\\d.]+s)?\\s*[：:]\\s*`), '').trim()
    if (desc.length >= 8 && !VISION_FAIL_RE.test(desc)) {
      const prev = map.get(idx)
      map.set(idx, prev ? `${prev} ${desc}` : desc)
    }
  }

  if (map.size === 0 && indices.length === 1 && isVisionNotesUsable(raw)) {
    map.set(indices[0]!, raw)
    return map
  }

  if (map.size === 0 && indices.length > 1) {
    const chunks = raw.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean)
    for (let i = 0; i < Math.min(chunks.length, indices.length); i++) {
      const chunk = chunks[i]!
      const desc = chunk.replace(/^素材\d+(?:·[\d.]+s)?\s*[：:]\s*/, '').trim() || chunk
      if (desc.length >= 8 && !VISION_FAIL_RE.test(desc)) {
        const idx = indices[i]!
        const prev = map.get(idx)
        map.set(idx, prev ? `${prev} ${desc}` : desc)
      }
    }
  }

  return map
}

/** 从批量视觉原文解析逐帧时间轴描述 */
export function parseBatchVisionFrameTimeline(
  text: string,
  materialIndex: number,
): MixMaterialFrameBeat[] {
  const raw = text.trim()
  if (!raw) return []
  const n = materialIndex + 1
  const re = new RegExp(`素材${n}·([\\d.]+)s\\s*[：:]([^\\n]+)`, 'g')
  const beats: MixMaterialFrameBeat[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const atSec = Math.max(0, Number(m[1]) || 0)
    const description = String(m[2] ?? '').trim()
    if (description.length >= 4 && !VISION_FAIL_RE.test(description)) {
      beats.push({ atSec, description })
    }
  }
  return beats.sort((a, b) => a.atSec - b.atSec)
}

/** 从 profile 列表或批量视觉原文解析可用画面描述 */
export function resolveMixVisionNotes(
  profiles: IceMixMaterialProfile[],
  batchVisionText: string,
): string {
  const fromProfiles = profiles
    .filter((p) => isVisionNotesUsable(p.description))
    .map((p) => `素材${p.index + 1}：${p.description}`)
    .join('\n')
  if (isVisionNotesUsable(fromProfiles)) return fromProfiles
  const batch = batchVisionText.trim()
  if (isVisionNotesUsable(batch)) return batch
  return ''
}

function resolveDeepAnalyzeCap(materialCount: number): number {
  if (materialCount <= 12) return materialCount
  return MATERIAL_PROFILE_DEEP_MAX
}

function resolveAnalyzeFramesPerVideo(materialCount: number): number {
  return materialCount > 12 ? MIX_ANALYZE_FRAMES_PER_VIDEO : MIX_FRAMES_PER_VIDEO
}

async function collectMaterialFramesForVision(
  mat: IceMixMaterialSlot,
  index: number,
  onProgress?: (msg: string) => void,
  opts?: { maxFrames?: number },
): Promise<Array<{ index: number; label: string; dataUrl: string; atSec: number }>> {
  const frameCap = opts?.maxFrames ?? MIX_FRAMES_PER_VIDEO
  onProgress?.(`截帧 ${index + 1}：${mat.label || `素材${index + 1}`}（全片 ${frameCap} 帧）…`)
  const timeline = await collectMaterialTimelineFrames(mat, index, {
    durationSec: mat.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
    maxFrames: frameCap,
    skipLocalDownload: false,
  })
  return timeline.map((f) => ({
    index: f.index,
    label: f.label,
    dataUrl: f.dataUrl,
    atSec: f.atSec ?? 0,
  }))
}

function withProfileTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

export type MaterialVisionBuildResult = {
  profiles: IceMixMaterialProfile[]
  batchVisionText: string
  frameCount: number
  visionError?: string
}

/** 为每条素材建立画面理解（批量截帧 + 单次 AI 看图，避免 N 次串行调用） */
export async function buildMaterialVisionProfiles(
  materials: IceMixMaterialSlot[],
  onProgress?: (msg: string) => void,
  opts?: { maxDeepAnalyze?: number },
): Promise<MaterialVisionBuildResult> {
  const list = materials.filter((m) => visionUrlCandidates(m).length > 0)
  if (list.length === 0) {
    return { profiles: [], batchVisionText: '', frameCount: 0 }
  }

  const maxDeep = Math.max(2, opts?.maxDeepAnalyze ?? resolveDeepAnalyzeCap(list.length))
  const deepTargets = list.length <= maxDeep ? list : sampleMaterials(list, maxDeep)
  const deepTotal = deepTargets.length
  const framesPerVideo = resolveAnalyzeFramesPerVideo(list.length)
  const materialFrameTimeoutMs = Math.max(
    MATERIAL_FRAME_TIMEOUT_MS,
    MATERIAL_FRAME_TIMEOUT_BASE_MS + framesPerVideo * MATERIAL_FRAME_TIMEOUT_PER_FRAME_MS,
  )

  onProgress?.(
    list.length > maxDeep
      ? `共 ${list.length} 条素材，抽样密集截帧 ${deepTotal} 条（每条 ${framesPerVideo} 帧）…`
      : `正在对 ${deepTotal} 条素材逐帧截帧理解（每条 ${framesPerVideo} 帧）…`,
  )

  const frameSamples: Array<{ index: number; label: string; dataUrl: string; atSec: number }> = []
  let extracted = 0

  await runIceUploadPool(deepTargets, MATERIAL_PROFILE_CONCURRENCY, async (mat) => {
    const idx = materials.indexOf(mat)
    const index = idx >= 0 ? idx : extracted
    const samples = await withProfileTimeout(
      collectMaterialFramesForVision(mat, index, onProgress, { maxFrames: framesPerVideo }),
      materialFrameTimeoutMs,
      [],
    )
    extracted += 1
    for (const sample of samples) {
      const compactUrl = await compressVisionDataUrl(sample.dataUrl)
      frameSamples.push({ ...sample, dataUrl: compactUrl })
    }
    return samples[0] ?? null
  })

  let batchVisionText = ''
  let visionError: string | undefined
  const descByIndex = new Map<number, string>()
  if (frameSamples.length > 0) {
    onProgress?.(`AI 批量理解 ${frameSamples.length} 张采样画面…`)
    try {
      const visionFrames = frameSamples.map((f) => ({
        label: `素材${f.index + 1}·${f.atSec.toFixed(1)}s（${f.label}）`,
        dataUrl: f.dataUrl,
      }))
      batchVisionText = await withProfileTimeout(
        describeVideoFramesBatched(visionFrames),
        MATERIAL_VISION_BATCH_TIMEOUT_MS * Math.max(1, Math.ceil(visionFrames.length / VISION_FRAMES_PER_AI_CALL)),
        '',
      )
      if (!batchVisionText) {
        visionError = '视觉理解超时，请稍后重试或减少同时上传的素材数量'
      } else {
        for (const [idx, desc] of parseBatchVisionByIndex(
          batchVisionText,
          frameSamples.map((f) => f.index),
        )) {
          descByIndex.set(idx, desc)
        }
      }
    } catch (e) {
      visionError = e instanceof Error ? e.message : String(e)
    }
  }

  const profiles = materials.map((mat, index) => {
    const desc = descByIndex.get(index)
    const frameTimeline = parseBatchVisionFrameTimeline(batchVisionText, index)
    const mergedDesc =
      desc && isVisionNotesUsable(desc)
        ? desc
        : frameTimeline.map((b) => b.description).join('；')
    if (mergedDesc && isVisionNotesUsable(mergedDesc)) {
      const samplePoints =
        mat.kind === 'video' ? computeVideoFrameSamplePoints(MIX_DEFAULT_SOURCE_DURATION_SEC) : [0]
      return {
        index,
        label: mat.label || `素材${index + 1}`,
        kind: mat.kind,
        description: mergedDesc.slice(0, 480),
        estimatedDurationSec: mat.kind === 'video' ? MIX_DEFAULT_SOURCE_DURATION_SEC : undefined,
        frameTimeline:
          frameTimeline.length > 0
            ? frameTimeline
            : samplePoints.map((atSec) => ({
                atSec,
                description: mergedDesc.slice(0, 120),
              })),
      }
    }
    return stubMaterialProfile(mat, index)
  })

  return { profiles, batchVisionText, frameCount: frameSamples.length, visionError }
}

async function describeVideoFramesOnce(
  frames: { label: string; dataUrl: string }[],
): Promise<string> {
  if (frames.length === 0) return ''
  const imageDataUrls = frames.map((f) => f.dataUrl)
  const userText = frames.map((f) => f.label).join('\n')
  const providers = ICE_MIX_VISION_PROVIDER_ORDER
  let lastErr = ''
  for (const { provider, model } of providers) {
    try {
      const res = await postAiChat({
        provider,
        model,
        ...(provider === 'tokenmix' ? { modelFamily: 'openai' as const } : {}),
        temperature: 0.25,
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

/** 多图分批调用视觉模型，避免单次 payload 过大 */
async function describeVideoFramesBatched(
  frames: { label: string; dataUrl: string }[],
): Promise<string> {
  if (frames.length === 0) return ''
  if (frames.length <= VISION_FRAMES_PER_AI_CALL) {
    return describeVideoFramesOnce(frames)
  }
  const parts: string[] = []
  for (let i = 0; i < frames.length; i += VISION_FRAMES_PER_AI_CALL) {
    const chunk = frames.slice(i, i + VISION_FRAMES_PER_AI_CALL)
    const text = await describeVideoFramesOnce(chunk)
    if (text) parts.push(text)
  }
  return parts.join('\n\n')
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

  const vendors = ICE_MIX_TEXT_PROVIDER_ORDER.filter((x) => x.provider !== 'tokenmix')
  let lastMsg = 'AI 未返回指导文案'
  for (const { provider, model } of vendors) {
    try {
      const res = await postAiChat({
        provider,
        model,
        temperature: 0.55,
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

  opts.onProgress?.('AI 正在理解素材画面…')
  const visionBuild = await buildMaterialVisionProfiles(materials, opts.onProgress, {
    maxDeepAnalyze: resolveDeepAnalyzeCap(materials.length),
  })
  const materialProfiles = visionBuild.profiles
  const sampled = sampleMaterials(materials, VISION_SAMPLE_MAX)

  const visionNotes = resolveMixVisionNotes(materialProfiles, visionBuild.batchVisionText)

  if (!isVisionNotesUsable(visionNotes)) {
    if (visionBuild.frameCount === 0) {
      const deepCap = resolveDeepAnalyzeCap(materials.length)
      const sampledHint =
        materials.length > deepCap
          ? `已对 ${deepCap}/${materials.length} 条抽样截帧，`
          : `已对 ${materials.length} 条素材截帧，`
      return {
        ok: false,
        message: `${sampledHint}但均未成功。请确认视频为 MP4/MOV 且为本地上传（勿粘贴外链），网络稳定后重试。`,
      }
    }
    const ve = visionBuild.visionError || ''
    if (/401|unauthorized|登录|login/i.test(ve)) {
      return { ok: false, message: '登录已失效或未授权，请刷新页面重新登录后再点「AI 分析素材」。' }
    }
    if (ve) {
      return { ok: false, message: `AI 视觉理解失败：${ve}` }
    }
    return { ok: false, message: 'AI 未能从素材中识别有效画面内容，请换更清晰的素材或重新上传后重试。' }
  }

  opts.onProgress?.('AI 正在撰写指导文案…')
  const inventory = buildMaterialInventory(materials, sampled)
  const gen = await generateGuidanceText(inventory, visionNotes, {
    targetTotalSec: opts.targetTotalSec,
    aspectLabel: opts.aspectLabel,
    userHint: opts.userHint,
  })
  if (!gen.ok) return gen
  return { ok: true, guidance: gen.text, materialProfiles }
}

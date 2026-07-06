import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import { fetchOpsRegistry } from '../lib/opsRegistryClient'
import type { RegistryMpRecruitmentOrder, RegistryVideoSubmission } from '../lib/opsRegistryTypes'
import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { readTextAiAuto, resolveTextAiModelForRequest } from './merchantAiModelStorage'
import type { ViralBriefPlatform, ViralBriefResult, ViralBriefStyle } from './viralBriefAi'
import { STYLE_LABELS, platformLabel } from './viralBriefAi'

export type ViralBriefReferenceCase = {
  id: string
  title: string
  platform?: string
  category?: string
  region?: string
  /** 案例库原始视频地址 */
  originalVideoUrl?: string
  /** 本页可播放预览（拉取后的 blob / 同源 URL） */
  videoPreviewUrl?: string
  /** 案例库原始封面 */
  originalThumbUrl?: string
  /** 本页展示用封面 */
  thumbUrl?: string
  /** 本页展示用场景图（已尝试下载到浏览器） */
  sceneImages: string[]
  /** 案例库原始场景图地址 */
  originalSceneImages?: string[]
  matchScore: number
  matchReason: string
  /** AI 检索相似点说明 */
  aiPickReason?: string
  source: 'video_submission' | 'mp_applicant' | 'order_cover'
}

type CaseCandidate = {
  id: string
  title: string
  platform: string
  category: string
  region: string
  videoUrl?: string
  thumbUrl?: string
  sceneImages: string[]
  source: ViralBriefReferenceCase['source']
  aiNote?: string
  status?: RegistryVideoSubmission['status']
}

const BRIEF_TEXT_VENDORS: AiModelId[] = ['doubao', 'qwen', 'minimax']

const PLATFORM_ALIASES: Record<ViralBriefPlatform, string[]> = {
  douyin: ['抖音', 'douyin'],
  xiaohongshu: ['小红书', 'xiaohongshu', '红薯'],
  dianping: ['大众点评', '点评', 'dianping'],
  channels: ['视频号', '微信视频号', 'channels'],
  kuaishou: ['快手', 'kuaishou'],
}

function norm(s: unknown): string {
  return String(s || '').trim()
}

function briefVendorOrder(): AiModelId[] {
  const order: AiModelId[] = []
  if (!readTextAiAuto()) {
    const preferred = resolveTextAiModelForRequest() as AiModelId
    if (BRIEF_TEXT_VENDORS.includes(preferred)) order.push(preferred)
  }
  for (const v of BRIEF_TEXT_VENDORS) {
    if (!order.includes(v)) order.push(v)
  }
  return order
}

function extractJson(text: string): Record<string, unknown> | null {
  const t = String(text || '').trim()
  if (!t) return null
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>
    } catch {
      return null
    }
  }
  let j = tryParse(t)
  if (j) return j
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    j = tryParse(fence[1].trim())
    if (j) return j
  }
  const brace = t.match(/\{[\s\S]*\}/)
  if (brace) return tryParse(brace[0])
  return null
}

function collectKeywords(
  order: RecruitOrderPickerRow,
  brief: Pick<ViralBriefResult, 'requirementSummary' | 'structure' | 'hooks' | 'topics'>,
  style: ViralBriefStyle,
  platform: ViralBriefPlatform,
): string[] {
  const raw = [
    order.title,
    order.category,
    order.region,
    order.platform,
    order.recruitContent,
    brief.requirementSummary,
    STYLE_LABELS[style],
    platformLabel(platform),
    ...brief.hooks,
    ...brief.topics,
    ...brief.structure.map((s) => `${s.scene} ${s.visual}`),
  ]
    .join(' ')
    .toLowerCase()

  const tokens = new Set<string>()
  for (const part of raw.split(/[\s,，、。；;：:#｜|/]+/)) {
    const t = part.trim()
    if (t.length >= 2) tokens.add(t)
  }
  for (const alias of PLATFORM_ALIASES[platform] || []) {
    if (alias.length >= 2) tokens.add(alias.toLowerCase())
  }
  return [...tokens]
}

function platformMatches(candidatePlatform: string, target: ViralBriefPlatform): boolean {
  const p = norm(candidatePlatform).toLowerCase()
  if (!p) return false
  return (PLATFORM_ALIASES[target] || []).some((alias) => p.includes(alias.toLowerCase()))
}

function scoreCandidate(
  candidate: CaseCandidate,
  keywords: string[],
  order: RecruitOrderPickerRow,
  platform: ViralBriefPlatform,
): number {
  let score = 0
  const hay = [candidate.title, candidate.category, candidate.region, candidate.platform, candidate.aiNote]
    .join(' ')
    .toLowerCase()

  for (const kw of keywords) {
    if (kw && hay.includes(kw)) score += 2
  }
  if (platformMatches(candidate.platform, platform)) score += 8
  const cat = norm(order.category).toLowerCase()
  if (cat && hay.includes(cat)) score += 5
  const region = norm(order.region).toLowerCase()
  if (region && hay.includes(region)) score += 4
  if (candidate.videoUrl) score += 3
  if (candidate.status === 'passed') score += 4
  if (candidate.thumbUrl || candidate.sceneImages.length) score += 2
  return score
}

function buildMatchReason(
  candidate: CaseCandidate,
  order: RecruitOrderPickerRow,
  platform: ViralBriefPlatform,
): string {
  const bits: string[] = []
  if (platformMatches(candidate.platform, platform)) bits.push('平台相近')
  if (norm(order.category) && norm(candidate.category).includes(norm(order.category))) bits.push('品类匹配')
  if (norm(order.region) && norm(candidate.region).includes(norm(order.region))) bits.push('区域相近')
  if (candidate.videoUrl) bits.push('含参考短视频')
  if (candidate.sceneImages.length) bits.push('含拍摄场景图')
  return bits.length ? bits.join(' · ') : '案例库综合匹配'
}

function pushSceneImage(images: string[], url?: string) {
  const u = norm(url)
  if (!u || images.includes(u)) return
  images.push(u)
}

function collectFromMpOrder(mp: RegistryMpRecruitmentOrder, out: CaseCandidate[]) {
  const base = {
    platform: norm(mp.platform),
    category: norm(mp.category),
    region: norm(mp.region || mp.storeName),
  }
  const cover = norm(mp.coverImage)
  if (cover) {
    out.push({
      id: `cover-${mp.id}`,
      title: norm(mp.title || mp.customerName) || '招募封面参考',
      ...base,
      sceneImages: [cover],
      source: 'order_cover',
    })
  }
  for (const a of mp.applicants || []) {
    const videoUrl = norm(a.videoUrl)
    if (!videoUrl) continue
    out.push({
      id: `app-${a.id}`,
      title: norm(a.platformNickname || a.name) || '达人探店视频',
      ...base,
      videoUrl,
      sceneImages: cover ? [cover] : [],
      source: 'mp_applicant',
      status:
        a.videoStatus === 'passed' || a.aiVerifyStatus === 'passed'
          ? 'passed'
          : a.videoStatus === 'rejected'
            ? 'rejected'
            : 'pending',
      aiNote: norm(a.videoRejectReason || a.aiVerifyNote),
    })
  }
}

function collectFromSubmission(
  v: RegistryVideoSubmission,
  mpById: Map<string, RegistryMpRecruitmentOrder>,
  out: CaseCandidate[],
) {
  const mp = v.mpOrderId ? mpById.get(v.mpOrderId) : undefined
  const sceneImages: string[] = []
  pushSceneImage(sceneImages, v.thumbUrl)
  if (mp?.coverImage) pushSceneImage(sceneImages, mp.coverImage)
  out.push({
    id: `sub-${v.id}`,
    title: norm(v.title || v.author) || '审核通过案例',
    platform: norm(mp?.platform),
    category: norm(mp?.category),
    region: norm(mp?.region || mp?.storeName),
    videoUrl: norm(v.videoUrl) || undefined,
    thumbUrl: norm(v.thumbUrl) || undefined,
    sceneImages,
    source: 'video_submission',
    status: v.status,
    aiNote: norm(v.aiNote),
  })
}

function candidateToRow(
  c: CaseCandidate,
  keywords: string[],
  order: RecruitOrderPickerRow,
  platform: ViralBriefPlatform,
  aiPickReason?: string,
  aiScore?: number,
): ViralBriefReferenceCase {
  const ruleScore = scoreCandidate(c, keywords, order, platform)
  return {
    id: c.id,
    title: c.title,
    platform: c.platform || undefined,
    category: c.category || undefined,
    region: c.region || undefined,
    originalVideoUrl: c.videoUrl,
    originalThumbUrl: c.thumbUrl,
    originalSceneImages: c.sceneImages.slice(),
    sceneImages: [],
    matchScore: aiScore ?? ruleScore,
    matchReason: buildMatchReason(c, order, platform),
    aiPickReason,
    source: c.source,
  }
}

async function rankCandidatesWithAi(args: {
  order: RecruitOrderPickerRow
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  brief: Pick<ViralBriefResult, 'requirementSummary' | 'structure' | 'hooks' | 'topics'>
  candidates: CaseCandidate[]
  limit: number
}): Promise<Array<{ id: string; reason: string; score: number }>> {
  const shortlist = args.candidates.slice(0, 24)
  if (!shortlist.length) return []

  const catalog = shortlist.map((c, i) => ({
    id: c.id,
    idx: i + 1,
    title: c.title,
    platform: c.platform,
    category: c.category,
    region: c.region,
    hasVideo: !!c.videoUrl,
    sceneImageCount: c.sceneImages.length,
    note: c.aiNote || '',
  }))

  const briefCtx = [
    `平台：${platformLabel(args.platform)}`,
    `风格：${STYLE_LABELS[args.style]}`,
    `订单：${args.order.title}`,
    `区域/品类：${args.order.region || '—'} / ${args.order.category || '—'}`,
    `需求摘要：${args.brief.requirementSummary}`,
    args.brief.hooks.length ? `钩子：${args.brief.hooks.slice(0, 3).join('；')}` : '',
    args.brief.structure.length
      ? `分镜画面：${args.brief.structure
          .slice(0, 4)
          .map((s) => s.visual)
          .join('；')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    '你是探店短视频案例库检索助手。任务：从【案例库候选列表】中选出与 Brief 最相似的参考素材。',
    '重要：只返回列表中已有 id，禁止编造案例、禁止生成新视频或图片。',
    `请选出 ${Math.min(args.limit, 4)} 条最相似案例，优先有探店短视频的条目，并兼顾拍摄场景图。`,
    '输出严格 JSON：',
    '{"picks":[{"id":"候选id","reason":"一句话说明相似点","score":0到100}]}',
    '',
    '【Brief】',
    briefCtx,
    '',
    '【案例库候选】',
    JSON.stringify(catalog, null, 0),
  ].join('\n')

  let lastMsg = '案例检索 AI 失败'
  for (const model of briefVendorOrder()) {
    const r = await postDouyinGoodsAiAssist({
      model,
      action: 'operation_article',
      product_name: `案例库检索|${args.order.title}`,
      title_draft: prompt,
    })
    if (!r.ok) {
      lastMsg = r.message || lastMsg
      continue
    }
    const parsed = extractJson(String(r.description || ''))
    const picks = Array.isArray(parsed?.picks) ? (parsed!.picks as Record<string, unknown>[]) : []
    const out: Array<{ id: string; reason: string; score: number }> = []
    const validIds = new Set(shortlist.map((c) => c.id))
    for (const p of picks) {
      const id = norm(p.id)
      if (!id || !validIds.has(id)) continue
      out.push({
        id,
        reason: norm(p.reason) || 'AI 判定与 Brief 相近',
        score: Math.max(0, Math.min(100, Number(p.score) || 70)),
      })
    }
    if (out.length) return out.slice(0, args.limit)
    lastMsg = 'AI 未返回有效案例 id'
  }
  throw new Error(lastMsg)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('read blob failed'))
    fr.readAsDataURL(blob)
  })
}

async function fetchDisplayUrl(
  url: string,
  kind: 'image' | 'video',
  maxImageBytes = 6 * 1024 * 1024,
): Promise<string> {
  const u = norm(url)
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('blob:')) return u
  try {
    const res = await fetch(u)
    if (!res.ok) return u
    const blob = await res.blob()
    if (kind === 'video') return URL.createObjectURL(blob)
    if (blob.size > maxImageBytes) return u
    return await blobToDataUrl(blob)
  } catch {
    return u
  }
}

async function hydrateReferenceCaseMedia(row: ViralBriefReferenceCase): Promise<ViralBriefReferenceCase> {
  const videoPreviewUrl = row.originalVideoUrl
    ? await fetchDisplayUrl(row.originalVideoUrl, 'video')
    : undefined
  const thumbUrl = row.originalThumbUrl ? await fetchDisplayUrl(row.originalThumbUrl, 'image') : undefined
  const sceneImages: string[] = []
  for (const img of row.originalSceneImages || []) {
    const local = await fetchDisplayUrl(img, 'image')
    if (local && !sceneImages.includes(local)) sceneImages.push(local)
  }
  return {
    ...row,
    videoPreviewUrl,
    thumbUrl: thumbUrl || (sceneImages[0] ? sceneImages[0] : undefined),
    sceneImages,
  }
}

export async function pickViralBriefReferenceCases(args: {
  order: RecruitOrderPickerRow
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  brief: Pick<ViralBriefResult, 'requirementSummary' | 'structure' | 'hooks' | 'topics'>
  limit?: number
  onProgress?: (msg: string) => void
}): Promise<ViralBriefReferenceCase[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 4, 6))
  let registry
  try {
    registry = await fetchOpsRegistry()
  } catch {
    return []
  }

  const mpById = new Map<string, RegistryMpRecruitmentOrder>()
  for (const mp of registry.mpRecruitmentOrders || []) {
    if (mp?.id) mpById.set(String(mp.id), mp)
  }

  const candidates: CaseCandidate[] = []
  for (const mp of registry.mpRecruitmentOrders || []) {
    collectFromMpOrder(mp, candidates)
  }
  for (const v of registry.recruitmentVideoSubmissions || []) {
    if (!v?.id) continue
    if (v.status === 'rejected' && !v.videoUrl) continue
    collectFromSubmission(v, mpById, candidates)
  }
  if (!candidates.length) return []

  const keywords = collectKeywords(args.order, args.brief, args.style, args.platform)
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const ruleRanked = [...candidates]
    .map((c) => ({ c, score: scoreCandidate(c, keywords, args.order, args.platform) }))
    .filter((x) => x.score > 0 || x.c.videoUrl || x.c.sceneImages.length)
    .sort((a, b) => b.score - a.score)

  let pickedRows: ViralBriefReferenceCase[] = []

  args.onProgress?.('AI 正在从案例库检索相似探店视频与场景图（非生成）…')
  try {
    const aiPicks = await rankCandidatesWithAi({
      order: args.order,
      platform: args.platform,
      style: args.style,
      brief: args.brief,
      candidates: ruleRanked.map((x) => x.c),
      limit,
    })
    for (const pick of aiPicks) {
      const c = byId.get(pick.id)
      if (!c) continue
      pickedRows.push(candidateToRow(c, keywords, args.order, args.platform, pick.reason, pick.score))
    }
  } catch {
    /* AI 检索失败则回退规则排序 */
  }

  if (!pickedRows.length) {
    const seenVideo = new Set<string>()
    const seenImage = new Set<string>()
    for (const { c } of ruleRanked) {
      if (pickedRows.length >= limit) break
      const videoKey = norm(c.videoUrl)
      if (videoKey && seenVideo.has(videoKey)) continue
      const imgs = c.sceneImages.filter((u) => {
        if (seenImage.has(u)) return false
        seenImage.add(u)
        return true
      })
      if (!videoKey && imgs.length === 0) continue
      if (videoKey) seenVideo.add(videoKey)
      pickedRows.push(candidateToRow(c, keywords, args.order, args.platform))
    }
  }

  args.onProgress?.('正在下载参考素材到本页预览…')
  const hydrated: ViralBriefReferenceCase[] = []
  for (const row of pickedRows.slice(0, limit)) {
    hydrated.push(await hydrateReferenceCaseMedia(row))
  }
  return hydrated
}

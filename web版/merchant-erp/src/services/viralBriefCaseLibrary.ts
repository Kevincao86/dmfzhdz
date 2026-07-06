import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import { fetchOpsRegistry } from '../lib/opsRegistryClient'
import type { RegistryMpRecruitmentOrder, RegistryVideoSubmission } from '../lib/opsRegistryTypes'
import type { ViralBriefPlatform, ViralBriefResult, ViralBriefStyle } from './viralBriefAi'
import { STYLE_LABELS, platformLabel } from './viralBriefAi'
import { fetchBriefWebReferenceHits } from './viralBriefReferenceSearchApi'

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
  source: 'video_submission' | 'mp_applicant' | 'order_cover' | 'web_search' | 'platform_search'
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
  const ruleRanked = [...candidates]
    .map((c) => ({ c, score: scoreCandidate(c, keywords, args.order, args.platform) }))
    .filter((x) => x.score > 0 || x.c.videoUrl || x.c.sceneImages.length)
    .sort((a, b) => b.score - a.score)

  const pickedRows: ViralBriefReferenceCase[] = []

  args.onProgress?.('正在从案例库按关键词检索相似探店视频与场景图（注册表已有素材，非 AI 生成）…')
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

  if (pickedRows.length < limit) {
    args.onProgress?.('正在检索抖音/网页相似视频与场景图（只检索链接，不生图不生视频）…')
    try {
      const webHits = await fetchBriefWebReferenceHits({
        platform: args.platform,
        orderTitle: args.order.title,
        category: args.order.category,
        region: args.order.region,
        styleLabel: STYLE_LABELS[args.style],
        requirementSummary: args.brief.requirementSummary,
        topics: args.brief.topics,
        limit: limit - pickedRows.length,
      })
      for (const hit of webHits) {
        if (pickedRows.length >= limit) break
        const vKey = norm(hit.originalVideoUrl)
        if (vKey && seenVideo.has(vKey)) continue
        const imgs = (hit.originalSceneImages || []).filter((u) => {
          if (seenImage.has(u)) return false
          seenImage.add(u)
          return true
        })
        if (!vKey && imgs.length === 0) continue
        if (vKey) seenVideo.add(vKey)
        pickedRows.push({
          id: hit.id,
          title: hit.title,
          platform: hit.platform,
          originalVideoUrl: hit.originalVideoUrl,
          originalThumbUrl: hit.originalThumbUrl,
          originalSceneImages: imgs.length ? imgs : hit.originalSceneImages,
          sceneImages: [],
          matchScore: 1,
          matchReason: hit.matchReason,
          source: hit.source,
        })
      }
    } catch {
      /* 网页检索失败不阻断 Brief 主流程 */
    }
  }

  args.onProgress?.('正在下载参考素材到本页预览…')
  const hydrated: ViralBriefReferenceCase[] = []
  for (const row of pickedRows.slice(0, limit)) {
    hydrated.push(await hydrateReferenceCaseMedia(row))
  }
  return hydrated
}

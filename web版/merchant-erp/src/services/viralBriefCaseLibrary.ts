import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import { fetchOpsRegistry } from '../lib/opsRegistryClient'
import type { RegistryMpRecruitmentOrder, RegistryVideoSubmission } from '../lib/opsRegistryTypes'
import type { ViralBriefPlatform, ViralBriefResult, ViralBriefStyle } from './viralBriefAi'
import { STYLE_LABELS, platformLabel } from './viralBriefAi'

export type ViralBriefReferenceCase = {
  id: string
  title: string
  platform?: string
  category?: string
  region?: string
  videoUrl?: string
  thumbUrl?: string
  sceneImages: string[]
  matchScore: number
  matchReason: string
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
): string[] {
  const raw = [
    order.title,
    order.category,
    order.region,
    order.platform,
    order.recruitContent,
    brief.requirementSummary,
    STYLE_LABELS[style],
    platformLabel(brief.platform),
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
  for (const alias of PLATFORM_ALIASES[brief.platform] || []) {
    if (alias.length >= 2) tokens.add(alias.toLowerCase())
  }
  return [...tokens]
}

function platformMatches(candidatePlatform: string, target: ViralBriefPlatform): boolean {
  const p = norm(candidatePlatform).toLowerCase()
  if (!p) return false
  return (PLATFORM_ALIASES[target] || []).some((alias) => p.includes(alias.toLowerCase()))
}

function scoreCandidate(candidate: CaseCandidate, keywords: string[], order: RecruitOrderPickerRow, platform: ViralBriefPlatform): number {
  let score = 0
  const hay = [
    candidate.title,
    candidate.category,
    candidate.region,
    candidate.platform,
    candidate.aiNote,
    candidate.videoUrl,
  ]
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

function buildMatchReason(candidate: CaseCandidate, order: RecruitOrderPickerRow, platform: ViralBriefPlatform): string {
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

function collectFromSubmission(v: RegistryVideoSubmission, mpById: Map<string, RegistryMpRecruitmentOrder>, out: CaseCandidate[]) {
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

export async function pickViralBriefReferenceCases(args: {
  order: RecruitOrderPickerRow
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  brief: Pick<ViralBriefResult, 'requirementSummary' | 'structure' | 'hooks' | 'topics' | 'platform'>
  limit?: number
}): Promise<ViralBriefReferenceCase[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 4, 8))
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

  const keywords = collectKeywords(args.order, args.brief, args.style)
  const scored = candidates
    .map((c) => {
      const matchScore = scoreCandidate(c, keywords, args.order, args.platform)
      return {
        id: c.id,
        title: c.title,
        platform: c.platform || undefined,
        category: c.category || undefined,
        region: c.region || undefined,
        videoUrl: c.videoUrl,
        thumbUrl: c.thumbUrl,
        sceneImages: c.sceneImages,
        matchScore,
        matchReason: buildMatchReason(c, args.order, args.platform),
        source: c.source,
      } satisfies ViralBriefReferenceCase
    })
    .filter((c) => c.matchScore > 0 || c.videoUrl || c.sceneImages.length)
    .sort((a, b) => b.matchScore - a.matchScore)

  const picked: ViralBriefReferenceCase[] = []
  const seenVideo = new Set<string>()
  const seenImage = new Set<string>()
  for (const row of scored) {
    if (picked.length >= limit) break
    const videoKey = norm(row.videoUrl)
    if (videoKey && seenVideo.has(videoKey)) continue
    const uniqueImages = row.sceneImages.filter((u) => {
      if (seenImage.has(u)) return false
      seenImage.add(u)
      return true
    })
    if (!videoKey && uniqueImages.length === 0) continue
    if (videoKey) seenVideo.add(videoKey)
    picked.push({ ...row, sceneImages: uniqueImages.length ? uniqueImages : row.sceneImages.slice(0, 3) })
  }
  return picked
}

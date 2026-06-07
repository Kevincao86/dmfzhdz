import type { MpRegistry, RecruitmentOrderRow, TalentCardRow } from './types'
import { postMpRecruitmentAi } from '../mpApi'
import { isIceMpOrder, mapMpOrderRow } from './orderCard'
import { readPublishedOrders } from './publishedOrders'
import type { PrBoardId } from './prRecommendBoard'
import { readApplications } from '../mpSync/applicationsStore'
import { primaryPlatformProfile, readMember, type TalentMember } from '../mpSync/talentMember'
import { getWorkIdentity, workIdentityLabel, type MpWorkIdentity } from '../mpWorkIdentity'
import {
  applicationHabitsFromApps,
  applyOrderMatchResults,
  mergeCardAiTags,
  type ApplicationHabits,
  type OrderMatchPayload,
  type TalentMatchProfile,
} from '@merchant/lib/mpRecruitmentMatchShared'

function hallKey(row: RecruitmentOrderRow) {
  if (row.isIce) return 'ice'
  if (row.urgent) return 'urgent'
  return 'normal'
}

function orderAiPayload(row: RecruitmentOrderRow): OrderMatchPayload {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    region: row.region,
    category: row.category,
    budgetText: row.budgetText,
    fansRequirement: row.fansRequirement,
    recruitTarget: row.recruitTarget || 'talent',
    hall: hallKey(row),
    urgent: row.urgent,
    isIce: row.isIce,
    summary: row.summary || '',
    priceAmount: row.priceAmount || 0,
  }
}

function primaryRecruitTargetForIdentity(id: MpWorkIdentity): 'talent' | 'shoot' | 'edit' {
  if (id === 'shoot') return 'shoot'
  if (id === 'edit') return 'edit'
  return 'talent'
}

export function talentProfileFromMember(
  member: TalentMember | null,
  opts?: { workIdentity?: MpWorkIdentity; applicationHabits?: ApplicationHabits },
): TalentMatchProfile | null {
  if (!member) return null
  const identity = opts?.workIdentity || getWorkIdentity()
  const habits = opts?.applicationHabits || applicationHabitsFromApps(readApplications())
  const primary = primaryPlatformProfile(member)
  const prof = primary?.profile
  const city = String(member.city || '').trim()
  const province = String(member.province || '').trim()
  const supplierSkills =
    identity === 'shoot'
      ? ['拍摄', '跟拍', '现场']
      : identity === 'edit'
        ? ['剪辑', '后期', '云剪']
        : []
  return {
    workIdentity: identity,
    role: identity,
    roleLabel: workIdentityLabel(identity),
    recruitTarget: primaryRecruitTargetForIdentity(identity),
    platform: primary?.platform || '',
    nickname: prof?.platformNickname || member.wxNickName || '',
    followers: prof?.followers ? String(prof.followers) : '',
    city,
    province,
    region: [province, city].filter(Boolean).join(' · '),
    accountTags: Array.isArray(prof?.accountTags) ? prof.accountTags : [],
    douyinSalesLevel: prof?.douyinSalesLevel || '',
    quotePrice: prof?.quotePrice || '',
    supplierSkills,
    applicationHabits: habits,
  }
}

export function fallbackTagForRow(row: RecruitmentOrderRow, talentCity = ''): {
  aiTag: string
  aiTagTone: string
} {
  if (row.isMock) return { aiTag: '演示', aiTagTone: 'default' }
  if (row.isIce) return { aiTag: '云剪直派', aiTagTone: 'ice' }
  if (row.urgent) return { aiTag: '急单速报', aiTagTone: 'urgent' }
  const region = String(row.region || '')
  if (talentCity && region.includes(talentCity) && !region.includes('全国')) {
    return { aiTag: '同城优选', aiTagTone: 'match' }
  }
  if ((row.priceAmount || 0) >= 1000) return { aiTag: '高佣优选', aiTagTone: 'budget' }
  if (row.budgetText.includes('CPS')) return { aiTag: '佣金友好', aiTagTone: 'hot' }
  if (row.fansRequirement.includes('不限')) return { aiTag: '门槛低', aiTagTone: 'niche' }
  return { aiTag: '值得看看', aiTagTone: 'default' }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function enrichOrderTags(rows: RecruitmentOrderRow[], talentCity = '') {
  const list = rows.filter((r) => r.id)
  const withLocal = list.map((r) => ({ ...r, ...fallbackTagForRow(r, talentCity), aiTagSource: 'local' }))
  if (!list.length) return withLocal
  const map: Record<string, { tag: string; tone: string }> = {}
  for (const part of chunk(list, 8)) {
    try {
      const res = await postMpRecruitmentAi({ mode: 'tag', orders: part.map(orderAiPayload) })
      const items = Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (it?.id && it.tag) map[String(it.id)] = { tag: String(it.tag), tone: String(it.tone || 'default') }
      }
    } catch {
      break
    }
  }
  return list.map((row) => {
    const hit = map[row.id]
    if (hit?.tag) return { ...row, aiTag: hit.tag, aiTagTone: hit.tone, aiTagSource: 'ai' as const }
    return { ...row, ...fallbackTagForRow(row, talentCity), aiTagSource: 'local' as const }
  })
}

export async function enrichOrderMatches(
  rows: RecruitmentOrderRow[],
  member: TalentMember | null,
  opts?: { workIdentity?: MpWorkIdentity },
) {
  const list = rows.filter((r) => r.id && !r.isMock)
  const talent = talentProfileFromMember(member ?? readMember(), opts)
  const talentCity = talent?.city || ''
  const tagPromise = enrichOrderTags(list, talentCity)

  if (!list.length) {
    return tagPromise
  }
  if (!talent) {
    const tagged = await tagPromise
    return tagged.map((r) => ({ ...r, matchScore: 0, aiMatch: false }))
  }

  const map: Record<string, { score: number; tag: string; tone: string }> = {}
  for (const part of chunk(list, 8)) {
    try {
      const res = await postMpRecruitmentAi({ mode: 'match', orders: part.map(orderAiPayload), talent })
      const items = Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (!it?.id) continue
        map[String(it.id)] = {
          score: Number(it.score) || 0,
          tag: String(it.tag || ''),
          tone: String(it.tone || 'default'),
        }
      }
    } catch {
      break
    }
  }
  const scored = applyOrderMatchResults(list, map, talent, talentCity)
  const tagged = await tagPromise
  const enriched = mergeCardAiTags(scored, tagged)
  enriched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  return enriched
}

function prOrderAiPayload(mp: Record<string, unknown>, row: RecruitmentOrderRow) {
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? (mp.mpPublishMeta as Record<string, unknown>) : {}
  const info = String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 500)
  return {
    ...orderAiPayload(row),
    talentTags: Array.isArray(meta.talentTags) ? meta.talentTags : [],
    infoSummary: info,
    recruitDetail: String(meta.recruitDetail || '').slice(0, 200),
  }
}

export function orderMatchesPrBoard(row: RecruitmentOrderRow, mp: Record<string, unknown> | null, board: PrBoardId): boolean {
  if (!row) return false
  const target = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  if (row.recruitTarget === target) return true
  if (board === 'edit' && row.isIce) return true
  if (board === 'talent' && mp && isIceMpOrder(mp)) return false
  return false
}

export function resolvePrRecentOrders(reg: MpRegistry, opts?: { board?: PrBoardId; recruitTarget?: PrBoardId }) {
  const board = opts?.board || opts?.recruitTarget || 'talent'
  const local = readPublishedOrders()
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const out: { mp: Record<string, unknown>; row: RecruitmentOrderRow; payload: Record<string, unknown> }[] = []
  for (const item of local) {
    if (!item?.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId) as Record<string, unknown> | undefined
    if (!mp || (mp.status !== 'open' && mp.status !== 'collecting')) continue
    const row = mapMpOrderRow(mp, reg)
    if (board && !orderMatchesPrBoard(row, mp, board)) continue
    out.push({ mp, row, payload: prOrderAiPayload(mp, row) })
    if (out.length >= 6) break
  }
  return out
}

export function fallbackTalentScore(
  talent: TalentCardRow,
  orderPayloads: Record<string, unknown>[],
  board?: PrBoardId,
): { score: number; tag: string; tone: string } {
  if (!orderPayloads.length) return { score: 0, tag: '', tone: 'default' }
  let best = 0
  let tag = '可沟通'
  const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  for (const o of orderPayloads) {
    let s = 38
    const plat = String(o.platform || '')
    const tPlat = String(talent.platform || '')
    if (plat && tPlat && plat === tPlat) s += 18
    const region = String(o.region || '')
    const tRegion = String(talent.region || '')
    if (region.includes('全国')) s += 6
    else if (tRegion && region.includes(tRegion.split('·')[0]?.trim() || '')) s += 16
    const target = String(o.recruitTarget || 'talent')
    if (target === wid) s += 14
    else if (target !== wid) s -= 18
    const needTags = (o.talentTags as string[]) || []
    const tTags = [...(talent.tags || []), ...(talent.accountTags || [])]
    if (needTags.length && tTags.some((t) => needTags.includes(t))) s += 14
    const fansReq = String(o.fansRequirement || o.fans || '')
    const f = Number(talent.followersRaw) || 0
    if (fansReq.includes('不限')) s += 10
    else {
      const fm = fansReq.match(/([\d.]+)\s*万/)
      const need = fm ? Number(fm[1]) * 10000 : Number((fansReq.match(/(\d+)/) || [])[1] || 0)
      if (need > 0 && f >= need) s += 12
    }
    if ((o.priceAmount as number) >= 500) s += 4
    if (s > best) {
      best = s
      if (s >= 78) tag = '高匹配'
      else if (s >= 65) tag = '较契合'
      else if (plat === tPlat) tag = '平台匹配'
    }
  }
  return { score: Math.min(90, best), tag, tone: best >= 65 ? 'match' : 'default' }
}

function talentAiPayload(row: TalentCardRow, board?: PrBoardId) {
  const wid = board === 'shoot' ? 'shoot' : board === 'edit' ? 'edit' : 'talent'
  const skills =
    wid === 'shoot'
      ? ['拍摄', '跟拍', ...(row.tags || [])]
      : wid === 'edit'
        ? ['剪辑', '后期', ...(row.tags || [])]
        : row.tags || []
  return {
    id: row.id,
    workIdentity: wid,
    role: wid,
    roleLabel: wid === 'shoot' ? '拍摄团队' : wid === 'edit' ? '剪辑团队' : '达人',
    recruitTarget: wid,
    platform: row.platform,
    nickname: row.name,
    followers: row.followersRaw,
    region: row.region,
    accountTags: row.accountTags || row.tags,
    douyinSalesLevel: row.douyinSalesLevel || row.salesGrade,
    gender: row.gender,
    quality: row.quality,
    tags: row.tags,
    supplierSkills: skills.slice(0, 8),
    quotePrice: (row as { quotePrice?: string }).quotePrice || '',
  }
}

export async function enrichTalentMatchesForPr(
  rows: TalentCardRow[],
  reg: MpRegistry,
  opts?: { board?: PrBoardId },
) {
  const board = opts?.board || 'talent'
  const list = rows.filter((t) => t?.id && !t.isPreview)
  const packs = resolvePrRecentOrders(reg, opts)
  const orderPayloads = packs.map((p) => p.payload)
  if (!orderPayloads.length) return list
  const map: Record<string, { score: number; tag: string; tone: string }> = {}
  for (const part of chunk(list, 12)) {
    try {
      const res = await postMpRecruitmentAi({
        mode: 'match_talent',
        orders: orderPayloads,
        talents: part.map((t) => talentAiPayload(t, board)),
      })
      const items = Array.isArray(res.items) ? res.items : []
      for (const it of items) {
        if (!it?.id) continue
        map[String(it.id)] = {
          score: Number(it.score) || 0,
          tag: String(it.tag || ''),
          tone: String(it.tone || 'default'),
        }
      }
    } catch {
      break
    }
  }
  return list
    .map((t) => {
      const hit = map[t.id]
      if (hit && hit.score > 0) {
        const score = Math.min(100, Math.round(hit.score))
        return {
          ...t,
          matchScore: score,
          aiTag: hit.tag || (score >= 75 ? '高匹配' : t.aiTag),
          aiTagTone: hit.tone,
          aiMatch: score >= 55,
          aiTagSource: 'ai' as const,
        }
      }
      const fb = fallbackTalentScore(t, orderPayloads, board)
      return {
        ...t,
        matchScore: fb.score,
        aiTag: fb.tag,
        aiTagTone: fb.tone,
        aiMatch: fb.score >= 55,
        aiTagSource: 'local' as const,
      }
    })
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0))
}

import type { MpRegistry, RecruitmentOrderRow, TalentCardRow } from './types'
import { postMpRecruitmentAi } from '../mpApi'
import { mapMpOrderRow } from './orderCard'
import { readPublishedOrders } from './publishedOrders'

function hallKey(row: RecruitmentOrderRow) {
  if (row.isIce) return 'ice'
  if (row.urgent) return 'urgent'
  return 'normal'
}

function orderAiPayload(row: RecruitmentOrderRow) {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    region: row.region,
    category: row.category,
    budgetText: row.budgetText,
    fansRequirement: row.fansRequirement,
    hall: hallKey(row),
    urgent: row.urgent,
    isIce: row.isIce,
    summary: row.summary || '',
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
    if (hit?.tag) return { ...row, aiTag: hit.tag, aiTagTone: hit.tone, aiTagSource: 'ai' }
    return { ...row, ...fallbackTagForRow(row, talentCity), aiTagSource: 'local' }
  })
}

export async function enrichOrderMatches(
  rows: RecruitmentOrderRow[],
  member: { city?: string; province?: string; platform?: string; nickname?: string; followers?: string; accountTags?: string[] } | null,
) {
  const list = rows.filter((r) => r.id && !r.isMock)
  const talentCity = member?.city || ''
  if (!member || !list.length) {
    return list.map((r) => ({ ...r, ...fallbackTagForRow(r, talentCity), matchScore: 0, aiTagSource: 'local' }))
  }
  const talent = {
    platform: member.platform || '',
    nickname: member.nickname || '',
    followers: member.followers || '',
    city: member.city || '',
    province: member.province || '',
    region: [member.province, member.city].filter(Boolean).join(' · '),
    accountTags: member.accountTags || [],
    douyinSalesLevel: '',
    quotePrice: '',
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
  const enriched = list.map((row) => {
    const hit = map[row.id]
    const fb = fallbackTagForRow(row, talentCity)
    if (!hit) return { ...row, ...fb, matchScore: 0, aiTagSource: 'local' }
    const score = Math.max(0, Math.min(100, Math.round(hit.score)))
    return {
      ...row,
      matchScore: score,
      aiTag: hit.tag || (score >= 75 ? '高匹配' : fb.aiTag),
      aiTagTone: hit.tone || (score >= 75 ? 'match' : fb.aiTagTone),
      aiMatch: score >= 60,
      aiTagSource: 'ai',
    }
  })
  enriched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  return enriched
}

export function resolvePrRecentOrders(reg: MpRegistry) {
  const local = readPublishedOrders()
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const out: { mp: Record<string, unknown>; row: RecruitmentOrderRow; payload: Record<string, unknown> }[] = []
  for (const item of local) {
    if (!item?.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId) as Record<string, unknown> | undefined
    if (!mp || (mp.status !== 'open' && mp.status !== 'collecting')) continue
    const row = mapMpOrderRow(mp, reg)
    out.push({
      mp,
      row,
      payload: {
        ...orderAiPayload(row),
        talentTags: Array.isArray((mp.mpPublishMeta as Record<string, unknown>)?.talentTags)
          ? (mp.mpPublishMeta as Record<string, unknown>).talentTags
          : [],
        infoSummary: String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 500),
      },
    })
    if (out.length >= 6) break
  }
  return out
}

function talentAiPayload(row: TalentCardRow) {
  return {
    id: row.id,
    platform: row.platform,
    nickname: row.name,
    followers: row.followersRaw,
    region: row.region,
    accountTags: row.accountTags || row.tags,
    douyinSalesLevel: row.douyinSalesLevel || row.salesGrade,
    gender: row.gender,
    quality: row.quality,
    tags: row.tags,
  }
}

function fallbackTalentScore(
  talent: TalentCardRow,
  orderPayloads: Record<string, unknown>[],
): { score: number; tag: string; tone: string } {
  if (!orderPayloads.length) return { score: 0, tag: '', tone: 'default' }
  let best = 0
  let tag = '可沟通'
  for (const o of orderPayloads) {
    let s = 40
    if (o.platform && talent.platform && o.platform === talent.platform) s += 20
    const region = String(o.region || '')
    const tRegion = talent.region || ''
    if (region.includes('全国')) s += 5
    else if (region && tRegion && region.includes(tRegion.split('·')[0]?.trim() || '')) s += 15
    if (s > best) {
      best = s
      if (s >= 70) tag = '较契合'
    }
  }
  return { score: Math.min(88, best), tag, tone: best >= 65 ? 'match' : 'default' }
}

export async function enrichTalentMatchesForPr(rows: TalentCardRow[], reg: MpRegistry) {
  const packs = resolvePrRecentOrders(reg)
  const orderPayloads = packs.map((p) => p.payload)
  if (!orderPayloads.length) return rows
  const map: Record<string, { score: number; tag: string; tone: string }> = {}
  for (const part of chunk(rows, 12)) {
    try {
      const res = await postMpRecruitmentAi({
        mode: 'match_talent',
        orders: orderPayloads,
        talents: part.map(talentAiPayload),
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
  return rows
    .map((t) => {
      const hit = map[t.id]
      if (hit) {
        const score = Math.min(100, Math.round(hit.score))
        return {
          ...t,
          matchScore: score,
          aiTag: hit.tag || t.aiTag,
          aiTagTone: hit.tone,
          aiMatch: score >= 55,
        }
      }
      const fb = fallbackTalentScore(t, orderPayloads)
      return { ...t, matchScore: fb.score, aiTag: fb.tag, aiTagTone: fb.tone, aiMatch: fb.score >= 55 }
    })
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
}

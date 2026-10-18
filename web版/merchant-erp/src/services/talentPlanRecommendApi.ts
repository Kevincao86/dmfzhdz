import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { supabase } from '../lib/supabaseClient'
import type { TalentPlanCard, TalentPlanSeat } from '../lib/talentPlanRecommend'

export type TalentPlanRecommendResponse = {
  ok: boolean
  cards?: TalentPlanCard[]
  seats?: TalentPlanSeat[]
  cityNote?: string
  error?: string
}

export async function requestTalentPlanRecommend(body: {
  city: string
  platform: string
  talentType: string
  budgetYuan: number
  headcount: number
  seats: TalentPlanSeat[]
  excludedIds: string[]
}): Promise<TalentPlanRecommendResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (!supabase) return { ok: false, error: '请先登录后再拉推荐名单' }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = String(sessionData.session?.access_token || '').trim()
  if (!token) return { ok: false, error: '请先登录后再拉推荐名单' }
  headers.Authorization = `Bearer ${token}`
  const payload = JSON.stringify({ mode: 'talent_recommend', ...body })
  let lastError = '推荐名单暂时取不到'
  for (const url of merchantApiFetchUrls('/api/meoo-ops-novice-kol-allocation')) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: payload })
      const j = (await res.json()) as TalentPlanRecommendResponse & { message?: string }
      if (!res.ok || !j.ok) {
        lastError = j.message || j.error || lastError
        continue
      }
      return j
    } catch {
      /* try next */
    }
  }
  return { ok: false, error: lastError }
}

/**
 * 抖音林客 CPS 定向计划 — 服务商版招募联动 API
 */
import {
  cpsTalentDetailRowsFromMap,
  parseOrientedPlanTalentDetailPayload,
  type CpsTalentDetailRow,
} from '../lib/douyinCpsShared'
import { readMerchantSession } from '../lib/merchantSession'
import { merchantApiFetchUrlCandidates } from './douyinProductApi'

const CPS_SAVE_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-save',
  '/api/merchant/douyin/cps/oriented-plan/save-video',
] as const

const CPS_LIST_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-list',
  '/api/merchant/douyin/cps/oriented-plan/list',
] as const

const CPS_TALENT_DETAIL_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-talent-detail',
  '/api/merchant/douyin/cps/oriented-plan/talent-detail',
] as const

function authHeaders(): HeadersInit {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function postJson<T>(
  paths: readonly string[],
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const payload = JSON.stringify(body)
  const headers = authHeaders()
  let lastMsg = '请求失败'
  for (const path of merchantApiFetchUrlCandidates([...paths])) {
    try {
      const res = await fetch(path, { method: 'POST', headers, body: payload })
      const text = await res.text()
      const trim = text.trimStart()
      if (trim.startsWith('<')) continue
      let j: Record<string, unknown> = {}
      try {
        j = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        j = {}
      }
      if (!res.ok || j.ok === false) {
        lastMsg = String(j.message || `HTTP ${res.status}`)
        if (res.status === 404) continue
        return { ok: false, message: lastMsg }
      }
      return { ok: true, data: j as T }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastMsg }
}

export type SaveVideoOrientedPlanPayload = {
  account_id?: string
  plan_id?: string
  plan_name: string
  merchant_phone: string
  douyin_id_list: string[]
  product_list: { product_id: string; commission_rate: number }[]
  start_time?: number
  end_time?: number
  commission_duration?: number
}

export async function saveDouyinVideoOrientedPlan(
  payload: SaveVideoOrientedPlanPayload,
): Promise<{ ok: true; planId: string } | { ok: false; message: string }> {
  const accountId = readMerchantSession('meoo_douyin_merchant_id')
  const r = await postJson<{ plan_id?: string; message?: string }>(CPS_SAVE_PATHS, {
    ...payload,
    account_id: payload.account_id || accountId || undefined,
    product_list: payload.product_list.map((p) => ({
      product_id: p.product_id,
      commission_rate: p.commission_rate,
    })),
  })
  if (!r.ok) return r
  const planId = String(r.data.plan_id || '').trim()
  if (!planId) return { ok: false, message: '抖音未返回 plan_id' }
  return { ok: true, planId }
}

export async function fetchDouyinOrientedPlanTalentDetail(params: {
  planId: string
  douyinIds: string[]
}): Promise<{ ok: true; rows: CpsTalentDetailRow[] } | { ok: false; message: string }> {
  const r = await postJson<{ upstream?: unknown }>(CPS_TALENT_DETAIL_PATHS, {
    plan_id: params.planId,
    douyin_id_list: params.douyinIds,
  })
  if (!r.ok) return r
  const map = parseOrientedPlanTalentDetailPayload(r.data.upstream ?? r.data)
  return { ok: true, rows: cpsTalentDetailRowsFromMap(map) }
}

export async function listDouyinOrientedPlansByProduct(
  productIds: string[],
): Promise<{ ok: true; upstream: unknown } | { ok: false; message: string }> {
  const r = await postJson<{ upstream?: unknown }>(CPS_LIST_PATHS, {
    spu_id_list: productIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0),
  })
  if (!r.ok) return r
  return { ok: true, upstream: r.data.upstream ?? r.data }
}

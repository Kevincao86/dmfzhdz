/**
 * PR 星选 · 抖音林客 API（经 erp-api 反代，Bearer 为客户商家 sealed token）
 */
import { apiUrl, mpApiFetchCandidates } from '../mpApiBase'
import {
  cpsTalentDetailRowsFromMap,
  parseOrientedPlanTalentDetailPayload,
  type CpsTalentDetailRow,
} from '@merchant/lib/douyinCpsShared'
import { applyPrDouyinClientSession, readPrDouyinClientSessionToken } from './prDouyinLinkeStore'
import type { PrDouyinLinkeClient } from './prDouyinLinkeTypes'

const BIND_PATHS = ['/api/meoo-douyin-bind', '/api/douyin-bind', '/api/merchant/douyin/bind'] as const
const CPS_SAVE_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-save',
  '/api/merchant/douyin/cps/oriented-plan/save-video',
] as const
const CPS_TALENT_DETAIL_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-talent-detail',
  '/api/merchant/douyin/cps/oriented-plan/talent-detail',
] as const
const GOODS_QUERY_PATHS = [
  '/api/meoo-douyin-goods-product-online-query',
  '/api/merchant/douyin/goods/product-online-query',
] as const

function authHeaders(token: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function postWithToken<T>(
  paths: readonly string[],
  body: unknown,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const payload = JSON.stringify(body)
  const headers = authHeaders(token)
  let lastMsg = '请求失败'
  for (const apiPath of paths) {
    for (const url of mpApiFetchCandidates(apiPath)) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: payload })
        const text = await res.text()
        if (text.trimStart().startsWith('<')) continue
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
  }
  return { ok: false, message: lastMsg }
}

export async function postPrDouyinBind(payload: {
  appId: string
  appSecret: string
  merchantId: string
}): Promise<
  | { ok: true; accessToken: string; accountName?: string }
  | { ok: false; message: string }
> {
  const r = await postWithToken<{ accessToken?: string; accountName?: string; message?: string }>(
    BIND_PATHS,
    payload,
    '',
  )
  if (!r.ok) return r
  const token = String(r.data.accessToken || '').trim()
  if (!token) return { ok: false, message: '绑定成功但未返回 accessToken' }
  return { ok: true, accessToken: token, accountName: r.data.accountName }
}

export type PrDouyinProductHit = { id: string; name: string }

export async function searchPrDouyinProducts(
  client: PrDouyinLinkeClient,
  keyword: string,
): Promise<{ ok: true; hits: PrDouyinProductHit[] } | { ok: false; message: string }> {
  applyPrDouyinClientSession(client)
  const token = readPrDouyinClientSessionToken() || client.sealedToken
  const r = await postWithToken<{ hits?: Array<{ product_id?: string; product_name?: string }> }>(
    GOODS_QUERY_PATHS,
    { product_name: keyword, count: 20, goods_query_type: 3 },
    token,
  )
  if (!r.ok) return r
  const hits = (r.data.hits ?? [])
    .map((h) => ({
      id: String(h.product_id || '').trim(),
      name: String(h.product_name || h.product_id || '').trim(),
    }))
    .filter((x) => x.id)
  return { ok: true, hits }
}

export async function savePrDouyinVideoOrientedPlan(
  client: PrDouyinLinkeClient,
  payload: {
    plan_id?: string
    plan_name: string
    merchant_phone: string
    douyin_id_list: string[]
    product_list: { product_id: string; commission_rate: number }[]
    start_time?: number
    end_time?: number
    commission_duration?: number
  },
): Promise<{ ok: true; planId: string } | { ok: false; message: string }> {
  applyPrDouyinClientSession(client)
  const token = readPrDouyinClientSessionToken() || client.sealedToken
  const r = await postWithToken<{ plan_id?: string }>(
    CPS_SAVE_PATHS,
    {
      ...payload,
      account_id: client.merchantAccountId,
    },
    token,
  )
  if (!r.ok) return r
  const planId = String(r.data.plan_id || '').trim()
  if (!planId) return { ok: false, message: '抖音未返回 plan_id' }
  return { ok: true, planId }
}

export async function fetchPrDouyinOrientedPlanTalentDetail(
  client: PrDouyinLinkeClient,
  params: { planId: string; douyinIds: string[] },
): Promise<{ ok: true; rows: CpsTalentDetailRow[] } | { ok: false; message: string }> {
  applyPrDouyinClientSession(client)
  const token = readPrDouyinClientSessionToken() || client.sealedToken
  const r = await postWithToken<{ upstream?: unknown }>(
    CPS_TALENT_DETAIL_PATHS,
    { plan_id: params.planId, douyin_id_list: params.douyinIds },
    token,
  )
  if (!r.ok) return r
  const map = parseOrientedPlanTalentDetailPayload(r.data.upstream ?? r.data)
  return { ok: true, rows: cpsTalentDetailRowsFromMap(map) }
}

/**
 * GET /api/meoo-ops-mp-hall-registry — 达人招募大厅
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import { loadMpHallRegistryPayload, slimMpRecruitmentOrdersForHallList } from '../src/lib/mpHallRegistryCore.js'
import type { RegistryMpRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'

const HALL_LIST_CACHE_MS = 8_000

type HallListCacheEntry = { at: number; json: string }
const hallListCache = new Map<string, HallListCacheEntry>()
const hallListInflight = new Map<string, Promise<string>>()

/** 报名写入后丢掉大厅列表缓存，下一轮列表读到新的报名人数。 */
export function invalidateMpHallListCache(): void {
  hallListCache.clear()
}

async function hallListResponseJson(includeRecommendPool: boolean): Promise<string> {
  const key = includeRecommendPool ? 'pool' : 'hall'
  const hit = hallListCache.get(key)
  if (hit && Date.now() - hit.at < HALL_LIST_CACHE_MS) return hit.json
  const pending = hallListInflight.get(key)
  if (pending) return pending
  const task = (async () => {
    const payload = await loadMpHallRegistryPayload({
      includeRecommendPool,
    })
    if (!payload || typeof payload !== 'object') {
      throw new Error('erp_api_invalid_shape')
    }
    if (!Array.isArray(payload.mpRecruitmentOrders)) {
      payload.mpRecruitmentOrders = []
    } else {
      payload.mpRecruitmentOrders = slimMpRecruitmentOrdersForHallList(
        payload.mpRecruitmentOrders as RegistryMpRecruitmentOrder[],
      )
    }
    const json = JSON.stringify(payload)
    hallListCache.set(key, { at: Date.now(), json })
    return json
  })()
  hallListInflight.set(key, task)
  try {
    return await task
  } finally {
    if (hallListInflight.get(key) === task) hallListInflight.delete(key)
  }
}

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    const includeRecommendPool =
      String(req.query?.includeRecommendPool || '').trim() === '1' ||
      String(req.query?.includeRecommendPool || '').toLowerCase() === 'true'
    const json = await hallListResponseJson(includeRecommendPool)
    res.status(200).send(json)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const viaProxy = isVercelServerless() && /ecs_proxy|erp_api_proxy|ECONNRESET/i.test(msg)
    res.status(viaProxy ? 503 : 500).send(
      JSON.stringify({
        ok: false,
        error: 'meoo_ops_mp_hall_registry_failed',
        detail: viaProxy ? `ecs_proxy: ${msg.slice(0, 400)}` : msg.slice(0, 800),
      }),
    )
  }
}

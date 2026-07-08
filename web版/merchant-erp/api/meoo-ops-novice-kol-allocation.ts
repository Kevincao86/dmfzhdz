/**
 * POST /api/meoo-ops-novice-kol-allocation
 * 读取运营台达人库各档位均价，按预算与目标人数返回 V3–V5+ 人数分配（不暴露完整达人库）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import { buildNoviceAllocationFromTalentLibrary } from '../src/lib/talentLibraryTierPricing.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const auth = await requireMerchantRegistryAuth(req)
    if (!auth.ok) {
      sendOpsJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    let body: {
      city?: string
      budgetYuan?: number
      targetHeadcount?: number
      feeType?: 'tier' | 'fixed'
      platform?: string
      industry?: string
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const city = String(body.city ?? '').trim()
    const budgetYuan = Number(body.budgetYuan)
    const targetHeadcount = Number(body.targetHeadcount)
    const feeType = body.feeType === 'fixed' ? 'fixed' : 'tier'

    if (!city) {
      sendOpsJson(res, 400, { ok: false, error: 'city_required' })
      return
    }
    if (!Number.isFinite(budgetYuan) || budgetYuan <= 0) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_budget' })
      return
    }
    if (!Number.isFinite(targetHeadcount) || targetHeadcount < 1) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_headcount' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await loadRegistrySnapshotForGet(io)
    const entries = data.talentLibraryEntries ?? []

    const platformRaw = String(body.platform ?? '抖音').trim()
    const platform =
      platformRaw === '小红书' ||
      platformRaw === '大众点评' ||
      platformRaw === '快手' ||
      platformRaw === '微信视频号'
        ? platformRaw
        : '抖音'

    const allocation = buildNoviceAllocationFromTalentLibrary({
      entries,
      city,
      budgetYuan,
      targetHeadcount,
      feeType,
      platform,
      industry: String(body.industry ?? '').trim(),
    })

    const { pricingContext, ...publicAllocation } = allocation
    sendOpsJson(res, 200, {
      ok: true,
      allocation: publicAllocation,
      pricing: pricingContext
        ? {
            priceSource: pricingContext.priceSource,
            matchedEntries: pricingContext.matchedEntries,
            filterCity: pricingContext.filterCity,
            filterPlatform: pricingContext.filterPlatform,
            tierAvgs: pricingContext.tierAvgs,
          }
        : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_novice_kol_allocation_failed',
      detail: msg.slice(0, 800),
    })
  }
}

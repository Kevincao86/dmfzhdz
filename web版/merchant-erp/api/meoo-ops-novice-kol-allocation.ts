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
import {
  parseTalentPlanRecommendRequest,
  recommendTalentPlan,
} from '../src/lib/talentPlanRecommend.js'
import type { RegistryMpTalentMember, RegistryTalentLibraryEntry } from '../src/lib/opsRegistryTypes.js'
import { findMemberForLibraryEntry } from '../src/lib/talentLibraryFilters.js'
import { hydrateRecommendHallAvatarsFromAccounts } from '../src/lib/recommendHallMemberAvatars.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 180 }

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
      mode?: string
      city?: string
      budgetYuan?: number
      targetHeadcount?: number
      feeType?: 'tier' | 'fixed'
      platform?: string
      industry?: string
      gap?: number
      skipNames?: string[]
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    if (body.mode === 'talent_recommend') {
      const parsed = parseTalentPlanRecommendRequest(body)
      if (!parsed.ok) {
        sendOpsJson(res, 400, { ok: false, error: parsed.error })
        return
      }
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await loadRegistrySnapshotForGet(io)
      const hydrated = await hydrateRecommendHallAvatarsFromAccounts(
        { talentLibraryEntries: data.talentLibraryEntries ?? [] },
        supabaseUrl,
        serviceRole,
      )
      const entries = (
        Array.isArray(hydrated.talentLibraryEntries) ? hydrated.talentLibraryEntries : []
      ) as RegistryTalentLibraryEntry[]
      const filled = recommendTalentPlan({
        entries,
        ...parsed.value,
      })
      const members = (
        Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : []
      ) as RegistryMpTalentMember[]
      const byLibraryId = new Map(entries.map((entry) => [String(entry.id || ''), entry]))
      const cards = filled.cards.map((card) => {
        if (!card.talentId || card.empty) return card
        const entry = byLibraryId.get(card.talentId)
        if (!entry) return card
        const member =
          findMemberForLibraryEntry(entry, members) ||
          members.find((row) => row && String(row.id) === card.talentId) ||
          null
        return member?.id ? { ...card, memberId: String(member.id) } : card
      })
      sendOpsJson(res, 200, { ok: true, ...filled, cards })
      return
    }

    if (body.mode === 'talent_public_fill') {
      const city = String(body.city ?? '').trim()
      const industry = String(body.industry ?? '').trim() || '本地生活'
      const gap = Math.max(0, Math.min(20, Number(body.gap) || 0))
      const skipNames = Array.isArray(body.skipNames) ? body.skipNames.map((name) => String(name || '')) : []
      if (!city || gap < 1) {
        sendOpsJson(res, 400, { ok: false, error: 'invalid_public_fill' })
        return
      }
      const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
        '../vite-plugins/merchantRegistryVendorEnv.js'
      )
      const { callDoubaoWebSearch } = await import('../vite-plugins/merchantAiUpstream.js')
      const { hydrateListedPublicTalents, runDoubaoExploreFill } = await import('../src/lib/talentPlanRecommend.js')
      const env = await mergeMerchantAiEnvWithRegistrySnapshot(
        process.cwd(),
        process.env as Record<string, string>,
      )
      const key = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
      if (!key) {
        sendOpsJson(res, 503, { ok: false, error: 'doubao_key_missing' })
        return
      }
      const search = async (system: string, user: string) =>
        (await callDoubaoWebSearch(key, env, system, user)).text
      const seeds = await runDoubaoExploreFill(search, { city, industry, gap, skipNames })
      const hydrated = await hydrateListedPublicTalents(seeds, search, city)
      sendOpsJson(res, 200, { ok: true, seeds: hydrated })
      return
    }

    const city = String(body.city ?? '').trim()
    const budgetYuan = Number(body.budgetYuan)
    const targetHeadcount = Number(body.targetHeadcount)
    const feeType = body.feeType === 'fixed' ? 'fixed' : 'tier'

    // city 可空：空则走全国本地生活达人回退（写死规则）
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
            citySource: pricingContext.citySource,
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

/**
 * POST /api/meoo-brief-reference-search — Brief 案例检索（AI 提炼关键词 + 外网搜索）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import { mergeMerchantAiEnvWithRegistrySnapshot } from '../vite-plugins/merchantRegistryVendorEnv.js'
import {
  buildBriefWebSearchQueriesFromContent,
  extractBriefSearchQueriesWithAi,
  type BriefContentForSearch,
} from '../src/lib/viralBriefReferenceKeywordCore.js'
import { searchBriefWebReferences } from '../src/lib/viralBriefWebReferenceSearchCore.js'
import type { ViralBriefPlatform } from '../src/services/viralBriefAi.js'

export const config = { maxDuration: 60 }

const PLATFORMS = new Set<ViralBriefPlatform>([
  'douyin',
  'xiaohongshu',
  'dianping',
  'channels',
  'kuaishou',
])

function readBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>
  if (typeof b === 'string' && b.trim()) {
    try {
      return JSON.parse(b) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function parseBriefContent(body: Record<string, unknown>, platform: ViralBriefPlatform): BriefContentForSearch {
  const raw = body.briefContent
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    platform,
    styleLabel: String(o.styleLabel || body.styleLabel || ''),
    requirementSummary: String(o.requirementSummary || body.requirementSummary || ''),
    hooks: Array.isArray(o.hooks) ? o.hooks.map((x) => String(x)) : [],
    titles: Array.isArray(o.titles) ? o.titles.map((x) => String(x)) : [],
    topics: Array.isArray(o.topics) ? o.topics.map((x) => String(x)) : [],
    mustMention: Array.isArray(o.mustMention) ? o.mustMention.map((x) => String(x)) : [],
    forbidden: Array.isArray(o.forbidden) ? o.forbidden.map((x) => String(x)) : [],
    structure: Array.isArray(o.structure)
      ? (o.structure as Record<string, unknown>[]).map((s) => ({
          scene: String(s.scene || ''),
          visual: String(s.visual || ''),
          voice: String(s.voice || ''),
        }))
      : [],
    openingParagraph: String(o.openingParagraph || ''),
    bodySections: Array.isArray(o.bodySections)
      ? (o.bodySections as Record<string, unknown>[]).map((s) => ({
          heading: String(s.heading || ''),
          content: String(s.content || ''),
        }))
      : [],
    fullCopy: String(o.fullCopy || ''),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method Not Allowed' })
    return
  }

  const body = readBody(req)
  const platformRaw = String(body.platform || 'douyin').trim() as ViralBriefPlatform
  const platform = PLATFORMS.has(platformRaw) ? platformRaw : 'douyin'
  const limit = Math.max(1, Math.min(Number(body.limit) || 4, 8))
  const briefContent = parseBriefContent(body, platform)

  const queriesFromBody = Array.isArray(body.queries)
    ? body.queries.map((x) => String(x).trim()).filter((x) => x.length >= 2)
    : []

  let queries = queriesFromBody.slice(0, 3)
  let querySource: 'client' | 'ai' | 'rules' = queries.length ? 'client' : 'rules'

  if (!queries.length) {
    const env = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), process.env as Record<string, string>)
    const aiQueries = await extractBriefSearchQueriesWithAi(env, briefContent)
    if (aiQueries.length) {
      queries = aiQueries
      querySource = 'ai'
    } else {
      queries = buildBriefWebSearchQueriesFromContent({ platform, brief: briefContent })
      querySource = 'rules'
    }
  }

  try {
    const hits = await searchBriefWebReferences({ platform, queries, limit })
    res.status(200).json({ ok: true, hits, queries, querySource })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(502).json({ ok: false, message: msg })
  }
}

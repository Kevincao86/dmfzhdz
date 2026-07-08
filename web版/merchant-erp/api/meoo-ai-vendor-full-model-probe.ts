/**
 * GET /api/meoo-ai-vendor-full-model-probe — 豆包/千问全量模型列表 + 各测 1 次连通性
 * Query: vendor=all|doubao|qwen  concurrency=4  timeoutMs=12000
 * Header: Authorization: Bearer <MEOO_SUPPORT_OPS_HTTP_TOKEN>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  probeDoubaoAllChatModels,
  probeQwenAllChatModels,
} from '../src/lib/aiVendorFullModelProbeCore.js'
import { mergeMerchantAiEnvWithRegistrySnapshot } from '../vite-plugins/merchantRegistryVendorEnv.js'
import {
  qwenCompatibleModelsListUrl,
} from '../src/lib/qwenAccountModelDiscovery.js'
import {
  qwenChatEndpointCandidates,
  qwenCompatibleChatCompletionsUrl,
  type MerchantAiEnv,
} from '../vite-plugins/merchantAiUpstream.js'

export const config = { maxDuration: 300 }

function bearerToken(authHeader: string | undefined): string {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return ''
  return authHeader.slice('Bearer '.length).trim()
}

function doubaoArkApiV3Root(env: Record<string, string | undefined>): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const expected = (process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN ?? '').trim()
  const token = bearerToken(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined)
  if (!expected || token !== expected) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return
  }

  const vendor = String(req.query.vendor ?? 'all').trim().toLowerCase()
  const concurrency = Math.max(1, Math.min(8, Number(req.query.concurrency) || 4))
  const perModelTimeoutMs = Math.max(3000, Math.min(30_000, Number(req.query.timeoutMs) || 12_000))

  const base = process.env as Record<string, string>
  const env = (await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), base)) as MerchantAiEnv
  const doubaoKey = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
  const qwenKey = String(env.MERCHANT_AI_QWEN_KEY || env.DASHSCOPE_API_KEY || '').trim()
  const qwenChatUrl = qwenCompatibleChatCompletionsUrl(env)
  const qwenModelsUrl = qwenCompatibleModelsListUrl(qwenChatUrl)

  const started = Date.now()
  const result: Record<string, unknown> = {
    ok: true,
    vendor,
    concurrency,
    perModelTimeoutMs,
    keys: {
      doubao: !!doubaoKey,
      qwen: !!qwenKey,
    },
    qwenChatUrl,
    qwenModelsUrl,
    doubaoApiV3: doubaoArkApiV3Root(env),
  }

  if (vendor === 'all' || vendor === 'doubao') {
    result.doubao = await probeDoubaoAllChatModels({
      apiKey: doubaoKey,
      apiV3Root: doubaoArkApiV3Root(env),
      concurrency,
      perModelTimeoutMs,
    })
  }
  if (vendor === 'all' || vendor === 'qwen') {
    const qwenEndpoints = qwenChatEndpointCandidates(env)
    result.qwenEndpoints = qwenEndpoints
    result.qwen = await probeQwenAllChatModels({
      apiKey: qwenKey,
      chatEndpointCandidates: qwenEndpoints,
      concurrency,
      perModelTimeoutMs,
    })
  }

  result.elapsedMs = Date.now() - started
  res.status(200).json(result)
}

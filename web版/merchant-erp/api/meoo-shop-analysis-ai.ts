/**
 * POST /api/meoo-shop-analysis-ai
 * body: { startDate, endDate, platform?, poiId?, marginPercent? }
 * header: Authorization Bearer, X-Meoo-Douyin-Token
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  buildShopAdviceFacts,
  computeShopAnalysisSummary,
} from '../vite-plugins/merchantPlatformOrdersCore.js'
import {
  buildShopReviewDigest,
  generateShopAnalysisAiReport,
  parseShopAiReportSections,
} from '../vite-plugins/shopAnalysisAiCore.js'
import { mergeMerchantAiEnvWithRegistrySnapshot } from '../vite-plugins/merchantRegistryVendorEnv.js'
import type { MerchantAiEnv } from '../vite-plugins/merchantAiUpstream.js'
import { runErpAiWithPointsBilling } from './_lib/erpAiApiPointsGate.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const config = { maxDuration: 120 }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const viteRoot = path.resolve(__dirname, '..')

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function bearer(authHeader: string | undefined): string | undefined {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined
}

function headerToken(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers[name]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== 'string') return undefined
  const m = /^Bearer\s+(\S+)/i.exec(v.trim())
  return (m?.[1] || v).trim() || undefined
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

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Meoo-Douyin-Token',
      )
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const token = bearer(req.headers.authorization)
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const env = process.env as Record<string, string>
    let user: Awaited<ReturnType<typeof verifyBearerJwt>>
    try {
      user = await verifyBearerJwt(`Bearer ${token}`, env)
    } catch {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    if (!user?.id) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const ctx = await loadTenantAiContextForUser(user.id, env)
    if (!ctx?.tenantId) {
      sendJson(res, 400, { ok: false, error: 'tenant_required' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const startDate = String(body.startDate || '').trim()
    const endDate = String(body.endDate || '').trim()
    if (!isYmd(startDate) || !isYmd(endDate) || startDate > endDate) {
      sendJson(res, 400, { ok: false, error: 'invalid_date_range' })
      return
    }
    const platform = String(body.platform || 'douyin').trim() || 'douyin'
    const poiId = String(body.poiId || '').trim()
    const marginPercent = Number(body.marginPercent || 0) || 0

    const summary = await computeShopAnalysisSummary({
      tenantId: ctx.tenantId,
      platform,
      poiId: poiId || undefined,
      startYmd: startDate,
      endYmd: endDate,
      marginPercent,
    })
    const adviceFacts = buildShopAdviceFacts(summary, `${startDate} ~ ${endDate}`)

    const douyinToken =
      headerToken(req, 'x-meoo-douyin-token') ||
      (typeof body.douyinToken === 'string' ? body.douyinToken.trim() : '') ||
      ''
    const poiIdsHint = summary.stores
      .map((s) => s.poiId)
      .filter((id) => id && id !== '_unknown')
    const reviewDigest = await buildShopReviewDigest({
      douyinToken,
      startYmd: startDate,
      endYmd: endDate,
      poiId: poiId || undefined,
      poiIdsHint,
    })

    const poiLabel = poiId
      ? summary.stores.find((s) => s.poiId === poiId)?.poiName || poiId
      : '全部门店'
    const warnings: string[] = []
    if (!reviewDigest.ok) warnings.push(reviewDigest.message || '评价拉取失败')
    else if (reviewDigest.warning) warnings.push(reviewDigest.warning)
    warnings.push('客群新老客为灵祺根据订单 open_id 推算，抖音订单接口不提供官方用户标签。')

    const aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(viteRoot, env as MerchantAiEnv)
    const authHeader = req.headers.authorization
    const billed = await runErpAiWithPointsBilling(
      typeof authHeader === 'string' ? authHeader : undefined,
      'ops_plan',
      env,
      { note: '店铺分析 GPT 报告' },
      async () => {
        const ai = await generateShopAnalysisAiReport({
          env: aiEnv,
          summary,
          adviceFacts,
          reviewDigest,
          startYmd: startDate,
          endYmd: endDate,
          platform,
          poiLabel,
        })
        if (!ai.ok) return { ok: false as const, message: ai.message }
        return { ok: true as const, text: ai.text, modelUsed: ai.modelUsed }
      },
    )

    if (billed.blocked) {
      sendJson(res, billed.status, {
        ok: false,
        error: billed.error,
        message: billed.message,
        required: billed.required,
        balance: billed.balance,
        summary,
        reviewDigest,
        adviceFacts,
        warnings,
      })
      return
    }

    const aiRes = billed.result
    if (!aiRes.ok) {
      sendJson(res, 200, {
        ok: true,
        startDate,
        endDate,
        summary,
        reviewDigest,
        adviceFacts,
        aiReport: '',
        aiSections: [],
        modelUsed: '',
        aiFailed: true,
        message: 'message' in aiRes ? aiRes.message : 'AI 分析失败，已返回规则建议',
        warnings,
        pointsCharged: 0,
      })
      return
    }

    const aiReport = aiRes.text
    sendJson(res, 200, {
      ok: true,
      startDate,
      endDate,
      summary,
      reviewDigest,
      adviceFacts,
      aiReport,
      aiSections: parseShopAiReportSections(aiReport),
      modelUsed: aiRes.modelUsed,
      warnings,
      pointsCharged: aiRes.pointsCharged ?? 0,
      pointsBalance: aiRes.pointsBalance,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, msg === 'postgres_not_configured' ? 503 : 500, {
      ok: false,
      error: msg === 'postgres_not_configured' ? msg : 'shop_analysis_ai_failed',
      detail: msg.slice(0, 400),
    })
  }
}

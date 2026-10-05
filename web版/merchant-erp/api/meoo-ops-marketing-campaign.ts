/**
 * POST /api/meoo-ops-marketing-campaign — 运营台读取/保存现金红包活动，并标记提现已打款。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminCenterView, type MarketingSurface } from '../src/lib/marketingCampaignCore.js'
import {
  markPrCashWithdrawPaid,
  markPrCashWithdrawsPaid,
  readMarketingCenter,
  saveMarketingBoard,
  saveMarketingCampaign,
} from '../src/lib/marketingCampaignStore.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).send(JSON.stringify(body))
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

function surfaceOf(value: unknown): MarketingSurface | null {
  return value === 'merchant_erp' || value === 'xingxuan' ? value : null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {})
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const surface = surfaceOf(body.surface) ?? 'xingxuan'
    const action = String(body.action || 'get')
    if (action === 'save') {
      const campaign = body.campaign && typeof body.campaign === 'object' ? (body.campaign as Record<string, unknown>) : null
      if (!campaign) {
        sendJson(res, 400, { ok: false, error: 'invalid_campaign' })
        return
      }
      const saved = await saveMarketingCampaign(surface, campaign)
      sendJson(res, 200, { ok: true, ...adminCenterView(saved, surface) })
      return
    }
    if (action === 'saveBoard') {
      const board = body.board && typeof body.board === 'object' ? (body.board as Record<string, unknown>) : null
      if (!board) {
        sendJson(res, 400, { ok: false, error: 'invalid_board' })
        return
      }
      const saved = await saveMarketingBoard(surface, board)
      sendJson(res, 200, { ok: true, ...adminCenterView(saved, surface) })
      return
    }
    if (action === 'markPaid') {
      const withdrawId = String(body.withdrawId || '').trim()
      if (!withdrawId) {
        sendJson(res, 400, { ok: false, error: 'withdraw_id_required' })
        return
      }
      const marked = await markPrCashWithdrawPaid(withdrawId)
      if (!marked.ok) {
        sendJson(res, 404, { ok: false, error: marked.error })
        return
      }
      sendJson(res, 200, { ok: true, ...adminCenterView(marked.center, surface) })
      return
    }
    if (action === 'markPaidBatch') {
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : []
      if (!ids.length) {
        sendJson(res, 400, { ok: false, error: 'withdraw_ids_required', detail: '回传文件里没有提现编号' })
        return
      }
      const marked = await markPrCashWithdrawsPaid(ids)
      sendJson(res, 200, {
        ok: true,
        updated: marked.updated.length,
        alreadyPaid: marked.alreadyPaid,
        missing: marked.missing,
        ...adminCenterView(marked.center, surface),
      })
      return
    }
    const center = await readMarketingCenter()
    sendJson(res, 200, { ok: true, ...adminCenterView(center, surface) })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { ok: false, error: 'marketing_campaign_failed', detail: msg.slice(0, 400) })
  }
}

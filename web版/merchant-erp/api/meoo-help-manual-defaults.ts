/**
 * GET /api/meoo-help-manual-defaults?edition=merchant|partner|fulfillment|all
 * 返回内置帮助手册种子（供运营台一键导入）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getAllHelpManualSeeds,
  getHelpManualSeedForEdition,
  HELP_MANUAL_SEED_VERSION,
} from '../src/lib/helpManualSeedContent.js'
import type { HelpManualEdition } from '../src/lib/helpManualTypes.js'

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  const raw = String(req.query.edition || 'all').trim().toLowerCase()
  if (raw === 'all') {
    sendJson(res, 200, { ok: true, version: HELP_MANUAL_SEED_VERSION, editions: getAllHelpManualSeeds() })
    return
  }
  const edition = (['merchant', 'partner', 'fulfillment'].includes(raw) ? raw : 'merchant') as HelpManualEdition
  sendJson(res, 200, { ok: true, version: HELP_MANUAL_SEED_VERSION, edition, ...getHelpManualSeedForEdition(edition) })
}

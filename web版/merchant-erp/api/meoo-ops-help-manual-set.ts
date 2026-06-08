/**
 * POST /api/meoo-ops-help-manual-set — 运营台保存某版本帮助手册
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { setHelpManualForEdition } from '../src/lib/helpManualRegistryCore.js'
import type {
  HelpManualEdition,
  RegistryHelpManualArticle,
  RegistryHelpManualCategory,
} from '../src/lib/helpManualTypes.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    let body: {
      edition?: HelpManualEdition
      categories?: RegistryHelpManualCategory[]
      articles?: RegistryHelpManualArticle[]
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const edition = body.edition
    if (!edition || !['merchant', 'partner', 'fulfillment'].includes(edition)) {
      sendJson(res, 400, { ok: false, error: 'invalid_edition' })
      return
    }

    const categories = Array.isArray(body.categories) ? body.categories : []
    const articles = Array.isArray(body.articles) ? body.articles : []

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    setHelpManualForEdition(data, edition, categories, articles)
    await io.save(data)
    sendJson(res, 200, { ok: true, categoryCount: categories.length, articleCount: articles.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'help_manual_set_failed', detail: msg.slice(0, 400) })
  }
}

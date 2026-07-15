/**
 * GET /api/meoo-platform-decor-public?slotKey=mp.home.popup&identity=pr
 * 各端公开读取当前生效的装修素材（单槽一条）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  listActiveDecorByPrefix,
  pickActiveDecorItem,
} from '../src/lib/platformDecorRegistryCore.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=30')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
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

    const slotKey = String(req.query.slotKey || '').trim()
    const prefix = String(req.query.prefix || '').trim()
    const identity = String(req.query.identity || '').trim() || undefined

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (prefix) {
      const items = listActiveDecorByPrefix(data, prefix, { identity })
      sendJson(res, 200, { ok: true, items, item: items[0] || null })
      return
    }
    if (!slotKey) {
      sendJson(res, 400, { ok: false, error: 'missing_slotKey' })
      return
    }
    const item = pickActiveDecorItem(data, slotKey, { identity })
    sendJson(res, 200, { ok: true, item })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'platform_decor_public_failed', detail: msg.slice(0, 400) })
  }
}

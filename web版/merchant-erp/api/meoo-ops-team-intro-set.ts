/**
 * POST /api/meoo-ops-team-intro-set — 运营台保存团队介绍（全版本共用）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { setTeamIntro } from '../src/lib/teamIntroRegistryCore.js'
import type { RegistryTeamIntro } from '../src/lib/teamIntroTypes.js'

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

    let body: { intro?: RegistryTeamIntro }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const intro = body.intro
    if (!intro || !Array.isArray(intro.paragraphs)) {
      sendJson(res, 400, { ok: false, error: 'invalid_intro' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    setTeamIntro(data, {
      subtitle: intro.subtitle,
      paragraphs: intro.paragraphs,
      updatedAt: intro.updatedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    })
    await io.save(data)
    sendJson(res, 200, { ok: true, paragraphCount: intro.paragraphs.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'team_intro_set_failed', detail: msg.slice(0, 400) })
  }
}

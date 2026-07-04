/**
 * POST /api/meoo-ops-mp-talent-profile-link-refresh
 * 每月 5 日（上海）批量解析达人平台链接，同步 mpTalentMembers + talentLibraryEntries
 * ECS 定时：bash scripts/ecs-cron-talent-profile-link-refresh.sh
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { maybeRefreshTalentProfileLinksAndSave } from '../src/lib/mpTalentProfileLinkMonthlyRefresh.js'

export const config = { maxDuration: 300 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      missing: missingParts,
      hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
    })
    return
  }

  let body: Record<string, unknown> = {}
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    body = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    body = {}
  }

  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const { saved, result } = await maybeRefreshTalentProfileLinksAndSave(io, {
      force: body.force === true || body.force === '1',
      dryRun: body.dryRun === true || body.dryRun === '1',
      maxParses: body.maxParses != null ? Number(body.maxParses) : undefined,
      delayMs: body.delayMs != null ? Number(body.delayMs) : undefined,
    })
    sendJson(res, 200, { saved, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, {
      ok: false,
      error: 'talent_profile_link_refresh_failed',
      detail: msg.slice(0, 800),
    })
  }
}

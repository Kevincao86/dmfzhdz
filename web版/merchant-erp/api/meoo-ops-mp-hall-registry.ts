/**
 * GET /api/meoo-ops-mp-hall-registry
 * - ECS auth-api：直连 Postgres 注册表（勿 proxy 自身，否则会 503 死循环）
 * - Vercel：node:https 代拉 ECS erp-api
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { proxyGetErpApi } from '../src/lib/mpErpApiProxy.js'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'
import { stripRegistryRecruitmentForAnonymous } from '../src/lib/registryTenantIsolation.js'

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

async function loadHallRegistryOnEcs(): Promise<Record<string, unknown>> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    throw new Error(
      `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
    )
  }
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await loadRegistrySnapshotForGet(io)
  return stripRegistryRecruitmentForAnonymous(data) as Record<string, unknown>
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    let payload: Record<string, unknown>
    if (isVercelServerless()) {
      payload = await proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
    } else {
      payload = await loadHallRegistryOnEcs()
    }

    if (!payload || !Array.isArray(payload.mpRecruitmentOrders)) {
      res.status(502).send(
        JSON.stringify({
          ok: false,
          error: 'meoo_ops_mp_hall_registry_failed',
          detail: 'erp_api_invalid_shape',
        }),
      )
      return
    }
    res.status(200).send(JSON.stringify(payload))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isProxy = isVercelServerless()
    res.status(isProxy ? 503 : 500).send(
      JSON.stringify({
        ok: false,
        error: 'meoo_ops_mp_hall_registry_failed',
        detail: isProxy ? `ecs_proxy: ${msg.slice(0, 400)}` : msg.slice(0, 800),
      }),
    )
  }
}

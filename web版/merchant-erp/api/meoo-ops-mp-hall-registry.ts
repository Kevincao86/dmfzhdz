/**
 * GET /api/meoo-ops-mp-hall-registry — 达人招募大厅专用（仅开放中的 mp 单 + 关联商家单，体积小）。
 * Vercel 上 Supabase 直连失败时，服务端代拉 ECS erp-api（供手机微信经 cs 子域访问）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { mpRecruitmentOrdersForTalentHall } from '../src/lib/registryTenantIsolation.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

const FETCH_TIMEOUT_MS = 22_000

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function buildHallPayload(data: RegistryFile) {
  const mpRecruitmentOrders = mpRecruitmentOrdersForTalentHall(data)
  const refIds = new Set(
    mpRecruitmentOrders.map((o) => String(o.sourceMerchantOrderId || '').trim()).filter(Boolean),
  )
  const recruitmentOrders = (data.recruitmentOrders ?? []).filter(
    (o) => o && refIds.has(String(o.id || '')),
  )
  const mpTalentInbox = (data.mpTalentInbox ?? []).slice(0, 400)
  const mpTalentMembers = data.mpTalentMembers ?? []
  return {
    ok: true,
    mpRecruitmentOrders,
    recruitmentOrders,
    recruitmentScheduleRows: [],
    recruitmentVideoSubmissions: [],
    mpTalentInbox,
    mpTalentMembers,
  }
}

async function loadHallViaSupabase(): Promise<Record<string, unknown>> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    throw new Error(
      `supabase_admin_not_configured:${missingParts.join(',')}:${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
    )
  }
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await loadRegistrySnapshotForGet(io)
  return buildHallPayload(data)
}

async function loadHallViaErpApiProxy(): Promise<Record<string, unknown>> {
  const bases = [
    process.env.MEOO_ERP_API_BASE,
    process.env.VITE_ERP_AUTH_API_BASE,
    process.env.ERP_AUTH_API_BASE,
    'https://mofangdianai.com/erp-api',
  ]
    .map((b) => String(b ?? '').trim().replace(/\/$/, ''))
    .filter(Boolean)
  const seen = new Set<string>()
  for (const base of bases) {
    const norm = base.replace(/\/api\/?$/, '')
    if (seen.has(norm)) continue
    seen.add(norm)
    const url = `${norm}/meoo-ops-mp-hall-registry`
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: fetchTimeoutSignal(FETCH_TIMEOUT_MS),
      })
      const text = await r.text()
      if (!r.ok) continue
      const parsed = JSON.parse(text || '{}') as Record<string, unknown>
      if (parsed && Array.isArray(parsed.mpRecruitmentOrders)) return parsed
    } catch {
      /* try next */
    }
  }
  throw new Error('erp_api_hall_proxy_failed')
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
    try {
      payload = await loadHallViaSupabase()
    } catch (supaErr) {
      try {
        payload = await loadHallViaErpApiProxy()
      } catch (proxyErr) {
        const supaMsg = supaErr instanceof Error ? supaErr.message : String(supaErr)
        const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
        res.status(503).send(
          JSON.stringify({
            ok: false,
            error: 'meoo_ops_mp_hall_registry_failed',
            detail: `${supaMsg.slice(0, 300)} | proxy: ${proxyMsg.slice(0, 200)}`,
          }),
        )
        return
      }
    }

    res.status(200).send(JSON.stringify(payload))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).send(
      JSON.stringify({
        ok: false,
        error: 'meoo_ops_mp_hall_registry_failed',
        detail: msg.slice(0, 800),
      }),
    )
  }
}

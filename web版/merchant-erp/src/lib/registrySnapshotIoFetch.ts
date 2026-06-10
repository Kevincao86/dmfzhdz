/**
 * 与运营台 `meooRegistrySnapshotIo` 同源：从 Supabase `ops_registry_snapshot` 读注册表。
 * 放在 `src/lib` 供 Vite 网关与 `/api/meoo-ops-sync-registry` 共用，确保 Vercel includeFiles 能打进函数包。
 */
import { erpAwareFetch } from './erpAwareHttpsFetch.js'
import { filterLegacyDemoRecruitmentOrders } from './recruitmentLegacyDemoOrders.js'
import { purgeExpiredGroupQrsInSnapshot, syncExpiredMpOrdersInSnapshot } from './mpGroupQrCleanup.js'
import type { RegistryFile } from './opsRegistryTypes.js'

const SNAPSHOT_FETCH_TIMEOUT_MS = 22_000

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function srHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export type RegistrySnapshotIo = {
  load(): Promise<RegistryFile>
  save(data: RegistryFile): Promise<void>
}

export function createRegistrySnapshotIoFetch(supabaseUrl: string, serviceRoleKey: string): RegistrySnapshotIo {
  const base = supabaseUrl.replace(/\/$/, '')
  const key = serviceRoleKey.trim()
  const snapSignal = () => fetchTimeoutSignal(SNAPSHOT_FETCH_TIMEOUT_MS)

  return {
    async load(): Promise<RegistryFile> {
      const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry`
      const r = await erpAwareFetch(url, { headers: srHeaders(key), signal: snapSignal() })
      const t = await r.text()
      if (!r.ok) {
        throw new Error(t.slice(0, 400))
      }
      let rows: { registry?: unknown }[]
      try {
        rows = JSON.parse(t || '[]') as { registry?: unknown }[]
      } catch {
        throw new Error(`registry_snapshot_parse_failed: ${t.slice(0, 200)}`)
      }
      const parsed = (rows[0]?.registry ?? null) as Partial<RegistryFile> | null
      const { normalizeRegistryFile } = await import('../../vite-plugins/opsRegistryGatewayCore.js')
      return normalizeRegistryFile(parsed)
    },

    async save(data: RegistryFile): Promise<void> {
      const { registryForPersistentFile } = await import('../../vite-plugins/opsRegistryGatewayCore.js')
      const persist = registryForPersistentFile(data)
      const nowIso = new Date().toISOString()
      const patchBody = JSON.stringify({
        registry: persist as unknown as Record<string, unknown>,
        updated_at: nowIso,
      })
      const signal = snapSignal()
      const patchUrl = `${base}/rest/v1/ops_registry_snapshot?id=eq.1`
      let r = await erpAwareFetch(patchUrl, {
        method: 'PATCH',
        headers: { ...srHeaders(key), Prefer: 'return=minimal' },
        body: patchBody,
        signal,
      })
      if (r.ok || r.status === 204) return
      const patchTxt = await r.text()
      if (r.status !== 404) {
        throw new Error(patchTxt.slice(0, 400))
      }
      const insertBody = JSON.stringify({
        id: 1,
        registry: persist as unknown as Record<string, unknown>,
        updated_at: nowIso,
      })
      r = await erpAwareFetch(`${base}/rest/v1/ops_registry_snapshot`, {
        method: 'POST',
        headers: {
          ...srHeaders(key),
          Prefer: 'return=representation',
        },
        body: insertBody,
        signal,
      })
      const txt = await r.text()
      if (!r.ok) {
        throw new Error(txt.slice(0, 400))
      }
    },
  }
}

export async function loadRegistrySnapshotForGet(io: RegistrySnapshotIo): Promise<RegistryFile> {
  const data = await io.load()
  let needSave = false
  const before = data.recruitmentOrders ?? []
  const cleaned = filterLegacyDemoRecruitmentOrders(before)
  if (cleaned.length !== before.length) {
    data.recruitmentOrders = cleaned
    needSave = true
  }
  const qr = purgeExpiredGroupQrsInSnapshot(data)
  if (qr.purgedOrderIds.length > 0 || qr.purgedInboxCount > 0) needSave = true
  const expired = syncExpiredMpOrdersInSnapshot(data)
  if (expired.syncedIds.length > 0) needSave = true
  if (needSave) {
    try {
      await io.save(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[loadRegistrySnapshotForGet] persist registry cleanup failed:', msg.slice(0, 500))
    }
  }
  return data
}

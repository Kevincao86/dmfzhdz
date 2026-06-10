/**
 * Supabase public.ops_registry_snapshot：Service Role + fetch PostgREST（无 supabase-js）。
 * normalize / persist 对 opsRegistryGatewayCore 使用动态 import，减轻 GET 注册表冷启动体积，降低 FUNCTION_INVOCATION_FAILED。
 */
import { syncExpiredMpOrdersInSnapshot } from '../src/meooRegistryShared/mpOrderEffectiveStatus.js'
import { filterLegacyDemoRecruitmentOrders } from '../src/meooRegistryShared/recruitmentLegacyDemoOrders.js'
import type { RegistryFile } from '../src/meooRegistryShared/opsRegistryTypes.js'
import type { RegistrySnapshotIo } from '../src/ops/registrySnapshotIo.js'

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

export function createRegistrySnapshotIoFetch(supabaseUrl: string, serviceRoleKey: string): RegistrySnapshotIo {
  const base = supabaseUrl.replace(/\/$/, '')
  const key = serviceRoleKey.trim()
  const snapSignal = () => fetchTimeoutSignal(SNAPSHOT_FETCH_TIMEOUT_MS)

  return {
    async load(): Promise<RegistryFile> {
      const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry`
      const r = await fetch(url, { headers: srHeaders(key), signal: snapSignal() })
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
      const { normalizeRegistryFile } = await import('../src/meooRegistryShared/opsRegistryGatewayCore.js')
      return normalizeRegistryFile(parsed)
    },

    async save(data: RegistryFile): Promise<void> {
      const { registryForPersistentFile } = await import('../src/meooRegistryShared/opsRegistryGatewayCore.js')
      const persist = registryForPersistentFile(data)
      const nowIso = new Date().toISOString()
      const body = JSON.stringify({
        id: 1,
        registry: persist as unknown as Record<string, unknown>,
        updated_at: nowIso,
      })
      const url = `${base}/rest/v1/ops_registry_snapshot`
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          ...srHeaders(key),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body,
        signal: snapSignal(),
      })
      const t = await r.text()
      if (!r.ok) {
        throw new Error(t.slice(0, 400))
      }
    },
  }
}

/** 运营台 /api/meoo-ops-sync-registry GET：与 dispatch GET 行为一致，避免拉入含 node:crypto 的整包 dispatch（降低 Vercel 运行时崩溃风险） */
export async function loadRegistrySnapshotForGet(io: RegistrySnapshotIo): Promise<RegistryFile> {
  const data = await io.load()
  let needSave = false
  const before = data.recruitmentOrders ?? []
  const cleaned = filterLegacyDemoRecruitmentOrders(before)
  if (cleaned.length !== before.length) {
    data.recruitmentOrders = cleaned
    needSave = true
  }
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

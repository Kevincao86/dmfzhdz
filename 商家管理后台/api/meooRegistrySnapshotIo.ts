/**
 * Supabase public.ops_registry_snapshot：Service Role + fetch PostgREST（无 supabase-js）。
 * normalize / persist 对 opsRegistryGatewayCore 使用动态 import，减轻 GET 注册表冷启动体积，降低 FUNCTION_INVOCATION_FAILED。
 */
import { filterLegacyDemoRecruitmentOrders } from '../src/meooRegistryShared/recruitmentLegacyDemoOrders'
import type { RegistryFile } from '../src/meooRegistryShared/opsRegistryTypes'
import type { RegistrySnapshotIo } from '../src/ops/registrySnapshotIo'

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

  return {
    async load(): Promise<RegistryFile> {
      const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry`
      const r = await fetch(url, { headers: srHeaders(key) })
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
  const before = data.recruitmentOrders ?? []
  const cleaned = filterLegacyDemoRecruitmentOrders(before)
  if (cleaned.length !== before.length) {
    data.recruitmentOrders = cleaned
    await io.save(data)
  }
  return data
}

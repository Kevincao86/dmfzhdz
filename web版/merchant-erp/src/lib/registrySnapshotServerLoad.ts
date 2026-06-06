/**
 * 服务端读取 ops_registry_snapshot：直连 Supabase，失败时经 ECS erp-api（与运营台浏览器同源）。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { RegistryFile, RegistryVideoAi } from './opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from './registryVideoAiNormalize.js'
import { readMerchantSupabaseAdminEnv } from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  createRegistrySnapshotIoFetch,
  loadRegistrySnapshotForGet,
} from './registrySnapshotIoFetch.js'

const FETCH_TIMEOUT_MS = 18_000
const REGISTRY_SNAPSHOT_CACHE_MS = 60_000

let registrySnapshotCache: { at: number; data: RegistryFile } | null = null

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function normalizeErpApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/api\.mofangdianai\.com/i.test(trimmed)) return 'https://mofangdianai.com/erp-api'
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (u.hostname === 'api.mofangdianai.com') return 'https://mofangdianai.com/erp-api'
    if (u.hostname === 'mofangdianai.com' && !u.pathname.startsWith('/erp-api')) {
      const tail = u.pathname === '/' ? '' : u.pathname
      u.pathname = `/erp-api${tail}`
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function erpApiBasesForServer(): string[] {
  const out: string[] = []
  const add = (raw: string | undefined) => {
    const b = normalizeErpApiBase(String(raw ?? ''))
    if (b && !out.includes(b)) out.push(b)
  }
  add(process.env.MEOO_ERP_API_BASE)
  add(process.env.VITE_ERP_AUTH_API_BASE)
  add(process.env.ERP_AUTH_API_BASE)
  add(process.env.VITE_MERCHANT_API_BASE_URL)
  add('https://mofangdianai.com/erp-api')
  return out
}

function loadLocalRegistryFile(viteRoot: string | undefined): RegistryFile | null {
  if (!viteRoot) return null
  const registryPath = path.join(path.resolve(viteRoot, '..', '..', '.meoo-dev-sync'), 'registry.json')
  try {
    if (!fs.existsSync(registryPath)) return null
    return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as RegistryFile
  } catch {
    return null
  }
}

async function loadRegistryViaSupabase(): Promise<RegistryFile | null> {
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (!supabaseUrl || !serviceRole) return null
  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    return await loadRegistrySnapshotForGet(io)
  } catch {
    return null
  }
}

async function loadRegistryViaErpApi(): Promise<RegistryFile | null> {
  for (const base of erpApiBasesForServer()) {
    const url = `${base}/meoo-ops-sync-registry`
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: fetchTimeoutSignal(FETCH_TIMEOUT_MS),
      })
      const text = await r.text()
      if (!r.ok) continue
      const parsed = JSON.parse(text || '{}') as RegistryFile & { ok?: boolean; error?: string }
      if (parsed && typeof parsed === 'object' && parsed.error && parsed.ok === false) continue
      if (parsed && typeof parsed === 'object' && ('videoAi' in parsed || 'vendorKeys' in parsed)) {
        return parsed as RegistryFile
      }
    } catch {
      /* try next base */
    }
  }
  return null
}

function iceVideoAiCredentialsComplete(v: RegistryVideoAi | undefined): boolean {
  const n = normalizeRegistryVideoAi(v)
  return !!(
    n.iceAppId?.trim() &&
    n.iceAccessKeyId?.trim() &&
    n.iceAccessKeySecret?.trim()
  )
}

/** Supabase 与 erp-api 快照合并：字段取非空；DB 缺 ICE 三要素时用 erp-api 补齐（Vercel 云 Supabase 常为空）。 */
function mergeRegistrySnapshotsPreferComplete(a: RegistryFile, b: RegistryFile): RegistryFile {
  const va = normalizeRegistryVideoAi(a.videoAi)
  const vb = normalizeRegistryVideoAi(b.videoAi)
  const videoAi: RegistryVideoAi =
    !iceVideoAiCredentialsComplete(va) && iceVideoAiCredentialsComplete(vb)
      ? { ...va, ...vb }
      : { ...vb, ...va }

  const vendorKeys: Partial<Record<string, string>> = { ...(b.vendorKeys ?? {}) }
  for (const [k, v] of Object.entries(a.vendorKeys ?? {})) {
    if (typeof v === 'string' && v.trim()) vendorKeys[k] = v.trim()
  }
  for (const [k, v] of Object.entries(b.vendorKeys ?? {})) {
    if (typeof v === 'string' && v.trim() && !vendorKeys[k]?.trim()) vendorKeys[k] = v.trim()
  }

  return {
    ...a,
    ...b,
    videoAi,
    vendorKeys,
    vendorKeysUpdatedAt: a.vendorKeysUpdatedAt ?? b.vendorKeysUpdatedAt,
    videoAiUpdatedAt: a.videoAiUpdatedAt ?? b.videoAiUpdatedAt,
  }
}

function shouldSkipRegistryErpApiLoop(): boolean {
  if (process.env.MEOO_AUTH_API_SERVER === '1') return true
  if (process.env.AUTH_API_PORT?.trim()) return true
  return false
}

/** Vercel / ECS 商品图、云剪等合并注册表时的统一加载顺序。 */
export async function loadRegistrySnapshotForServer(
  viteRoot?: string,
): Promise<RegistryFile | null> {
  const now = Date.now()
  if (registrySnapshotCache && now - registrySnapshotCache.at < REGISTRY_SNAPSHOT_CACHE_MS) {
    return registrySnapshotCache.data
  }

  const local = loadLocalRegistryFile(viteRoot)
  const skipErpLoop = shouldSkipRegistryErpApiLoop()
  const [fromDb, fromErp] = await Promise.all([
    loadRegistryViaSupabase(),
    skipErpLoop ? Promise.resolve(null) : loadRegistryViaErpApi(),
  ])
  let merged: RegistryFile | null = null
  if (fromDb && fromErp) merged = mergeRegistrySnapshotsPreferComplete(fromDb, fromErp)
  else if (fromDb) merged = fromDb
  else if (fromErp) merged = fromErp
  else merged = local

  if (merged) {
    registrySnapshotCache = { at: now, data: merged }
  }
  return merged
}

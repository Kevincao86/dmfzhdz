/**
 * 服务端读取 ops_registry_snapshot：直连 Supabase，失败时经 ECS erp-api（与运营台浏览器同源）。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { RegistryFile } from './opsRegistryTypes.js'
import { readMerchantSupabaseAdminEnv } from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  createRegistrySnapshotIoFetch,
  loadRegistrySnapshotForGet,
} from './registrySnapshotIoFetch.js'

const FETCH_TIMEOUT_MS = 18_000

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

/** Vercel / ECS 商品图、云剪等合并注册表时的统一加载顺序。 */
export async function loadRegistrySnapshotForServer(
  viteRoot?: string,
): Promise<RegistryFile | null> {
  const local = loadLocalRegistryFile(viteRoot)
  const fromDb = await loadRegistryViaSupabase()
  if (fromDb) return fromDb
  const fromErp = await loadRegistryViaErpApi()
  if (fromErp) return fromErp
  return local
}

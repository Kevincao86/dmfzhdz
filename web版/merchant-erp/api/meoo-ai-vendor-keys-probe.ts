/**
 * GET /api/meoo-ai-vendor-keys-probe — 直连上游探测 Kimi/MiniMax Key（不含完整密钥）。
 * Header: Authorization: Bearer <MEOO_SUPPORT_OPS_HTTP_TOKEN>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { probeDirectLlmKeys } from '../vite-plugins/aiGateway/directLlmKeyProbe.js'
import { mergeMerchantAiEnvWithRegistrySnapshot } from '../vite-plugins/merchantRegistryVendorEnv.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

function bearerToken(authHeader: string | undefined): string {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return ''
  return authHeader.slice('Bearer '.length).trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const expected = (process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN ?? '').trim()
  const token = bearerToken(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined)
  if (!expected || token !== expected) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return
  }

  const base = process.env as Record<string, string>
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), base)
  let registryKeys: unknown = null
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (supabaseUrl && serviceRole) {
    try {
      registryKeys = (await createRegistrySnapshotIoFetch(supabaseUrl, serviceRole).load()).vendorKeys
    } catch {
      /* ignore */
    }
  }

  const probes = await probeDirectLlmKeys(env, registryKeys)
  res.status(200).json({ ok: true, probes })
}

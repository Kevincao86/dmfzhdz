/**
 * GET /api/meoo-ai-vendor-keys-diag — 诊断 Kimi/MiniMax Key 来源（不含完整密钥）。
 * 供运营排查 401；需 Header: Authorization: Bearer <MEOO_SUPPORT_OPS_HTTP_TOKEN>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  describeMergedAiVendorKeys,
  mergeMerchantAiEnvWithRegistrySnapshot,
} from '../vite-plugins/merchantRegistryVendorEnv.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  minimaxChatBaseCandidates,
  moonshotChatBaseCandidates,
  resolveMinimaxApiKey,
  resolveMoonshotApiKey,
} from '../vite-plugins/aiGateway/providers/directLlmEnv.js'
import { looksLikeJwtCredential, vendorKeyFingerprint } from '../src/lib/aiVendorKeyValidate.js'

export const config = { maxDuration: 30 }

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
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()

  let registryLoaded = false
  let vendorKeysUpdatedAt: string | null = null
  let registryVendorKeys: unknown = null
  if (supabaseUrl && serviceRole) {
    try {
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      registryLoaded = true
      vendorKeysUpdatedAt = data.vendorKeysUpdatedAt ?? null
      registryVendorKeys = data.vendorKeys
    } catch {
      registryLoaded = false
    }
  }

  const kimiKey = resolveMoonshotApiKey(env)
  const minimaxKey = resolveMinimaxApiKey(env)

  res.status(200).json({
    ok: true,
    supabaseAdmin: missingParts.length === 0 ? 'configured' : 'missing',
    supabaseMissing: missingParts,
    supabaseHint: missingParts.length ? merchantSupabaseAdminEnvConfigureHint(missingParts) : undefined,
    registryLoaded,
    vendorKeysUpdatedAt,
    vendors: describeMergedAiVendorKeys(base, registryVendorKeys),
    effective: {
      kimi: {
        fingerprint: vendorKeyFingerprint(kimiKey),
        looksLikeJwt: kimiKey ? looksLikeJwtCredential(kimiKey) : false,
        bases: moonshotChatBaseCandidates(env),
      },
      minimax: {
        fingerprint: vendorKeyFingerprint(minimaxKey),
        looksLikeJwt: minimaxKey ? looksLikeJwtCredential(minimaxKey) : false,
        bases: minimaxChatBaseCandidates(env, minimaxKey),
      },
    },
    envStaleHint:
      '若 vendors[].source 为 env 而非 registry，说明运营台 Key 未写入 Supabase 或 ECS 缺 SUPABASE_SERVICE_ROLE_KEY；请删除 Vercel/ECS 中过期的 MINIMAX_API_KEY、MOONSHOT_API_KEY。',
  })
}

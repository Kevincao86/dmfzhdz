/**
 * 商户 ERP 调用 ops 注册表 API 时：JWT → tenant_members → tenant_id
 */
import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  readMerchantSupabaseAdminEnv,
  readMerchantSupabaseAnonKey,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from './nodeSupabaseClientOptions.js'

export type MerchantRegistryAuth =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; status: number; error: string; message?: string }

function bearerToken(authorization: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)/i.exec(String(authorization ?? '').trim())
  const jwt = m?.[1]?.trim()
  return jwt || null
}

export async function requireMerchantRegistryAuthFromHeaders(
  authorization: string | undefined,
): Promise<MerchantRegistryAuth> {
  const anonKey = readMerchantSupabaseAnonKey()
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0 || !anonKey) {
    return {
      ok: false,
      status: 503,
      error: 'supabase_not_configured',
      message: '未配置 Supabase URL / Service Role / Anon Key',
    }
  }

  const jwt = bearerToken(authorization)
  if (!jwt) {
    return {
      ok: false,
      status: 401,
      error: 'missing_authorization',
      message: '缺少 Authorization: Bearer <access_token>',
    }
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    ...nodeSupabaseClientOptions(),
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_session',
      message: '登录已失效，请重新登录',
    }
  }

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const { data: mems, error: memErr } = await admin
    .from('tenant_members')
    .select('tenant_id, created_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: true })

  if (memErr || !mems?.length) {
    return {
      ok: false,
      status: 403,
      error: 'not_a_tenant_member',
      message: '当前账号未关联商户租户',
    }
  }

  const tenantId = String(mems[0]?.tenant_id ?? '').trim()
  if (!tenantId) {
    return { ok: false, status: 403, error: 'no_tenant', message: '未找到租户' }
  }

  return { ok: true, tenantId, userId: userData.user.id }
}

export async function requireMerchantRegistryAuth(req: VercelRequest): Promise<MerchantRegistryAuth> {
  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : typeof req.headers.Authorization === 'string'
        ? req.headers.Authorization
        : undefined
  return requireMerchantRegistryAuthFromHeaders(authHeader)
}

/**
 * 推广员自助中心：从 Supabase JWT 或星选/小程序 mp 会话解析身份
 */
import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { verifyBearerJwt } from '../../vite-plugins/aiGateway/authSupabase.js'
import { createMpAuthRest, resolveSession } from './mpAccountAuth.js'
import { phoneFromAuthUser } from './tenantLocalState.js'
import { readMerchantSupabaseAdminEnv } from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from './nodeSupabaseClientOptions.js'

export type AffiliateAuthIdentity = {
  authUserId?: string
  phone?: string
}

function bearerToken(req: VercelRequest): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

function phoneFromLoginName(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : null
}

async function identityFromMpSession(token: string): Promise<AffiliateAuthIdentity | null> {
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (!supabaseUrl || !serviceRole) return null
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, token)
  if (!sess) return null
  return {
    authUserId: `mp:${sess.account.id}`,
    phone: phoneFromLoginName(sess.account.login_name) ?? undefined,
  }
}

async function identityFromSupabaseJwt(
  token: string,
  env: Record<string, string>,
): Promise<AffiliateAuthIdentity | null> {
  const user = await verifyBearerJwt(`Bearer ${token}`, env)
  if (!user?.id) return null

  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (!supabaseUrl || !serviceRole) return null

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const { data } = await admin.auth.admin.getUserById(user.id)
  const meta = (data?.user?.user_metadata ?? {}) as { phone?: string; login_name?: string }
  let phone = phoneFromAuthUser({
    phone: data?.user?.phone,
    user_metadata: meta,
  })
  if (!phone) phone = phoneFromLoginName(meta.login_name) ?? ''
  return {
    authUserId: user.id,
    phone: phone || undefined,
  }
}

export async function resolveAffiliateAuthIdentity(
  req: VercelRequest,
  env: Record<string, string>,
): Promise<AffiliateAuthIdentity | null> {
  const token = bearerToken(req)
  if (!token) return null

  const preferMp =
    typeof req.headers['x-mp-session'] === 'string' && req.headers['x-mp-session'].trim().length > 0

  if (preferMp) {
    const mpIdentity = await identityFromMpSession(token)
    if (mpIdentity) return mpIdentity
  }

  const sbIdentity = await identityFromSupabaseJwt(token, env)
  if (sbIdentity) return sbIdentity

  if (!preferMp) {
    const mpIdentity = await identityFromMpSession(token)
    if (mpIdentity) return mpIdentity
  }

  return null
}

/** @deprecated 使用 resolveAffiliateAuthIdentity */
export async function resolveAffiliatePortalPhone(
  req: VercelRequest,
  env: Record<string, string>,
): Promise<string | null> {
  const identity = await resolveAffiliateAuthIdentity(req, env)
  return identity?.phone ?? null
}

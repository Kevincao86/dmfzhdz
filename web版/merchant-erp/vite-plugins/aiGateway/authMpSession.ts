/**
 * 星选履约 / 小程序 mp 会话鉴权（dr 嵌入增值服务走此路径，非 Supabase 商户 JWT）
 */
import {
  createMpAuthRest,
  resolveSession,
  type MpAccountRow,
} from '../../src/lib/mpAccountAuth.js'
import { mpAuthGetRegistryProfile } from '../../src/lib/mpRegistryProfileGet.js'
import { readMerchantSupabaseAdminEnv } from '../merchantSupabaseAdminEnv.js'
import type { VerifiedUser } from './authSupabase.js'

const DEV_PREVIEW_TOKEN = 'dev-preview-local'

function truthyEnv(v: string | undefined): boolean {
  const s = String(v || '')
    .trim()
    .toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function parseAddonAllowlist(env: Record<string, string>): Set<string> {
  const raw = (env.MEOO_MP_ADDON_BETA_ALLOWLIST ?? env.VITE_MP_ADDON_BETA_ALLOWLIST ?? '').trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

function accountAddonBetaKeys(account: MpAccountRow): string[] {
  return [
    account.id,
    account.openid,
    account.login_name,
    account.lingqi_talent_id,
    account.lingqi_pr_id,
    account.registry_member_id,
    account.registry_pr_id,
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
}

async function mpAccountHasAddonAccess(
  account: MpAccountRow,
  supabaseUrl: string,
  serviceRole: string,
  env: Record<string, string>,
): Promise<boolean> {
  if (truthyEnv(env.MEOO_MP_ADDON_OPEN_ALL ?? env.VITE_MP_ADDON_OPEN_ALL)) return true
  if (truthyEnv(env.MP_AUTH_DEV_MODE) && process.env.NODE_ENV !== 'production') return true

  const allow = parseAddonAllowlist(env)
  if (allow.size && accountAddonBetaKeys(account).some((k) => allow.has(k))) return true

  try {
    const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, account)
    if (profile.prFeatureAccess?.any || profile.prFeatureAccess?.addons) return true
    const cells = profile.mpPermissionEffective
    if (cells) {
      const brief = cells.ai_brief_gen?.enabled === true
      const shortvideo = cells.addon_shortvideo?.enabled === true
      const cloud = cells.addon_cloud_edit?.enabled === true || cells.cloud_edit?.enabled === true
      const digital = cells.addon_digital_human?.enabled === true
      const visual = cells.addon_visual_studio?.enabled === true
      if (brief || shortvideo || cloud || digital || visual) return true
    }
  } catch {
    /* registry optional */
  }

  return false
}

export async function verifyMpSessionToken(
  token: string,
  env: Record<string, string>,
): Promise<VerifiedUser | null> {
  const t = token.trim()
  if (!t) return null

  if (t === DEV_PREVIEW_TOKEN) {
    if (truthyEnv(env.MP_AUTH_DEV_MODE) || process.env.NODE_ENV !== 'production') {
      return { id: 'mp:dev-preview', email: 'dev-preview' }
    }
    return null
  }

  const admin = readMerchantSupabaseAdminEnv()
  if (!admin.supabaseUrl || !admin.serviceRole) return null

  const rest = createMpAuthRest(admin.supabaseUrl, admin.serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess) return null

  const allowed = await mpAccountHasAddonAccess(sess.account, admin.supabaseUrl, admin.serviceRole, env)
  if (!allowed) return null

  return {
    id: `mp:${sess.account.id}`,
    email: sess.account.login_name ?? undefined,
  }
}

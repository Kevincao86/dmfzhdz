/**
 * 删除小程序招募单：PR 删除自己发布的单 → 仅需前端 confirm；运营台批量删 → 须超级管理员短信码。
 */
import type { VercelRequest } from '@vercel/node'
import {
  createMpAuthRest,
  reconcileAccountPrFromRegistry,
  resolveSession,
  type MpAccountRow,
} from '../../src/lib/mpAccountAuth.js'
import { mpAuthGetRegistryProfile } from '../../src/lib/mpRegistryProfileGet.js'
import type { RegistryFile } from '../../src/lib/opsRegistryTypes.js'
import {
  mpOrderOwnedByPrKeys,
  type PrOwnerKeys,
} from '../../src/lib/registryTenantIsolation.js'
import { requireOpsDeleteSmsGate, type OpsDeleteSmsGateResult } from './opsDeleteSmsGate.js'

export type MpRecruitmentOrderDeleteAuthResult =
  | ({ ok: true; via: 'pr_self' | 'ops_sms' })
  | { ok: false; status: number; error: string; message?: string }

export function readMpSessionToken(
  req: VercelRequest | undefined,
  body: Record<string, unknown>,
): string {
  if (req) {
    const mpHdr = req.headers['x-mp-session']
    if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
    const auth = req.headers.authorization
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  }
  return String(body.sessionToken || body.token || '').trim()
}

export function parseMpRecruitmentDeleteIds(body: Record<string, unknown>): string[] {
  return Array.isArray(body.ids)
    ? (body.ids as string[]).map((id) => String(id || '').trim()).filter(Boolean)
    : typeof body.id === 'string' && body.id.trim()
      ? [body.id.trim()]
      : []
}

async function buildPrOwnerKeys(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
): Promise<PrOwnerKeys> {
  const reconciled = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, account)
  const keys: PrOwnerKeys = {
    lingqiPrId: String(reconciled.lingqi_pr_id || '').trim(),
    registryPrId: String(reconciled.registry_pr_id || reconciled.registry_member_id || '').trim(),
  }
  try {
    const profile = await mpAuthGetRegistryProfile(supabaseUrl, serviceRole, reconciled)
    const prDraft =
      profile.prProfile && typeof profile.prProfile === 'object'
        ? (profile.prProfile as Record<string, unknown>)
        : null
    const phone = String(prDraft?.contactPhone || '').trim()
    if (phone) keys.prParticipantKey = `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
    const profileLq = String(prDraft?.lingqiPrId || '').trim()
    const profileReg = String(prDraft?.id || '').trim()
    if (profileLq) keys.lingqiPrId = profileLq
    if (profileReg) keys.registryPrId = profileReg
  } catch {
    /* profile optional */
  }
  return keys
}

export async function authorizeMpRecruitmentOrderDelete(input: {
  req?: VercelRequest
  body: Record<string, unknown>
  data: Pick<RegistryFile, 'mpRecruitmentOrders'>
  supabaseUrl: string
  serviceRole: string
  viteRoot?: string
}): Promise<MpRecruitmentOrderDeleteAuthResult> {
  const ids = [...new Set(parseMpRecruitmentDeleteIds(input.body))]
  if (!ids.length) {
    return { ok: false, status: 400, error: 'invalid_delete', message: '缺少招募单 id' }
  }

  const token = readMpSessionToken(input.req, input.body)
  if (token) {
    const rest = createMpAuthRest(input.supabaseUrl, input.serviceRole)
    const session = await resolveSession(rest, token)
    if (session?.account) {
      const idSet = new Set(ids)
      const targets = (input.data.mpRecruitmentOrders ?? []).filter((o) => o && idSet.has(o.id))
      if (targets.length !== ids.length) {
        return { ok: false, status: 404, error: 'not_found', message: '订单不存在或已删除' }
      }
      const keys = await buildPrOwnerKeys(input.supabaseUrl, input.serviceRole, session.account)
      const allOwned = targets.every((o) => mpOrderOwnedByPrKeys(o, keys))
      if (allOwned) return { ok: true, via: 'pr_self' }
      const hasPrIdentity = !!(
        keys.lingqiPrId ||
        keys.registryPrId ||
        keys.prParticipantKey ||
        session.account.lingqi_pr_id ||
        session.account.registry_pr_id
      )
      if (hasPrIdentity) {
        return {
          ok: false,
          status: 403,
          error: 'pr_delete_forbidden',
          message: '无权删除他人发布的招募单',
        }
      }
    }
  }

  const smsGate: OpsDeleteSmsGateResult = await requireOpsDeleteSmsGate(input.body, input.viteRoot)
  if (!smsGate.ok) {
    return { ok: false, status: smsGate.status, error: smsGate.error, message: smsGate.message }
  }
  return { ok: true, via: 'ops_sms' }
}

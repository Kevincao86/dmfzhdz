/**
 * POST handlers shared: video / script compliance + 积分扣减
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import { mpPointsSpendHttpStatus, mpSessionTokenFromRequest } from '../../src/lib/mpComplianceApiAuth.js'
import {
  assertMpAiPointsAffordableForSessionToken,
  spendMpAiPointsForSessionToken,
} from '../../src/lib/mpAiPointsSpendSession.js'
import type { MpPointsUsageKind } from '../../src/lib/mpPointsEconomics.js'
import type { MpLibraryRole } from '../../src/lib/mpMembershipCatalog.js'

export async function requireMpAiPointsAffordable(
  token: string,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; roleHint?: MpLibraryRole | null },
) {
  const env = readMerchantSupabaseAdminEnv()
  if (env.missingParts.length) {
    return { ok: false as const, status: 503, message: 'registry unavailable' }
  }
  const result = await assertMpAiPointsAffordableForSessionToken(
    env.supabaseUrl,
    env.serviceRole,
    token,
    kind,
    opts,
  )
  if (!result.ok) {
    return {
      ok: false as const,
      status: mpPointsSpendHttpStatus(result.error),
      message: result.message,
      error: result.error,
      required: result.required,
      balance: result.balance,
    }
  }
  return { ok: true as const }
}

export async function chargeMpAiPointsAfterSuccess(
  token: string,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; note?: string; roleHint?: MpLibraryRole | null },
) {
  const env = readMerchantSupabaseAdminEnv()
  if (env.missingParts.length) {
    return { ok: false as const, error: 'not_found' as const, message: 'registry unavailable' }
  }
  return spendMpAiPointsForSessionToken(env.supabaseUrl, env.serviceRole, token, {
    kind,
    durationSec: opts?.durationSec,
    note: opts?.note,
    roleHint: opts?.roleHint,
  })
}

export function readMpSessionToken(req: VercelRequest, body: Record<string, unknown>): string {
  return mpSessionTokenFromRequest(req, body)
}

export function sendPointsGateError(
  res: VercelResponse,
  sendJson: (res: VercelResponse, status: number, body: Record<string, unknown>) => void,
  gate: { status: number; message: string; error?: string; required?: number; balance?: number },
) {
  sendJson(res, gate.status, {
    ok: false,
    message: gate.message,
    error: gate.error,
    required: gate.required,
    balance: gate.balance,
  })
}

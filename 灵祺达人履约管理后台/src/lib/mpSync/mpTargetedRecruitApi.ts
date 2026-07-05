import { mpErpApiBase, buildMpErpApiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

const PATH = '/api/meoo-ops-mp-targeted-recruit'

function throwApiError(data: Record<string, unknown>) {
  const detail = String(data.detail || '').trim()
  const hint = String(data.hint || '').trim()
  const code = String(data.error || 'request_failed').trim()
  throw new Error([detail, hint, code].filter(Boolean).join(' — ') || '请求失败')
}

async function post(body: Record<string, unknown>) {
  const base = mpErpApiBase()
  if (!base) throw new Error('未配置 VITE_MP_API_BASE')
  const res = await fetch(buildMpErpApiUrl(base, PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) throwApiError(data)
  return data
}

export async function sendInvites(mpOrderId: string, talentMemberIds: string[], inviteResponseHours?: number) {
  return post({
    action: 'send_invites',
    mpOrderId,
    talentMemberIds,
    inviteResponseHours,
  })
}

export async function respond(
  mpOrderId: string,
  talentMemberId: string,
  response: 'accept' | 'reject',
  rejectReason?: string,
) {
  return post({
    action: 'respond',
    mpOrderId,
    talentMemberId,
    response,
    rejectReason,
  })
}

export async function cancelInvite(mpOrderId: string, inviteId: string) {
  return post({ action: 'cancel_invite', mpOrderId, inviteId })
}

export async function orderSummary(mpOrderId: string) {
  return post({ action: 'order_summary', mpOrderId })
}

export async function finalizeIfNeeded(mpOrderId: string) {
  return post({ action: 'finalize_if_needed', mpOrderId })
}

export async function confirmInvitePhase(mpOrderId: string) {
  return post({ action: 'confirm_invite_phase', mpOrderId })
}

export async function listForTalent(talentMemberId: string) {
  return post({ action: 'list_for_talent', talentMemberId })
}

import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistrySnapshot,
} from './opsRegistryTypes.js'

export type MpRecruitmentPatchBody = {
  id?: string
  status?: RegistryMpRecruitmentOrder['status']
  applicants?: RegistryMpRecruitmentApplicant[]
  order?: RegistryMpRecruitmentOrder
  selectedApplicantIds?: string[]
}

export function patchMpRecruitmentOrderInSnapshot(
  data: RegistrySnapshot,
  body: MpRecruitmentPatchBody,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = (body.id ?? '').trim()
  const order = body.order
  const status = body.status
  const applicants = body.applicants
  const selectedApplicantIds = body.selectedApplicantIds
  if (!id) return { ok: false, error: 'invalid_patch', status: 400 }
  if (!order && !status && !applicants && !selectedApplicantIds) {
    return { ok: false, error: 'invalid_patch', status: 400 }
  }
  if (
    status &&
    status !== 'open' &&
    status !== 'collecting' &&
    status !== 'pending_settlement' &&
    status !== 'closed' &&
    status !== 'done'
  ) {
    return { ok: false, error: 'invalid_patch', status: 400 }
  }
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return { ok: false, error: 'not_found', status: 404 }
  }
  const cur = data.mpRecruitmentOrders[idx]!
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  if (order && order.id === id) {
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...order,
      id,
      sourceMerchantOrderId: cur.sourceMerchantOrderId,
      createdAt: cur.createdAt,
      applicants: order.applicants ?? cur.applicants ?? [],
      updatedAt: now,
    }
  } else {
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...(status ? { status } : {}),
      ...(applicants ? { applicants } : {}),
      ...(selectedApplicantIds
        ? {
            selectedApplicantIds: selectedApplicantIds
              .map((x) => String(x || '').trim())
              .filter(Boolean),
          }
        : {}),
      updatedAt: now,
    }
  }
  return { ok: true }
}

export function deleteMpRecruitmentOrderFromSnapshot(
  data: RegistrySnapshot,
  id: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const mpId = id.trim()
  if (!mpId) return { ok: false, error: 'invalid_delete', status: 400 }
  const list = data.mpRecruitmentOrders ?? []
  const next = list.filter((o) => o && o.id !== mpId)
  if (next.length === list.length) {
    return { ok: false, error: 'not_found', status: 404 }
  }
  data.mpRecruitmentOrders = next
  return { ok: true }
}

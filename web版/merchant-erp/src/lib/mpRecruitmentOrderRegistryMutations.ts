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
  groupQrImage?: string
}

function stampApplicantsSelected(
  applicants: RegistryMpRecruitmentApplicant[] | undefined,
  selectedIds: string[],
  publisherIdentity?: string,
): RegistryMpRecruitmentApplicant[] {
  const set = new Set(selectedIds.map((id) => String(id)))
  const isMerchant = publisherIdentity === 'merchant'
  return (applicants ?? []).map((a) => {
    const on = set.has(String(a.id))
    return {
      ...a,
      prSelected: on,
      merchantSelected: isMerchant ? on : a.merchantSelected,
    }
  })
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
  const hasGroupQr = body.groupQrImage !== undefined
  const MAX_GROUP_QR_LEN = 120_000
  if (!id) return { ok: false, error: 'invalid_patch', status: 400 }
  if (hasGroupQr && String(body.groupQrImage || '').length > MAX_GROUP_QR_LEN) {
    return { ok: false, error: 'group_qr_too_large', status: 400 }
  }
  if (!order && !status && !applicants && !selectedApplicantIds && !hasGroupQr) {
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
    const nextSelectedIds = selectedApplicantIds
      ? selectedApplicantIds.map((x) => String(x || '').trim()).filter(Boolean)
      : null
  if (hasGroupQr) {
    const qr = String(body.groupQrImage || '').trim()
    const snap = data as RegistrySnapshot & { mpGroupQrByOrderId?: Record<string, string> }
    if (qr) {
      if (!snap.mpGroupQrByOrderId || typeof snap.mpGroupQrByOrderId !== 'object') {
        snap.mpGroupQrByOrderId = {}
      }
      snap.mpGroupQrByOrderId[id] = qr
    } else if (snap.mpGroupQrByOrderId && typeof snap.mpGroupQrByOrderId === 'object') {
      delete snap.mpGroupQrByOrderId[id]
    }
    const metaRaw = cur.mpPublishMeta && typeof cur.mpPublishMeta === 'object' ? cur.mpPublishMeta : {}
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...(status ? { status } : {}),
      ...(applicants ? { applicants } : {}),
      ...(nextSelectedIds
        ? {
            selectedApplicantIds: nextSelectedIds,
            applicants: stampApplicantsSelected(cur.applicants, nextSelectedIds, cur.publisherIdentity),
          }
        : {}),
      groupQrImage: undefined,
      mpPublishMeta: Object.keys(meta).length ? meta : undefined,
      updatedAt: now,
    }
  } else {
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...(status ? { status } : {}),
      ...(applicants ? { applicants } : {}),
      ...(nextSelectedIds
        ? {
            selectedApplicantIds: nextSelectedIds,
            applicants: stampApplicantsSelected(cur.applicants, nextSelectedIds, cur.publisherIdentity),
          }
        : {}),
      updatedAt: now,
    }
  }
  }
  return { ok: true }
}

export function deleteMpRecruitmentOrdersFromSnapshot(
  data: RegistrySnapshot,
  rawIds: string[],
): { ok: true; deletedIds: string[] } | { ok: false; error: string; status: number } {
  const ids = [...new Set(rawIds.map((x) => String(x || '').trim()).filter(Boolean))]
  if (!ids.length) return { ok: false, error: 'invalid_delete', status: 400 }
  const idSet = new Set(ids)
  const list = data.mpRecruitmentOrders ?? []
  const deletedIds = list.filter((o) => o && idSet.has(o.id)).map((o) => o.id)
  if (!deletedIds.length) return { ok: false, error: 'not_found', status: 404 }

  data.mpRecruitmentOrders = list.filter((o) => o && !idSet.has(o.id))

  for (const order of data.recruitmentOrders ?? []) {
    if (!order) continue
    const linked = String(order.linkedMpOrderId || '').trim()
    if (linked && idSet.has(linked)) {
      order.linkedMpOrderId = undefined
    }
  }

  data.mpTalentInbox = (data.mpTalentInbox ?? []).filter((item) => {
    const mpId = String(item?.mpOrderId || '').trim()
    return !mpId || !idSet.has(mpId)
  })

  return { ok: true, deletedIds }
}

export function deleteMpRecruitmentOrderFromSnapshot(
  data: RegistrySnapshot,
  id: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const result = deleteMpRecruitmentOrdersFromSnapshot(data, [id])
  if (!result.ok) return result
  return { ok: true }
}

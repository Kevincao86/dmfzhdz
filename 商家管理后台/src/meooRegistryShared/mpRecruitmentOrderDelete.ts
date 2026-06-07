import type { RegistryFile } from './opsRegistryTypes.js'

export function deleteMpRecruitmentOrdersFromSnapshot(
  data: RegistryFile,
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
  data: RegistryFile,
  id: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const result = deleteMpRecruitmentOrdersFromSnapshot(data, [id])
  if (!result.ok) return result
  return { ok: true }
}

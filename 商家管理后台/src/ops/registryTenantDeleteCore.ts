import type { RegistrySnapshotIo } from './registrySnapshotIo.js'

export type RegistryTenantDeleteInput = {
  id: string
  merchantName?: string
  loginName?: string
}

export async function deleteRegistryTenantFromSnapshot(
  io: RegistrySnapshotIo,
  input: RegistryTenantDeleteInput,
): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const id = String(input.id || '').trim()
  if (!id) return { ok: false, error: 'missing_id' }
  const merchantName = String(input.merchantName || '').trim()
  const loginName = String(input.loginName || '').trim().toLowerCase()
  const data = await io.load()
  const before = data.tenants.length
  data.tenants = data.tenants.filter(
    (t) =>
      t.id !== id &&
      !(loginName && (t.loginName ?? '').trim().toLowerCase() === loginName),
  )
  if (merchantName) {
    data.recruitmentOrders = (data.recruitmentOrders ?? []).filter(
      (o) => (o.customerName ?? '').trim() !== merchantName,
    )
  }
  await io.save(data)
  return { ok: true, removed: before - data.tenants.length }
}

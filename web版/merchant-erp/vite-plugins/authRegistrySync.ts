import type { RegistryTenant } from '../src/lib/opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'

/** 注册成功后写入运营注册表快照，便于客户管理合并展示 */
export async function syncErpTenantToOpsRegistry(input: {
  tenantId: string
  loginName: string
  merchantName: string
  phone?: string
  trialDays?: number
}): Promise<void> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) return

  const now = new Date().toISOString()
  const tenant: RegistryTenant = {
    id: input.tenantId,
    source: 'erp',
    loginName: input.loginName,
    merchantName: input.merchantName,
    industry: '云服务',
    registeredAt: now,
    accountStatus: 'normal',
    trialDays: Math.max(0, Number(input.trialDays) || 14),
    officialDays: 0,
    updatedAt: now,
  }

  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const nextTenants = data.tenants.filter((t) => t.id !== tenant.id)
    nextTenants.push(tenant)
    data.tenants = nextTenants
    await io.save(data)
  } catch (e) {
    console.warn('[meoo-registry-sync] failed', e instanceof Error ? e.message : e)
  }
}

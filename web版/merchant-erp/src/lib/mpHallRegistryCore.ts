import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from './registrySnapshotIoFetch.js'
import { stripRegistryRecruitmentForAnonymous } from './registryTenantIsolation.js'

export async function loadMpHallRegistryPayload(): Promise<Record<string, unknown>> {
  const { missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length === 0) {
    try {
      const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await loadRegistrySnapshotForGet(io)
      return stripRegistryRecruitmentForAnonymous(data) as Record<string, unknown>
    } catch (directErr) {
      if (!isVercelServerless()) throw directErr
    }
  } else if (!isVercelServerless()) {
    throw new Error(
      `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
    )
  }

  if (isVercelServerless()) {
    return proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
  }

  throw new Error(
    `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
  )
}

import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import { normalizeRegistryFile } from '../../vite-plugins/opsRegistryGatewayCore.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { filterLegacyDemoRecruitmentOrders } from './recruitmentLegacyDemoOrders.js'
import { stripRegistryRecruitmentForAnonymous } from './registryTenantIsolation.js'

export async function loadMpHallRegistryPayload(): Promise<Record<string, unknown>> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const attempts: string[] = []

  if (missingParts.length === 0) {
    try {
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const loaded = await io.load()
      const data = normalizeRegistryFile(loaded)
      const before = data.recruitmentOrders ?? []
      const cleaned = filterLegacyDemoRecruitmentOrders(before)
      if (cleaned.length !== before.length) {
        data.recruitmentOrders = cleaned
      }
      return stripRegistryRecruitmentForAnonymous(data) as Record<string, unknown>
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`registry_direct:${msg.slice(0, 240)}`)
      if (!isVercelServerless()) throw e
    }
  } else if (isVercelServerless()) {
    attempts.push(`registry_env_missing:${missingParts.join(',')}`)
  } else {
    throw new Error(
      `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
    )
  }

  if (isVercelServerless()) {
    try {
      return await proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`ecs_proxy:${msg.slice(0, 240)}`)
      const hint = missingParts.length
        ? '请在 Vercel Production 配置 SUPABASE_URL=https://mofangdianai.com 与 SUPABASE_SERVICE_ROLE_KEY（与 ECS ~/stack 一致）后 Redeploy。'
        : '直连注册表与 ECS 代理均失败；小程序可优先用 https://mofangdianai.com/erp-api。'
      throw new Error(`${attempts.join(' | ')} — ${hint}`)
    }
  }

  throw new Error(
    `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
  )
}

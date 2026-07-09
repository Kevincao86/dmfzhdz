import type { SupabaseClient } from '@supabase/supabase-js'
import { isPartnerEdition, platformBindingRole } from './appEdition'
import { fetchPartnerTenantProfile } from './partnerTenantProfile'
import type { MerchantBindingProvider } from './merchantPlatformBindings'

/** 服务商版：林客 SP 仅总代维护；子代检查总代租户 */
export async function hasServiceProviderPlatformBinding(
  supabase: SupabaseClient,
  provider: MerchantBindingProvider,
): Promise<boolean> {
  if (!isPartnerEdition()) return true
  const profile = await fetchPartnerTenantProfile(supabase)
  const checkTenantId =
    profile.isAgent && profile.parentTenantId ? profile.parentTenantId : profile.tenantId
  if (!checkTenantId) return false
  const { data, error } = await supabase
    .from('tenant_merchant_bindings')
    .select('id')
    .eq('tenant_id', checkTenantId)
    .eq('provider', provider)
    .eq('binding_role', platformBindingRole())
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

export function serviceProviderGateHint(
  provider: MerchantBindingProvider,
  opts?: { isAgent?: boolean },
): string {
  const plat = provider === 'kuaishou' ? '快手团购' : '抖音林客'
  if (opts?.isAgent) {
    return `总代尚未完成${plat}服务商应用绑定，请联系总代在「系统 → 服务商平台」配置后再添加客户商家。`
  }
  return `请先在「系统 → 服务商平台」完成${plat}服务商应用绑定，再添加客户商家账号。`
}

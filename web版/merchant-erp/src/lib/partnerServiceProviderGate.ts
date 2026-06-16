import type { SupabaseClient } from '@supabase/supabase-js'
import { isPartnerEdition } from './appEdition'
import { listMerchantBindings, type MerchantBindingProvider } from './merchantPlatformBindings'

/** 服务商版：是否已在「服务商平台」绑定该平台身份 */
export async function hasServiceProviderPlatformBinding(
  supabase: SupabaseClient,
  provider: MerchantBindingProvider,
): Promise<boolean> {
  if (!isPartnerEdition()) return true
  const rows = await listMerchantBindings(supabase, provider)
  return rows.length > 0
}

export function serviceProviderGateHint(provider: MerchantBindingProvider): string {
  const plat = provider === 'kuaishou' ? '快手团购' : '抖音林客'
  return `请先在「系统 → 服务商平台」完成${plat}服务商应用绑定，再添加客户商家账号。`
}

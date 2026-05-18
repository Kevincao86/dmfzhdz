import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrimaryTenantId } from './tenantBilling'

export async function resolveRecruitmentOrderTenantMeta(
  supabase: SupabaseClient | null | undefined,
): Promise<{ tenantId?: string; ownerUserId?: string }> {
  if (!supabase) return {}
  const tenantId = await fetchPrimaryTenantId(supabase)
  const { data } = await supabase.auth.getUser()
  return {
    tenantId: tenantId ?? undefined,
    ownerUserId: data.user?.id,
  }
}

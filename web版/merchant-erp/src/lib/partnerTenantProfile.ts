/**
 * 服务商租户档案：总代 / 子代（partner_agent）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrimaryTenantId } from './tenantBilling'

export type PartnerTenantEdition = 'partner' | 'partner_agent'

export type PartnerTenantProfile = {
  tenantId: string
  name: string
  edition: PartnerTenantEdition
  parentTenantId: string | null
  /** 当前为子代公司 */
  isAgent: boolean
  /** 当前为总代（无 parent） */
  isParent: boolean
}

const EMPTY: PartnerTenantProfile = {
  tenantId: '',
  name: '',
  edition: 'partner',
  parentTenantId: null,
  isAgent: false,
  isParent: true,
}

export async function fetchPartnerTenantProfile(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<PartnerTenantProfile> {
  const tid = tenantId ?? (await fetchPrimaryTenantId(supabase))
  if (!tid) return { ...EMPTY }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, edition, parent_tenant_id')
    .eq('id', tid)
    .maybeSingle()

  if (error || !data) {
    return { ...EMPTY, tenantId: tid, isParent: true, edition: 'partner' }
  }

  const editionRaw = String(data.edition || 'partner')
  const edition: PartnerTenantEdition =
    editionRaw === 'partner_agent' ? 'partner_agent' : 'partner'
  const parentTenantId =
    typeof data.parent_tenant_id === 'string' && data.parent_tenant_id.trim()
      ? data.parent_tenant_id.trim()
      : null

  return {
    tenantId: tid,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    edition,
    parentTenantId,
    isAgent: edition === 'partner_agent' || Boolean(parentTenantId),
    isParent: edition === 'partner' && !parentTenantId,
  }
}

/** 客户数据归属的总代 tenant_id */
export function partnerClientsDataTenantId(profile: PartnerTenantProfile): string {
  return profile.parentTenantId ?? profile.tenantId
}

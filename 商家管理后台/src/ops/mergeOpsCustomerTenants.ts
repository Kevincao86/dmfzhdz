import { fetchRegistry, type RegistryTenant } from './opsRegistryApi'
import {
  fetchSupabaseTenantsForOps,
  supabaseRowsToRegistryTenants,
} from './supabaseTenantsApi'

function loginKey(login: string | undefined): string {
  return String(login ?? '').trim().toLowerCase()
}

export function mergeRegistryAndSupabaseTenants(
  regTenants: RegistryTenant[],
  sbRows: ReturnType<typeof supabaseRowsToRegistryTenants>,
): RegistryTenant[] {
  const fromSb = sbRows
  const loginSet = new Set(fromSb.map((x) => loginKey(x.loginName)))
  return [...fromSb, ...regTenants.filter((t) => !loginSet.has(loginKey(t.loginName)))]
}

/** 并行拉取注册表与 ECS 租户表并合并（租户表优先展示，避免等 2MB 注册表） */
export async function loadMergedOpsCustomerTenants(): Promise<{
  tenants: RegistryTenant[]
  registryOk: boolean
  supabaseOk: boolean
  supabaseError?: string
  supabaseHint?: string
  supabaseDetail?: string
}> {
  const [regResult, sb] = await Promise.all([
    fetchRegistry()
      .then((reg) => ({ ok: true as const, tenants: reg.tenants }))
      .catch(() => ({ ok: false as const, tenants: [] as RegistryTenant[] })),
    fetchSupabaseTenantsForOps(),
  ])

  let merged: RegistryTenant[] = [...regResult.tenants]
  let supabaseOk = false
  let supabaseError: string | undefined
  let supabaseHint: string | undefined
  let supabaseDetail: string | undefined

  if (sb.ok) {
    supabaseOk = true
    merged = mergeRegistryAndSupabaseTenants(regResult.tenants, supabaseRowsToRegistryTenants(sb.rows))
  } else if (sb.error !== 'not_configured') {
    supabaseError = sb.error
    supabaseHint = sb.hint
    supabaseDetail = sb.detail
  }

  return {
    tenants: merged,
    registryOk: regResult.ok,
    supabaseOk,
    supabaseError,
    supabaseHint,
    supabaseDetail,
  }
}

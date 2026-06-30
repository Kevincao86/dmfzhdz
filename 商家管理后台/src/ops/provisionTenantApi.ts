import type { ManualTenantPayload } from './opsRegistryApi'
import { requireOpsModuleEdit } from './opsStaffAuth'

/** 与 ERP、Edge Function 约定的占位邮箱域 */
export function defaultTenantEmailDomain(): string {
  return import.meta.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ?? 'users.meoo.test'
}

export function loginNameToTenantEmail(loginName: string, domain = defaultTenantEmailDomain()): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
}

export async function postProvisionTenant(body: ManualTenantPayload): Promise<{
  ok: boolean
  error?: string
  tenantId?: string
  email?: string
  hint?: string
  detail?: string
  missingEnv?: string[]
}> {
  const denied = requireOpsModuleEdit('customers')
  if (denied) return { ok: false, error: denied }
  const res = await fetch('/api/provision-tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  let j: {
    ok?: boolean
    error?: string
    tenantId?: string
    email?: string
    detail?: string
    hint?: string
    missingEnv?: string[]
  } = {}
  try {
    j = JSON.parse(raw || '{}') as typeof j
  } catch {
    j = {}
  }
  if (!res.ok) {
    const fallback = raw.trim().slice(0, 500)
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      detail: j.detail ?? (fallback || undefined),
      hint: j.hint,
      missingEnv: Array.isArray(j.missingEnv) ? j.missingEnv : undefined,
    }
  }
  return {
    ok: j.ok !== false,
    tenantId: j.tenantId,
    email: j.email,
    detail: j.detail,
    hint: j.hint,
  }
}

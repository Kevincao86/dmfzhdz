/** 须与运营端开通账号、Edge Function TENANT_EMAIL_DOMAIN 完全一致 */
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

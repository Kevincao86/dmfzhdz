/**
 * 使用 Supabase Auth HTTP API 校验 access_token（不引入 service_role 校验逻辑，避免误用）。
 */
export type VerifiedUser = { id: string; email?: string }

export async function verifyBearerJwt(
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<VerifiedUser | null> {
  const allowUnauth = (env.MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED ?? '').trim() === '1'
  const jwt =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : ''
  if (!jwt) {
    if (allowUnauth) return { id: 'dev-unauthenticated', email: 'dev' }
    return null
  }

  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const anon = (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!supabaseUrl || !anon) {
    if (allowUnauth) return { id: 'dev-unauthenticated', email: 'dev' }
    return null
  }

  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anon,
    },
  })
  if (!r.ok) return null
  let j: { id?: string; email?: string }
  try {
    j = (await r.json()) as { id?: string; email?: string }
  } catch {
    return null
  }
  const id = typeof j.id === 'string' && j.id.trim() ? j.id.trim() : ''
  if (!id) return null
  return { id, email: typeof j.email === 'string' ? j.email : undefined }
}

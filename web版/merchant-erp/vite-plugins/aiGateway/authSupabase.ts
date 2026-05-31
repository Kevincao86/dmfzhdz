/**
 * 校验 Supabase / GoTrue access_token。
 * 自建 ECS：优先用 SUPABASE_JWT_SECRET 本地验签（避免 Vercel → ECS /auth/v1/user 出站失败）。
 * Supabase Cloud：回退 HTTP GET /auth/v1/user。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type VerifiedUser = { id: string; email?: string }

function readJwtSecret(env: Record<string, string>): string {
  return (
    env.SUPABASE_JWT_SECRET ??
    env.GOTRUE_JWT_SECRET ??
    env.JWT_SECRET ??
    ''
  ).trim()
}

function base64UrlDecode(input: string): Buffer {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

function verifyHs256JwtLocally(
  token: string,
  secret: string,
): { id: string; email?: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  if (!headerB64 || !payloadB64 || !sigB64) return null

  let header: { alg?: string }
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string }
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null

  const data = `${headerB64}.${payloadB64}`
  const expected = createHmac('sha256', secret).update(data).digest()
  let actual: Buffer
  try {
    actual = base64UrlDecode(sigB64)
  } catch {
    return null
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  let payload: { sub?: string; email?: string; role?: string; exp?: number }
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as typeof payload
  } catch {
    return null
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() - 30_000) return null
  const role = typeof payload.role === 'string' ? payload.role : ''
  if (role && role !== 'authenticated') return null

  const id = typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : ''
  if (!id) return null
  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}

async function verifyBearerJwtViaAuthApi(
  jwt: string,
  supabaseUrl: string,
  anon: string,
): Promise<VerifiedUser | null> {
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

  const jwtSecret = readJwtSecret(env)
  if (jwtSecret) {
    const local = verifyHs256JwtLocally(jwt, jwtSecret)
    if (local) return local
  }

  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const anon = (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!supabaseUrl || !anon) {
    if (allowUnauth) return { id: 'dev-unauthenticated', email: 'dev' }
    if (jwtSecret) {
      throw new Error('invalid_jwt_or_expired')
    }
    throw new Error('supabase_anon_not_configured')
  }

  try {
    return await verifyBearerJwtViaAuthApi(jwt, supabaseUrl, anon)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (jwtSecret) {
      const local = verifyHs256JwtLocally(jwt, jwtSecret)
      if (local) return local
    }
    throw new Error(msg || 'fetch failed')
  }
}

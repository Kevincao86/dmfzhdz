/**
 * 校验 Supabase / GoTrue access_token。
 * 自建 ECS：优先用 SUPABASE_JWT_SECRET 本地验签（避免 Vercel → ECS /auth/v1/user 出站失败）。
 * Supabase Cloud：回退 HTTP GET /auth/v1/user。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { verifyMpSessionToken } from './authMpSession.js'

export type VerifiedUser = { id: string; email?: string }

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3
}

function readJwtSecrets(env: Record<string, string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [env.SUPABASE_JWT_SECRET, env.GOTRUE_JWT_SECRET, env.JWT_SECRET]) {
    const s = String(raw ?? '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function readJwtSecret(env: Record<string, string>): string {
  return readJwtSecrets(env)[0] ?? ''
}

function headerText(
  headers: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!headers) return ''
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== lower) continue
    if (typeof v === 'string') return v
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  }
  return ''
}

/** 小程序偶发不带 Authorization，同时认自定义头与 body.access_token */
export function readRequestBearer(
  headers: Record<string, unknown> | undefined,
  body?: Record<string, unknown> | null,
): string {
  const raw =
    headerText(headers, 'authorization') ||
    headerText(headers, 'x-meoo-access-token') ||
    headerText(headers, 'x-access-token')
  let token = raw.replace(/^Bearer\s+/i, '').trim()
  if (!token && body && typeof body === 'object') {
    const b = body
    token = String(b.access_token ?? b.accessToken ?? '').trim()
  }
  return token
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

  let payload: { sub?: string; user_id?: string; email?: string; role?: string; exp?: number }
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as typeof payload
  } catch {
    return null
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() - 30_000) return null
  const role = typeof payload.role === 'string' ? payload.role.trim() : ''
  if (role === 'anon' || role === 'service_role') return null

  const idRaw = payload.sub ?? payload.user_id
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : ''
  if (!id) return null
  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}

function authFetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
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
    signal: authFetchTimeoutSignal(8_000),
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

export async function verifyAccessToken(
  token: string | undefined,
  env: Record<string, string>,
): Promise<VerifiedUser | null> {
  const t = String(token || '').trim()
  if (!t) return verifyBearerJwt(undefined, env)
  if (t.toLowerCase().startsWith('bearer ')) return verifyBearerJwt(t, env)
  return verifyBearerJwt(`Bearer ${t}`, env)
}

export async function verifyBearerJwt(
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<VerifiedUser | null> {
  const allowUnauth = (env.MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED ?? '').trim() === '1'
  const raw = typeof authHeader === 'string' ? authHeader.trim() : ''
  const jwt = raw.toLowerCase().startsWith('bearer ')
    ? raw.slice('Bearer '.length).trim()
    : raw
  if (!jwt) {
    if (allowUnauth) return { id: 'dev-unauthenticated', email: 'dev' }
    return null
  }

  if (!looksLikeJwt(jwt)) {
    const mpUser = await verifyMpSessionToken(jwt, env)
    if (mpUser) return mpUser
    return null
  }

  for (const jwtSecret of readJwtSecrets(env)) {
    const local = verifyHs256JwtLocally(jwt, jwtSecret)
    if (local) return local
  }

  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const anon = (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!supabaseUrl || !anon) {
    const mpUser = await verifyMpSessionToken(jwt, env)
    if (mpUser) return mpUser
    if (allowUnauth) return { id: 'dev-unauthenticated', email: 'dev' }
    if (readJwtSecrets(env).length) {
      throw new Error('invalid_jwt_or_expired')
    }
    throw new Error('supabase_anon_not_configured')
  }

  try {
    const user = await verifyBearerJwtViaAuthApi(jwt, supabaseUrl, anon)
    if (user) return user
    return (await verifyMpSessionToken(jwt, env)) ?? null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    for (const secret of readJwtSecrets(env)) {
      const local = verifyHs256JwtLocally(jwt, secret)
      if (local) return local
    }
    const mpUser = await verifyMpSessionToken(jwt, env)
    if (mpUser) return mpUser
    throw new Error(msg || 'fetch failed')
  }
}

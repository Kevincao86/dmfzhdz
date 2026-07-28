export type SupportChannel = 'erp' | 'mp'

export type ChatLine = {
  type: 'chat'
  sessionId: string
  from: 'user' | 'bot' | 'agent' | 'system' | 'ops'
  text: string
  ts: number
  id: string
  customerId?: string
  enterpriseName?: string
}

const TOKEN_KEY = 'meoo_support_desk_token_v1'

export function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_ERP_AUTH_API_BASE ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return '/erp-api'
}

function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const rel = p.replace(/^\/api\//, '').replace(/^\//, '')
  return `${apiBase()}/${rel}`
}

export function readToken(): string {
  const fromEnv = (import.meta.env.VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN ?? '').trim()
  if (fromEnv) return fromEnv
  try {
    return (localStorage.getItem(TOKEN_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function writeToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token.trim())
  } catch {
    /* ignore */
  }
}

export function isMpSession(sessionId: string): boolean {
  const sid = String(sessionId || '').trim()
  return /^lq-mp[-:]/i.test(sid) || /^mp[-_]/i.test(sid)
}

export async function pollSupport(
  token: string,
  sinceTs: number,
): Promise<{ ok: true; messages: ChatLine[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(apiUrl(`/api/support-poll?sinceTs=${sinceTs}`), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const data = (await res.json()) as { ok?: boolean; error?: string; detail?: string; messages?: ChatLine[] }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.detail || data.error || `HTTP ${res.status}` }
    }
    return { ok: true, messages: Array.isArray(data.messages) ? data.messages : [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' }
  }
}

export async function sendOpsReply(
  token: string,
  body: { sessionId: string; text: string; id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(apiUrl('/api/support-ops-send'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok?: boolean; error?: string; detail?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.detail || data.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' }
  }
}

/** 用一次空 since 轮询校验 token（失败则 401） */
export async function verifySupportToken(token: string): Promise<boolean> {
  const r = await pollSupport(token, Date.now())
  return r.ok
}

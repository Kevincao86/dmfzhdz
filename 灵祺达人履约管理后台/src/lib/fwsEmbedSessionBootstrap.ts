/**
 * fws ERP 内嵌 dr 星选：从 URL 接收 mp_token 并写入本地会话（跨域 iframe 无法共享 localStorage）。
 */
import type { MpAccount } from './mpSession'
import { setSession } from './mpSession'
import { setWorkIdentity } from './mpWorkIdentity'
import { apiUrl } from './mpApiBase'

function stripEmbedQueryParams(): void {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('from') !== 'fws-embed') return
    url.searchParams.delete('mp_token')
    url.searchParams.delete('from')
    url.searchParams.delete('embed')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}

export function needsFwsEmbedBootstrap(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('from') === 'fws-embed' && Boolean(params.get('mp_token')?.trim())
}

export async function bootstrapFwsEmbedSessionFromUrl(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('from') !== 'fws-embed') return false
  const token = params.get('mp_token')?.trim()
  if (!token) return false

  try {
    const res = await fetch(apiUrl('/api/meoo-ops-mp-auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'session', sessionToken: token, token }),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || data.ok === false || !data.account) return false
    const account = data.account as MpAccount
    setSession(token, { ...account, activeRole: 'pr' })
    setWorkIdentity('pr')
    stripEmbedQueryParams()
    return true
  } catch {
    return false
  }
}

import {
  emptyClientStatePayload,
  mergeClientStatePayload,
  normalizeClientStatePayload,
  type MpClientStatePayload,
} from './mpAccountClientStateMerge.js'

type SupabaseRest = {
  get: (path: string) => Promise<Response>
  post: (path: string, body: unknown) => Promise<Response>
  patch: (path: string, body: unknown) => Promise<Response>
}

function restClient(supabaseUrl: string, serviceRole: string): SupabaseRest {
  const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return {
    get: (path) => fetch(`${base}${path}`, { headers: { ...headers, Prefer: 'return=representation' } }),
    post: (path, body) =>
      fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    patch: (path, body) =>
      fetch(`${base}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
  }
}

async function loadClientState(
  rest: SupabaseRest,
  accountId: string,
): Promise<MpClientStatePayload> {
  const res = await rest.get(
    `/mp_account_client_state?account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
  )
  if (!res.ok) return emptyClientStatePayload()
  const rows = (await res.json()) as { payload?: unknown }[]
  const row = rows[0]
  if (!row?.payload) return emptyClientStatePayload()
  return normalizeClientStatePayload(row.payload)
}

async function saveClientState(
  rest: SupabaseRest,
  accountId: string,
  payload: MpClientStatePayload,
): Promise<void> {
  const now = new Date().toISOString()
  const body = { account_id: accountId, payload, updated_at: now }
  const existing = await rest.get(
    `/mp_account_client_state?account_id=eq.${encodeURIComponent(accountId)}&limit=1`,
  )
  if (existing.ok) {
    const rows = (await existing.json()) as unknown[]
    if (Array.isArray(rows) && rows.length > 0) {
      const patch = await rest.patch(
        `/mp_account_client_state?account_id=eq.${encodeURIComponent(accountId)}`,
        { payload, updated_at: now },
      )
      if (patch.ok) return
    }
  }
  const ins = await rest.post('/mp_account_client_state', body)
  if (!ins.ok) {
    const t = await ins.text().catch(() => '')
    throw new Error(`mp_client_state_save_${ins.status}:${t.slice(0, 200)}`)
  }
}

export async function mpAuthGetClientState(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
): Promise<MpClientStatePayload> {
  const rest = restClient(supabaseUrl, serviceRole)
  return loadClientState(rest, accountId)
}

export async function mpAuthSyncClientState(
  supabaseUrl: string,
  serviceRole: string,
  accountId: string,
  clientPatch: unknown,
): Promise<{ state: MpClientStatePayload; updatedAt: string }> {
  const rest = restClient(supabaseUrl, serviceRole)
  const server = await loadClientState(rest, accountId)
  const client = normalizeClientStatePayload(clientPatch)
  const merged = mergeClientStatePayload(server, client)
  await saveClientState(rest, accountId, merged)
  return { state: merged, updatedAt: new Date().toISOString() }
}

import { fetchOpsErpApi, opsErpApiBase, opsErpApiUrl } from './opsErpApiBase.js'

/** @deprecated 使用 opsErpApiBase */
export function supportOpsHttpApiBase(): string {
  return opsErpApiBase()
}

export function supportPollUrl(sinceTs: number): string {
  const q = `sinceTs=${sinceTs}`
  return opsErpApiUrl(`/api/support-poll?${q}`)
}

export function supportOpsSendUrl(): string {
  return opsErpApiUrl('/api/support-ops-send')
}

/** 运营回复写入 Supabase（优先 ECS erp-api，失败回退同源 /api） */
export async function postSupportOpsSend(
  token: string,
  body: { sessionId: string; text: string; id: string },
): Promise<{ ok: boolean; error?: string; detail?: string; status: number }> {
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  try {
    const res = await fetchOpsErpApi('/api/support-ops-send', { method: 'POST', headers, body: payload })
    let data: { ok?: boolean; error?: string; detail?: string } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      /* ignore */
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.error ?? `HTTP ${res.status}`,
        detail: data.detail,
      }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'network_error',
    }
  }
}

export { opsErpApiUrl }

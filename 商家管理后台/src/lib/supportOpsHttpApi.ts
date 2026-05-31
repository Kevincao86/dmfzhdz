/** 运营台在线客服 HTTP 轮询/回复 API 基址（Vercel 无法出站访问 ECS 时改走 https://mofangdianai.com/erp-api） */
export function supportOpsHttpApiBase(): string {
  const raw =
    typeof import.meta.env.VITE_MEEO_SUPPORT_OPS_API_BASE === 'string'
      ? import.meta.env.VITE_MEEO_SUPPORT_OPS_API_BASE.trim()
      : ''
  return raw.replace(/\/$/, '')
}

export function supportPollUrl(sinceTs: number): string {
  const base = supportOpsHttpApiBase()
  const q = `sinceTs=${sinceTs}`
  if (base) return `${base}/support-poll?${q}`
  return `/api/support-poll?${q}`
}

export function supportOpsSendUrl(): string {
  const base = supportOpsHttpApiBase()
  if (base) return `${base}/support-ops-send`
  return '/api/support-ops-send'
}

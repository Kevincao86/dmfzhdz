import { opsErpApiBase, opsErpApiUrl } from './opsErpApiBase.js'

/** @deprecated 使用 opsErpApiBase */
export function supportOpsHttpApiBase(): string {
  return opsErpApiBase()
}

export function supportPollUrl(sinceTs: number): string {
  const q = `sinceTs=${sinceTs}`
  const base = opsErpApiBase()
  if (base) return `${base}/support-poll?${q}`
  return `/api/support-poll?${q}`
}

export function supportOpsSendUrl(): string {
  const base = opsErpApiBase()
  if (base) return `${base}/support-ops-send`
  return '/api/support-ops-send'
}

export { opsErpApiUrl }

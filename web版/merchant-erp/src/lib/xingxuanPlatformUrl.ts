/** 灵祺星选 Web 平台（dr）— 与 ERP / 小程序共用运营注册表 */

export function xingxuanWebOrigin(): string {
  const fromEnv = (import.meta.env.VITE_XINGXUAN_WEB_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const h = window.location.hostname.toLowerCase()
    if (h.startsWith('fws.') || h.includes('.fws.')) {
      return `${window.location.protocol}//dr.${h.slice(4)}`.replace(/\/\/dr\.\./, '//dr.')
    }
  }
  return 'https://dr.mofangdianai.com'
}

export type XingxuanRecruitmentStep = 'publish' | 'applicants' | 'schedule' | 'video-review' | 'detail'

export function xingxuanRecruitmentUrl(
  step: XingxuanRecruitmentStep,
  mpOrderId?: string,
): string {
  const base = xingxuanWebOrigin()
  const id = String(mpOrderId || '').trim()
  switch (step) {
    case 'publish':
      return `${base}/publish?from=erp`
    case 'detail':
      return id ? `${base}/recruitment/${encodeURIComponent(id)}` : `${base}/hall?tab=hall`
    case 'applicants':
      return id ? `${base}/orders/${encodeURIComponent(id)}/applicants` : `${base}/orders`
    case 'schedule':
      return id ? `${base}/orders/${encodeURIComponent(id)}/schedule` : `${base}/orders`
    case 'video-review':
      return id ? `${base}/orders/${encodeURIComponent(id)}/video-review` : `${base}/orders`
    default:
      return `${base}/hall?tab=hall`
  }
}

export function openXingxuanRecruitment(step: XingxuanRecruitmentStep, mpOrderId?: string): void {
  window.open(xingxuanRecruitmentUrl(step, mpOrderId), '_blank', 'noopener,noreferrer')
}

import type { HelpManualEdition } from './helpManualTypes.js'
import { isPartnerEdition } from './appEdition.js'

export const LEGAL_COMPANY_NAME = '宁波墨典网络科技有限公司'
export const LEGAL_COMPANY_ADDRESS = '浙江省宁波市'
export const LEGAL_CONTACT_PHONE = '15757468650'
export const LEGAL_EFFECTIVE_DATE = '2026年6月10日'

export function helpManualEditionFromApp(): HelpManualEdition {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname
    if (path.startsWith('/fulfillment') || path.includes('xingxuan')) return 'fulfillment'
  }
  return isPartnerEdition() ? 'partner' : 'merchant'
}

export function productNameForEdition(edition: HelpManualEdition): string {
  if (edition === 'partner') return '灵祺AI智能ERP（服务商版）'
  if (edition === 'fulfillment') return '灵祺星选平台'
  return '灵祺AI智能ERP'
}

export function resolveHelpEdition(raw?: string | null): HelpManualEdition {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'partner' || v === 'fulfillment' || v === 'merchant') return v
  return helpManualEditionFromApp()
}

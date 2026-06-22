import type { HelpManualEdition } from './helpManualTypes'

export const LEGAL_COMPANY_NAME = '宁波墨典网络科技有限公司'

export function productNameForEdition(edition: HelpManualEdition): string {
  if (edition === 'partner') return '灵祺AI智能ERP（服务商版）'
  if (edition === 'fulfillment') return '灵祺星选平台'
  if (edition === 'mp') return '灵祺星选小程序'
  return '灵祺AI智能ERP'
}

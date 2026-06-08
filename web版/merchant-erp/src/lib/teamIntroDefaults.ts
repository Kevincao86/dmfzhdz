import type { RegistryTeamIntro } from './teamIntroTypes.js'

const LEGAL_COMPANY_NAME = '宁波墨典网络科技有限公司'

export function defaultTeamIntroParagraphs(): string[] {
  return [
    `${LEGAL_COMPANY_NAME} 专注本地生活数字化与达人经济基础设施，运营 {{product}}，为商户、服务商、达人及 PR 提供招募协作、智能运营与履约管理一体化能力。`,
    '我们相信「简单生意需要简单工具」——通过 AI 辅助、数据打通与多端协同，帮助客户降低运营成本、提升转化效率，共建健康可持续的本地生活达人生态。',
    '产品覆盖商家 ERP、服务商协同、星选履约平台与运营管控体系，数据经加密传输与权限隔离，持续迭代以满足行业合规与业务增长需求。',
  ]
}

export function defaultTeamIntro(now = new Date().toLocaleString('zh-CN', { hour12: false })): RegistryTeamIntro {
  return {
    subtitle: LEGAL_COMPANY_NAME,
    paragraphs: defaultTeamIntroParagraphs(),
    updatedAt: now,
  }
}

export function renderTeamIntroParagraphs(paragraphs: string[], product: string): string[] {
  return paragraphs.map((p) => p.replaceAll('{{product}}', product))
}

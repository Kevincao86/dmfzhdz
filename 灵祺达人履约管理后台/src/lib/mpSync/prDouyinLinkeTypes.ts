/** PR 星选 · 抖音林客绑定（非必填，流程与服务商版一致） */
import { readPrProfile } from './userProfile'

export type PrDouyinLinkeServiceProvider = {
  appId: string
  merchantAccountId: string
  accountDisplayName?: string
  sealedToken: string
  updatedAt: string
}

export type PrDouyinLinkeClient = {
  id: string
  merchantAccountId: string
  accountDisplayName: string
  clientLabel?: string
  clientKey?: string
  sealedToken: string
  updatedAt: string
}

export type PrDouyinLinkeBindings = {
  serviceProvider?: PrDouyinLinkeServiceProvider | null
  clients: PrDouyinLinkeClient[]
  /** 跨端同步时间戳 */
  metaUpdatedAt?: string
}

export type PublishLinkeAttach = {
  enabled: boolean
  clientId: string
  merchantAccountId: string
  merchantDisplayName: string
  productIds: string[]
  merchantPhone: string
}

export function emptyPublishLinkeAttach(): PublishLinkeAttach {
  const pr = readPrProfile()
  return {
    enabled: false,
    clientId: '',
    merchantAccountId: '',
    merchantDisplayName: '',
    productIds: [],
    merchantPhone: String(pr?.contactPhone || '').trim(),
  }
}

export const PR_DOUYIN_LINKE_COPY = {
  brandAlt: '抖音林客',
  sectionTitle: '抖音林客 · 服务商应用',
  sectionIntro:
    '绑定生活服务开放平台创建的「服务商应用」。完成林客授权后，可添加代运营客户商家；发招募时可选择挂接林客商家并自动同步定向招募。',
  bindButton: '绑定抖音林客',
  addClientButton: '添加客户商家',
  merchantIdLabel: '服务商账户 ID',
  merchantIdPlaceholder: '林客 / 服务商根账户 ID（非客户商家 ID）',
  clientMerchantIdLabel: '客户商家账号 ID',
  guideTitle: '抖音林客 · 服务商接入说明',
  publishAttachTitle: '是否挂接抖音林客商家',
  publishAttachHint: '选「是」后，报名满员并通知达人时将自动在林客端创建定向招募并同步达人佣金与结算费用。',
} as const

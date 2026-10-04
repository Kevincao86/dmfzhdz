/** 营销中心 · 现金红包活动。配置、发放、钱包与提现都落在注册表 marketingCenter，不整表覆盖其它字段。 */

export const XINGXUAN_CASH_CAMPAIGN_ID = 'xingxuan-pr-cash-red-packet'
export const MERCHANT_CASH_CAMPAIGN_ID = 'merchant-erp-cash-red-packet'

export type MarketingSurface = 'xingxuan' | 'merchant_erp'

/** 谁能在钱包里看到并提现这只现金红包。 */
export type CashWithdrawIdentity = 'pr' | 'talent'

export type CashRedPacketCampaign = {
  id: string
  surface: MarketingSurface
  template: 'cash_red_packet'
  title: string
  subtitle: string
  enabled: boolean
  amountCents: number
  totalQuota: number
  posterUrl: string
  rulesText: string
  /** 达标发单数必须大于该值才可提现。默认 5，即大于 5 单。 */
  withdrawAfterOrders: number
  withdrawIdentity: CashWithdrawIdentity
  updatedAt: string
}

export const PROMO_BOARD_KINDS = ['version_discount', 'pr_plan', 'talent_plan', 'member_bonus', 'flash_open'] as const
export type PromoBoardKind = (typeof PROMO_BOARD_KINDS)[number]

export type PromoBoard = {
  id: string
  surface: MarketingSurface
  kind: PromoBoardKind
  title: string
  subtitle: string
  enabled: boolean
  offerText: string
  audience: string
  quota: number
  startAt: string
  endAt: string
  posterUrl: string
  rulesText: string
  updatedAt: string
}

export type MarketingGrant = {
  id: string
  campaignId: string
  prKey: string
  orderId: string
  amountCents: number
  displayName: string
  createdAt: string
}

export type MarketingWallet = {
  prKey: string
  campaignId: string
  availableCents: number
  frozenCents: number
  withdrawnCents: number
  qualifyingOrders: number
  displayName: string
  updatedAt: string
}

export type MarketingWithdraw = {
  id: string
  campaignId: string
  prKey: string
  amountCents: number
  qualifyingOrders: number
  status: 'pending' | 'paid'
  displayName: string
  createdAt: string
  paidAt?: string
}

export type RegistryMarketingCenter = {
  campaigns: CashRedPacketCampaign[]
  boards: PromoBoard[]
  grants: MarketingGrant[]
  wallets: MarketingWallet[]
  withdraws: MarketingWithdraw[]
  updatedAt: string
}

export type PublishOrderForCash = {
  id?: string
  publisherIdentity?: string
  fulfillmentLoop?: string
  mpPublishMeta?: unknown
}

const DEFAULT_RULES =
  'PR 在小程序或星选平台成功发布招募（闭环或开环都算）后，按活动单价发放一笔现金红包，自动进入「我的钱包」。每个招募单只发一次，红包发完即止。累计发单数大于 5 单后，可将钱包余额一次提现。'

const TALENT_RULES =
  '完成达人活动后，红包自动进入「我的钱包」。每个活动只记一次，红包发完即止。累计达标单数大于 5 单后，可将钱包余额一次提现。'

export function parseCashWithdrawIdentity(value: unknown, fallback: CashWithdrawIdentity = 'pr'): CashWithdrawIdentity {
  return value === 'talent' || value === 'pr' ? value : fallback
}

function nowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function text(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

export function centsFromYuan(yuan: unknown): number {
  const n = typeof yuan === 'number' ? yuan : Number(yuan)
  if (!Number.isFinite(n)) return 0
  return clampInt(Math.round(n * 100), 0, 100_000_00, 0)
}

export function yuanFromCents(cents: number): string {
  return (Math.max(0, Math.round(cents)) / 100).toFixed(2)
}

export function defaultCashCampaign(surface: MarketingSurface): CashRedPacketCampaign {
  const xingxuan = surface === 'xingxuan'
  return {
    id: xingxuan ? XINGXUAN_CASH_CAMPAIGN_ID : MERCHANT_CASH_CAMPAIGN_ID,
    surface,
    template: 'cash_red_packet',
    title: xingxuan ? 'PR招募现金红包' : '商家ERP现金红包',
    subtitle: xingxuan
      ? '完成闭环或开环招募发单，红包自动进入钱包'
      : '商家 ERP 活动使用同一现金红包模版，价格和海报可单独调整',
    enabled: xingxuan,
    amountCents: 500,
    totalQuota: 0,
    posterUrl: '',
    rulesText: xingxuan
      ? DEFAULT_RULES
      : '这是商家 ERP 的现金红包活动模版。可调整单价、红包数量、海报和规则。当前自动入账接在星选 / 达人小程序的 PR 发单；商家侧配置单独保存。',
    withdrawAfterOrders: 5,
    withdrawIdentity: 'pr',
    updatedAt: '',
  }
}

const BOARD_COPY: Record<PromoBoardKind, { title: string; subtitle: string; offerText: string; audience: string; rulesText: string }> = {
  version_discount: {
    title: '版本折扣',
    subtitle: '会员版本限时折扣，折扣或优惠价在这里手动上线',
    offerText: '8折',
    audience: '全部会员版本',
    rulesText: '活动时间内，指定版本按优惠内容执行。名额填 0 表示不限。关闭上线后活动停止。',
  },
  pr_plan: {
    title: 'PR版本活动',
    subtitle: 'PR 开通、续费或升级的专属活动',
    offerText: '首年立减',
    audience: 'PR',
    rulesText: '只面向 PR 版本。填写优惠、名额和起止时间后打开上线。',
  },
  talent_plan: {
    title: '达人版活动',
    subtitle: '达人会员开通或续费活动',
    offerText: '达人版特价',
    audience: '达人',
    rulesText: '只面向达人版本。优惠、名额、海报和规则单独保存。',
  },
  member_bonus: {
    title: '会员加赠',
    subtitle: '开通即送天数、席位或积分',
    offerText: '加赠 30 天',
    audience: '新开通',
    rulesText: '开通指定版本后按优惠内容加赠。这条不走现金红包自动入账。',
  },
  flash_open: {
    title: '限时开通',
    subtitle: '指定日期内的新客开通价',
    offerText: '限时价',
    audience: '新客',
    rulesText: '只在开始和结束时间内有效。到期后关闭上线。',
  },
}

export function promoBoardId(surface: MarketingSurface, kind: PromoBoardKind): string {
  return `${surface}:${kind}`
}

export function isPromoBoardKind(value: unknown): value is PromoBoardKind {
  return PROMO_BOARD_KINDS.some((kind) => kind === value)
}

export function defaultPromoBoard(surface: MarketingSurface, kind: PromoBoardKind): PromoBoard {
  const copy = BOARD_COPY[kind]
  const merchant = surface === 'merchant_erp'
  return {
    id: promoBoardId(surface, kind),
    surface,
    kind,
    title: copy.title,
    subtitle: merchant ? `商家 ERP · ${copy.subtitle}` : copy.subtitle,
    enabled: false,
    offerText: copy.offerText,
    audience: copy.audience,
    quota: 0,
    startAt: '',
    endAt: '',
    posterUrl: '',
    rulesText: copy.rulesText,
    updatedAt: '',
  }
}

export function defaultPromoBoards(surface: MarketingSurface): PromoBoard[] {
  return PROMO_BOARD_KINDS.map((kind) => defaultPromoBoard(surface, kind))
}

export function emptyMarketingCenter(): RegistryMarketingCenter {
  return {
    campaigns: [defaultCashCampaign('xingxuan'), defaultCashCampaign('merchant_erp')],
    boards: [...defaultPromoBoards('xingxuan'), ...defaultPromoBoards('merchant_erp')],
    grants: [],
    wallets: [],
    withdraws: [],
    updatedAt: '',
  }
}

function asCampaign(raw: unknown, fallback: CashRedPacketCampaign): CashRedPacketCampaign {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const poster = text(row.posterUrl, 2000)
  return {
    ...fallback,
    title: text(row.title, 40) || fallback.title,
    subtitle: text(row.subtitle, 80) || fallback.subtitle,
    enabled: row.enabled == null ? fallback.enabled : row.enabled === true || row.enabled === 'true',
    amountCents: clampInt(row.amountCents, 1, 100_000_00, fallback.amountCents),
    totalQuota: clampInt(row.totalQuota, 0, 1_000_000, 0),
    posterUrl: poster.startsWith('data:') ? '' : poster,
    rulesText: text(row.rulesText, 2000) || fallback.rulesText,
    withdrawAfterOrders: clampInt(row.withdrawAfterOrders, 0, 999, fallback.withdrawAfterOrders),
    withdrawIdentity: parseCashWithdrawIdentity(row.withdrawIdentity, fallback.withdrawIdentity || 'pr'),
    updatedAt: text(row.updatedAt, 40),
  }
}

function asBoard(raw: unknown, fallback: PromoBoard): PromoBoard {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const poster = text(row.posterUrl, 2000)
  const startAt = text(row.startAt, 40)
  const endAt = text(row.endAt, 40)
  return {
    ...fallback,
    title: text(row.title, 40) || fallback.title,
    subtitle: text(row.subtitle, 80) || fallback.subtitle,
    enabled: row.enabled == null ? fallback.enabled : row.enabled === true || row.enabled === 'true',
    offerText: text(row.offerText, 40) || fallback.offerText,
    audience: text(row.audience, 40) || fallback.audience,
    quota: clampInt(row.quota, 0, 1_000_000, fallback.quota),
    startAt,
    endAt,
    posterUrl: poster.startsWith('data:') ? '' : poster,
    rulesText: text(row.rulesText, 2000) || fallback.rulesText,
    updatedAt: text(row.updatedAt, 40),
  }
}

function boardsFrom(raw: unknown): PromoBoard[] {
  const incoming = Array.isArray(raw) ? raw : []
  const surfaces: MarketingSurface[] = ['xingxuan', 'merchant_erp']
  return surfaces.flatMap((surface) =>
    defaultPromoBoards(surface).map((fallback) => {
      const found = incoming.find((item) => {
        if (!item || typeof item !== 'object') return false
        return String((item as { id?: unknown }).id || '') === fallback.id
      })
      return asBoard(found, fallback)
    }),
  )
}

function asGrant(raw: unknown): MarketingGrant | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const orderId = text(row.orderId, 80)
  const prKey = text(row.prKey, 80)
  const campaignId = text(row.campaignId, 80)
  if (!orderId || !prKey || !campaignId) return null
  return {
    id: text(row.id, 80) || `grant_${orderId}`,
    campaignId,
    prKey,
    orderId,
    amountCents: clampInt(row.amountCents, 0, 100_000_00, 0),
    displayName: text(row.displayName, 40),
    createdAt: text(row.createdAt, 40),
  }
}

function asWallet(raw: unknown): MarketingWallet | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const prKey = text(row.prKey, 80)
  const campaignId = text(row.campaignId, 80)
  if (!prKey || !campaignId) return null
  return {
    prKey,
    campaignId,
    availableCents: clampInt(row.availableCents, 0, 100_000_000, 0),
    frozenCents: clampInt(row.frozenCents, 0, 100_000_000, 0),
    withdrawnCents: clampInt(row.withdrawnCents, 0, 100_000_000, 0),
    qualifyingOrders: clampInt(row.qualifyingOrders, 0, 1_000_000, 0),
    displayName: text(row.displayName, 40),
    updatedAt: text(row.updatedAt, 40),
  }
}

function asWithdraw(raw: unknown): MarketingWithdraw | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const prKey = text(row.prKey, 80)
  const campaignId = text(row.campaignId, 80)
  if (!id || !prKey || !campaignId) return null
  const paidAt = text(row.paidAt, 40)
  return {
    id,
    campaignId,
    prKey,
    amountCents: clampInt(row.amountCents, 0, 100_000_000, 0),
    qualifyingOrders: clampInt(row.qualifyingOrders, 0, 1_000_000, 0),
    status: row.status === 'paid' ? 'paid' : 'pending',
    displayName: text(row.displayName, 40),
    createdAt: text(row.createdAt, 40),
    ...(paidAt ? { paidAt } : {}),
  }
}

export function normalizeMarketingCenter(raw: unknown): RegistryMarketingCenter {
  const base = emptyMarketingCenter()
  if (!raw || typeof raw !== 'object') return base
  const row = raw as Record<string, unknown>
  const incoming = Array.isArray(row.campaigns) ? row.campaigns : []
  const campaigns = base.campaigns.map((fallback) => {
    const found = incoming.find((item) => {
      if (!item || typeof item !== 'object') return false
      return String((item as { id?: unknown }).id || '') === fallback.id
    })
    return asCampaign(found, fallback)
  })
  const grants = (Array.isArray(row.grants) ? row.grants : []).map(asGrant).filter((x): x is MarketingGrant => !!x)
  const wallets = (Array.isArray(row.wallets) ? row.wallets : []).map(asWallet).filter((x): x is MarketingWallet => !!x)
  const withdraws = (Array.isArray(row.withdraws) ? row.withdraws : [])
    .map(asWithdraw)
    .filter((x): x is MarketingWithdraw => !!x)
  return {
    campaigns,
    boards: boardsFrom(row.boards),
    grants: grants.slice(0, 20_000),
    wallets: wallets.slice(0, 20_000),
    withdraws: withdraws.slice(0, 20_000),
    updatedAt: text(row.updatedAt, 40),
  }
}

export function campaignBySurface(
  center: RegistryMarketingCenter,
  surface: MarketingSurface,
): CashRedPacketCampaign {
  return center.campaigns.find((item) => item.surface === surface) ?? defaultCashCampaign(surface)
}

export function applyCampaignSave(
  center: RegistryMarketingCenter,
  patch: Partial<CashRedPacketCampaign> & { surface: MarketingSurface },
): RegistryMarketingCenter {
  const current = campaignBySurface(center, patch.surface)
  const next = asCampaign(
    {
      ...current,
      ...patch,
      id: current.id,
      surface: current.surface,
      template: 'cash_red_packet',
      amountCents:
        patch.amountCents != null
          ? patch.amountCents
          : current.amountCents,
      updatedAt: nowText(),
    },
    current,
  )
  next.id = current.id
  next.surface = current.surface
  next.updatedAt = nowText()
  return {
    ...center,
    campaigns: center.campaigns.map((item) => (item.id === current.id ? next : item)),
    updatedAt: next.updatedAt,
  }
}

export function applyBoardSave(
  center: RegistryMarketingCenter,
  patch: Partial<PromoBoard> & { surface: MarketingSurface; kind: PromoBoardKind },
): RegistryMarketingCenter {
  const current =
    center.boards.find((item) => item.surface === patch.surface && item.kind === patch.kind) ??
    defaultPromoBoard(patch.surface, patch.kind)
  const next = asBoard(
    {
      ...current,
      ...patch,
      id: current.id,
      surface: current.surface,
      kind: current.kind,
      updatedAt: nowText(),
    },
    current,
  )
  next.id = current.id
  next.surface = current.surface
  next.kind = current.kind
  next.updatedAt = nowText()
  const exists = center.boards.some((item) => item.id === current.id)
  return {
    ...center,
    boards: exists ? center.boards.map((item) => (item.id === current.id ? next : item)) : [...center.boards, next],
    updatedAt: next.updatedAt,
  }
}

export function prKeyFromPublishOrder(order: PublishOrderForCash): string {
  if (String(order.publisherIdentity || '') === 'merchant') return ''
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const lingqi = text(meta.lingqiPrId, 80)
  const registry = text(meta.registryPrId, 80)
  const identity = String(order.publisherIdentity || '')
  if (identity && identity !== 'pr' && !lingqi && !registry) return ''
  return lingqi || registry
}

export function publishOrderQualifies(order: PublishOrderForCash): boolean {
  const key = prKeyFromPublishOrder(order)
  if (!key || !text(order.id, 80)) return false
  const loop = String(order.fulfillmentLoop || '')
  if (loop === 'open' || loop === 'closed') return true
  return String(order.publisherIdentity || '') === 'pr' || Boolean(key)
}

export type GrantOutcome = {
  granted: boolean
  reason: string
  amountCents: number
  message: string
}

export function grantCashForOrder(center: RegistryMarketingCenter, order: PublishOrderForCash): {
  center: RegistryMarketingCenter
  outcome: GrantOutcome
} {
  const orderId = text(order.id, 80)
  const prKey = prKeyFromPublishOrder(order)
  if (!publishOrderQualifies(order)) {
    return {
      center,
      outcome: { granted: false, reason: 'not_qualified', amountCents: 0, message: '' },
    }
  }
  const campaign = campaignBySurface(center, 'xingxuan')
  if (campaign.withdrawIdentity !== 'pr') {
    return { center, outcome: { granted: false, reason: 'identity_not_pr', amountCents: 0, message: '' } }
  }
  if (!campaign.enabled) {
    return { center, outcome: { granted: false, reason: 'campaign_disabled', amountCents: 0, message: '' } }
  }
  if (center.grants.some((item) => item.campaignId === campaign.id && item.orderId === orderId)) {
    return { center, outcome: { granted: false, reason: 'duplicate', amountCents: 0, message: '' } }
  }
  const used = center.grants.filter((item) => item.campaignId === campaign.id).length
  if (campaign.totalQuota <= 0 || used >= campaign.totalQuota) {
    return { center, outcome: { granted: false, reason: 'quota_exhausted', amountCents: 0, message: '' } }
  }
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const displayName = text(meta.prDisplayName, 40)
  const createdAt = nowText()
  const grant: MarketingGrant = {
    id: `grant_${orderId}`,
    campaignId: campaign.id,
    prKey,
    orderId,
    amountCents: campaign.amountCents,
    displayName,
    createdAt,
  }
  const wallets = center.wallets.slice()
  const idx = wallets.findIndex((item) => item.campaignId === campaign.id && item.prKey === prKey)
  const prev = idx >= 0 ? wallets[idx]! : null
  const wallet: MarketingWallet = {
    prKey,
    campaignId: campaign.id,
    availableCents: (prev?.availableCents ?? 0) + campaign.amountCents,
    frozenCents: prev?.frozenCents ?? 0,
    withdrawnCents: prev?.withdrawnCents ?? 0,
    qualifyingOrders: (prev?.qualifyingOrders ?? 0) + 1,
    displayName: displayName || prev?.displayName || '',
    updatedAt: createdAt,
  }
  if (idx >= 0) wallets[idx] = wallet
  else wallets.unshift(wallet)
  return {
    center: {
      ...center,
      grants: [grant, ...center.grants].slice(0, 20_000),
      wallets,
      updatedAt: createdAt,
    },
    outcome: {
      granted: true,
      reason: 'granted',
      amountCents: campaign.amountCents,
      message: `已获得 ¥${yuanFromCents(campaign.amountCents)} 现金红包`,
    },
  }
}

export function requestCashWithdraw(
  center: RegistryMarketingCenter,
  prKey: string,
  displayName = '',
  identity: CashWithdrawIdentity = 'pr',
): { center: RegistryMarketingCenter; ok: true; withdraw: MarketingWithdraw } | { center: RegistryMarketingCenter; ok: false; error: string; message: string } {
  const key = text(prKey, 80)
  const campaign = campaignBySurface(center, 'xingxuan')
  if (campaign.withdrawIdentity !== identity) {
    return {
      center,
      ok: false,
      error: 'identity_mismatch',
      message: campaign.withdrawIdentity === 'talent' ? '这个红包只给达人提现' : '这个红包只给 PR 提现',
    }
  }
  const idx = center.wallets.findIndex((item) => item.campaignId === campaign.id && item.prKey === key)
  const wallet = idx >= 0 ? center.wallets[idx]! : null
  const orders = wallet?.qualifyingOrders ?? 0
  if (!wallet || orders <= campaign.withdrawAfterOrders) {
    return {
      center,
      ok: false,
      error: 'need_more_orders',
      message: `${campaign.withdrawIdentity === 'talent' ? '累计达标' : '累计发单'}大于 ${campaign.withdrawAfterOrders} 单后才能提现，当前 ${orders} 单`,
    }
  }
  if (wallet.availableCents < 1) {
    return { center, ok: false, error: 'empty', message: '钱包里还没有可提现余额' }
  }
  if (center.withdraws.some((item) => item.campaignId === campaign.id && item.prKey === key && item.status === 'pending')) {
    return { center, ok: false, error: 'pending_exists', message: '已有一笔提现待打款' }
  }
  const createdAt = nowText()
  const withdraw: MarketingWithdraw = {
    id: `wd_${Date.now()}_${key.slice(-6)}`,
    campaignId: campaign.id,
    prKey: key,
    amountCents: wallet.availableCents,
    qualifyingOrders: orders,
    status: 'pending',
    displayName: text(displayName, 40) || wallet.displayName,
    createdAt,
  }
  const nextWallet: MarketingWallet = {
    ...wallet,
    availableCents: 0,
    frozenCents: wallet.frozenCents + wallet.availableCents,
    displayName: withdraw.displayName || wallet.displayName,
    updatedAt: createdAt,
  }
  const wallets = center.wallets.slice()
  wallets[idx] = nextWallet
  return {
    center: {
      ...center,
      wallets,
      withdraws: [withdraw, ...center.withdraws].slice(0, 20_000),
      updatedAt: createdAt,
    },
    ok: true,
    withdraw,
  }
}

export function markCashWithdrawPaid(
  center: RegistryMarketingCenter,
  withdrawId: string,
): { center: RegistryMarketingCenter; ok: true } | { center: RegistryMarketingCenter; ok: false; error: string } {
  const id = text(withdrawId, 80)
  const idx = center.withdraws.findIndex((item) => item.id === id)
  const row = idx >= 0 ? center.withdraws[idx]! : null
  if (!row) return { center, ok: false, error: 'withdraw_not_found' }
  if (row.status === 'paid') return { center, ok: true }
  const paidAt = nowText()
  const withdraws = center.withdraws.slice()
  withdraws[idx] = { ...row, status: 'paid', paidAt }
  const wallets = center.wallets.slice()
  const widx = wallets.findIndex((item) => item.campaignId === row.campaignId && item.prKey === row.prKey)
  if (widx >= 0) {
    const wallet = wallets[widx]!
    wallets[widx] = {
      ...wallet,
      frozenCents: Math.max(0, wallet.frozenCents - row.amountCents),
      withdrawnCents: wallet.withdrawnCents + row.amountCents,
      updatedAt: paidAt,
    }
  }
  return { center: { ...center, withdraws, wallets, updatedAt: paidAt }, ok: true }
}

export function walletViewForIdentity(
  center: RegistryMarketingCenter,
  holderKey: string,
  identity: CashWithdrawIdentity | 'shoot' | 'edit' | '',
) {
  const key = text(holderKey, 80)
  const campaign = campaignBySurface(center, 'xingxuan')
  const allowed = campaign.withdrawIdentity
  const matched = identity === allowed
  const wallet = matched
    ? center.wallets.find((item) => item.campaignId === campaign.id && item.prKey === key) ?? null
    : null
  const withdraws = matched
    ? center.withdraws.filter((item) => item.campaignId === campaign.id && item.prKey === key).slice(0, 20)
    : []
  const orders = wallet?.qualifyingOrders ?? 0
  const grantedCount = center.grants.filter((item) => item.campaignId === campaign.id).length
  const remaining = Math.max(0, campaign.totalQuota - grantedCount)
  const canWithdraw = matched && !!wallet && orders > campaign.withdrawAfterOrders && wallet.availableCents > 0 && !withdraws.some((item) => item.status === 'pending')
  const visible = matched && Boolean(key) && (campaign.enabled || orders > 0 || (wallet?.availableCents ?? 0) > 0 || (wallet?.frozenCents ?? 0) > 0 || withdraws.length > 0)
  const progress = allowed === 'talent' ? '累计达标' : '累计发单'
  const title =
    allowed === 'talent' && (!campaign.title || campaign.title === 'PR招募现金红包')
      ? '达人活动红包提现'
      : campaign.title
  let hint = ''
  if (matched && !canWithdraw) {
    if (orders <= campaign.withdrawAfterOrders) hint = `${progress}大于 ${campaign.withdrawAfterOrders} 单后可提现，当前 ${orders} 单`
    else if (withdraws.some((item) => item.status === 'pending')) hint = '提现已提交，等待打款'
    else if ((wallet?.availableCents ?? 0) < 1) hint = '当前没有可提现余额'
  }
  return {
    visible,
    campaign: {
      title,
      withdrawIdentity: allowed,
      subtitle: campaign.subtitle,
      enabled: campaign.enabled,
      amountYuan: yuanFromCents(campaign.amountCents),
      posterUrl: campaign.posterUrl,
      rulesText: campaign.rulesText,
      totalQuota: campaign.totalQuota,
      grantedCount,
      remaining,
      withdrawAfterOrders: campaign.withdrawAfterOrders,
    },
    wallet: {
      availableYuan: yuanFromCents(wallet?.availableCents ?? 0),
      frozenYuan: yuanFromCents(wallet?.frozenCents ?? 0),
      withdrawnYuan: yuanFromCents(wallet?.withdrawnCents ?? 0),
      qualifyingOrders: orders,
      canWithdraw,
      hint,
    },
    withdraws: withdraws.map((item) => ({
      id: item.id,
      amountYuan: yuanFromCents(item.amountCents),
      status: item.status,
      statusText: item.status === 'paid' ? '提现成功' : '待打款',
      createdAt: item.createdAt,
      paidAt: item.paidAt || '',
    })),
  }
}

export function walletViewForPr(center: RegistryMarketingCenter, prKey: string) {
  return walletViewForIdentity(center, prKey, 'pr')
}

export function adminCenterView(center: RegistryMarketingCenter, surface: MarketingSurface) {
  const campaign = campaignBySurface(center, surface)
  const grants = center.grants.filter((item) => item.campaignId === campaign.id)
  const withdraws = center.withdraws.filter((item) => item.campaignId === campaign.id)
  return {
    campaign: {
      ...campaign,
      amountYuan: yuanFromCents(campaign.amountCents),
      grantedCount: grants.length,
      remaining: Math.max(0, campaign.totalQuota - grants.length),
    },
    grants: grants.slice(0, 50).map((item) => ({
      ...item,
      amountYuan: yuanFromCents(item.amountCents),
    })),
    withdraws: withdraws.slice(0, 50).map((item) => ({
      ...item,
      amountYuan: yuanFromCents(item.amountCents),
    })),
    boards: center.boards
      .filter((item) => item.surface === surface)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        subtitle: item.subtitle,
        enabled: item.enabled,
        offerText: item.offerText,
        audience: item.audience,
        quota: item.quota,
        startAt: item.startAt,
        endAt: item.endAt,
        posterUrl: item.posterUrl,
        rulesText: item.rulesText,
        updatedAt: item.updatedAt,
      })),
  }
}

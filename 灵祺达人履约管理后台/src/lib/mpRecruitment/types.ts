export type BudgetDisplay =
  | { kind: 'text'; line: string; full?: string }
  | {
      kind: 'tiers'
      cps: string
      mode: string
      summary: string
      chips: { label: string; price: string }[]
      moreCount: number
    }

export type RecruitmentOrderRow = {
  id: string
  /** 商单号（通常与 id 相同，如 MP-RO-xxx） */
  merchantOrderNo?: string
  /** 关联商家 ERP 招募单号 */
  sourceMerchantOrderId?: string
  isMock?: boolean
  title: string
  merchantName: string
  storeName: string
  mpStatus: string
  /** 与 mpStatus 一致，供大厅排序使用 */
  status?: string
  statusLabel: string
  platform: string
  region: string
  category: string
  /** 大厅卡片底部：所需品类/达人标签 */
  categoryTagsText?: string
  hideBudget: boolean
  budgetText: string
  budgetDisplay: BudgetDisplay
  fansRequirement: string
  summary: string
  applicantCount: number
  recruitCount: number | string
  claimedSlotCount?: number
  slotsRemaining?: number
  signupCountText?: string
  overRecruitHot?: boolean
  iceSlotsFull?: boolean
  urgent: boolean
  isIce: boolean
  recruitTarget?: 'talent' | 'shoot' | 'edit'
  recommended: boolean
  priceAmount: number
  publishedAtMs: number
  deadlineMs: number
  /** 大厅卡片报名倒计时（与详情页逻辑一致） */
  signupCountdownText?: string
  signupCountdownTone?: 'green' | 'orange' | 'danger' | 'ended' | 'unknown'
  aiTag?: string
  aiTagTone?: string
  aiTagSource?: string
  matchScore?: number
  aiMatch?: boolean
}

export type TalentCardRow = {
  id: string
  isPreview?: boolean
  isSelfTest?: boolean
  name: string
  avatar: string
  platform: string
  followers: string
  followersRaw: number
  salesGrade: string
  douyinSalesLevel: string
  quality: string
  tags: string[]
  accountTags: string[]
  region: string
  gender: string
  online: boolean
  matchScore: number
  aiTag: string
  aiTagTone: string
  aiMatch: boolean
  chatMutual?: boolean
  favorited?: boolean
}

export type MpRegistry = {
  mpRecruitmentOrders?: Record<string, unknown>[]
  mpTalentMembers?: Record<string, unknown>[]
  mpTalentInbox?: Record<string, unknown>[]
  talentLibraryEntries?: Record<string, unknown>[]
  shootTeamLibraryEntries?: Record<string, unknown>[]
  editTeamLibraryEntries?: Record<string, unknown>[]
  mpPrUsers?: Record<string, unknown>[]
  recruitmentOrders?: Record<string, unknown>[]
  _recommendPoolMeta?: Record<string, unknown>
}

export type RegistryTenantSource = 'erp' | 'ops_manual' | 'supabase'

/** 短视频：可灵 JWT + Seedance（方舟）接入绑定；由运营管控台维护。 */
export type RegistryVideoAi = {
  /** 可灵 Access Key（JWT iss） */
  klingAccessKey?: string
  klingSecretKey?: string
  /** 如 https://api.klingai.com 或控制台提供的区域域 */
  klingApiBase?: string
  /** 与 MERCHANT_AI_ARK_VIDEO_ENDPOINTS：逗号分隔「别名|ep-xxxx」 */
  arkVideoEndpoints?: string
  /** 豆包对话：逗号分隔「显示名|模型ID或ep-xxxx」→ MERCHANT_AI_DOUBAO_CHAT_ENDPOINTS */
  arkChatEndpoints?: string
  /** 豆包视觉 VL（运营台从火山 API 拉取） */
  arkVisionEndpoints?: string
  /** 豆包向量 / Embedding（运营台从火山 API 拉取） */
  arkVectorEndpoints?: string
  /**
   * 可选：方舟视频专用 Key。留空时 ERP dev 服务端会回退注册表 vendorKeys.doubao
   * 或服务端 MERCHANT_AI_DOUBAO_KEY（按合并策略）。
   */
  arkVideoApiKey?: string
  /** 阿里云 ICE 云剪辑 AppId（IMS 控制台） */
  iceAppId?: string
  iceAccessKeyId?: string
  iceAccessKeySecret?: string
  /** 默认 cn-shanghai */
  iceRegion?: string
  /** 成片输出到点播时的 StorageLocation */
  iceVodStorageLocation?: string
  /** 成片输出到 OSS 时的 URL 前缀（与 region 同地域 bucket） */
  iceOutputOssUrlPrefix?: string
  /** 智能一键成片：0/false 关闭；留空默认开启（须 IMS 订阅） */
  iceSmartBatchEnabled?: string
  /** 逗号分隔 BatchEditingTemplateId */
  iceSmartBatchTemplateIds?: string
  /** 千问视频：逗号分隔「显示名|模型ID」→ MERCHANT_AI_QWEN_VIDEO_MODELS */
  qwenVideoModels?: string
}

/** 运营台可扩展的 AI 供应商目录项（磁盘仅存非内置条目，GET 网关会合并内置目录后再返回）。 */
export type AiVendorCatalogEntry = {
  id: string
  label: string
  hint?: string
  /** 可选：HTTPS 图床地址，或本站相对路径（如 `/ai-vendors/foo.svg`），供 ERP 下拉展示 */
  logoUrl?: string
}

export type RegistryTenant = {
  id: string
  source: RegistryTenantSource
  loginName: string
  passwordHash?: string
  merchantName: string
  industry: string
  registeredAt: string
  accountStatus: 'normal' | 'disabled' | 'frozen'
  trialDays: number
  officialDays: number
  trialEndsAt?: string
  officialEndsAt?: string
  updatedAt: string
}

export type VendorKeyModelId =
  | 'minimax'
  | 'qwen'
  | 'doubao'
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'kimi'

/** 各厂商 Key；含内置目录及自定义 slug */
export type RegistryVendorKeys = Partial<Record<string, string>>

export type RegistryAiModels = {
  textModel: string
  imageModel: string
  updatedAt: string
  lastWriter: 'erp' | 'ops'
  /** 运营台保存过模型或 Key 后为 true，ERP 仅拉取不下发覆盖 */
  controlledByOps: boolean
}

export type RecruitmentOrderKind = 'recruitment' | 'recruitment_ice'

export type RecruitmentFulfillmentLoop = 'open' | 'closed'

export type MpApplicantTaskStatus =
  | 'applied'
  | 'pending_confirm'
  | 'confirmed'
  | 'rejected'
  | 'shortlisted'
  | 'approved'

export type MpRecruitmentHall = 'normal' | 'urgent' | 'ice'

export type RegistryIceVideoSlot = {
  slotId: string
  label: string
  downloadUrl: string
  iceJobId?: string
  assignedApplicantId?: string
  assignedAt?: string
  /** 剪辑师回传的成片链接（edit_ice 阶段一） */
  deliverUrl?: string
  deliverStatus?: 'pending' | 'passed' | 'rejected'
}

export type KolTierKey = 'v3' | 'v4' | 'v5' | 'v5plus'

/** 与 recruitmentNoviceAllocationAi.KolTierStrategy 保持一致（勿从 src/services 导入，避免 api 编译链污染） */
export type KolTierStrategy = 'more_v3' | 'more_v4' | 'more_v5'

export type RecruitmentTierPlan = {
  feeType: 'tier' | 'fixed'
  totalHeadcount: number
  budgetYuan: number
  city: string
  tiers: Partial<Record<KolTierKey, { count: number; unitPriceYuan: number }>>
  fixedPriceYuan?: number
  strategy?: KolTierStrategy
  source?: 'library' | 'ai' | 'fallback'
  costHint?: string
}

export type RecruitmentWorkflowStage =
  | 'submitted'
  | 'recruiting'
  | 'selecting'
  | 'group_notify'
  | 'scheduling'
  | 'video_review'
  | 'payment_pending'
  | 'payment_ops'
  | 'completed'

export type RecruitmentScheduleMeta = {
  visitStart?: string
  visitEnd?: string
  visitSlots?: string[]
  mealCount?: number
  tableSize?: number
  shareTable?: boolean
  scheduleConfirmedAt?: string
  scheduleSentAt?: string
}

export type RecruitmentPaymentState =
  | 'none'
  | 'awaiting_merchant_confirm'
  | 'awaiting_ops_paid'
  | 'paid'

/** 林客定向计划 · 达人结算费用（PR 发单按一口价/阶梯/自报价抓取） */
export type CpsTalentSettlement = {
  applicantId: string
  douyinId: string
  displayName?: string
  settlementFeeYuan: number
  commissionPct: number
}

/** 服务商版 / PR 星选：灵祺招募单 ↔ 抖音林客 CPS 定向计划联动 */
export type RecruitmentCpsLinkage = {
  provider: 'douyin'
  planType: 'video_oriented'
  planId?: string
  productIds: string[]
  douyinIds: string[]
  commissionRatePct: number
  commissionDurationDays: number
  merchantPhone?: string
  /** 林客商家账户 ID（PR 挂接客户商家时写入） */
  linkeMerchantAccountId?: string
  linkeMerchantDisplayName?: string
  /** 各达人结算费用（回传林客前在星选侧记录，供 PR 林客端结算） */
  talentSettlements?: CpsTalentSettlement[]
  /** 全部达人回传视频后提醒 PR 进行林客结算 */
  linkeSettlementReminderAt?: string
  linkeSettlementDone?: boolean
  syncStatus: 'none' | 'pending' | 'synced' | 'partial' | 'failed'
  lastSyncAt?: string
  lastError?: string
}

/** PR 发单：是否挂接抖音林客商家（mpPublishMeta.linkeLinkage） */
export type MpLinkeLinkage = {
  enabled: boolean
  clientId: string
  merchantAccountId: string
  merchantDisplayName: string
  productIds?: string[]
  merchantPhone?: string
}

/** 达人招募订单（dev 注册表，供运营管控台列表与 ERP 提需对齐） */
export type RegistryRecruitmentOrder = {
  id: string
  /** Supabase tenants.id：商户端按租户过滤招募单，避免注册表全局快照串数据 */
  tenantId?: string
  /** 创建人 auth user id（可选，便于审计） */
  ownerUserId?: string
  customerName: string
  storeName: string
  talentId: string
  talentName: string
  fans: number
  accountType: string
  coopTimes: number
  createdAt: string
  status: 'pending' | 'accepted' | 'done' | 'cancelled' | 'refunded'
  serviceAmount: number
  commissionPct: number
  netAmount: number
  storeAddress: string
  category: string
  /** 提需摘要（招募名、Brief 节选等） */
  infoSummary?: string
  orderKind?: RecruitmentOrderKind
  acceptMode?: 'manual' | 'miniprogram' | 'ice'
  linkedMpOrderId?: string
  recruitmentPlatform?: '抖音' | '小红书' | '大众点评' | '快手' | '微信视频号'
  iceVideoCount?: number
  iceVideoSlots?: RegistryIceVideoSlot[]
  fulfillmentLoop?: RecruitmentFulfillmentLoop
  autoPublishMp?: boolean
  /** 星选闭环阶段（商家 ERP 主流程） */
  workflowStage?: RecruitmentWorkflowStage
  /** AI 阶梯/一口价招募方案 */
  tierPlan?: RecruitmentTierPlan
  scheduleMeta?: RecruitmentScheduleMeta
  paymentState?: RecruitmentPaymentState
  /** 服务商版：林客 CPS 定向计划同步状态（仅抖音招募） */
  cpsLinkage?: RecruitmentCpsLinkage
}

export type RegistryMpRecruitmentApplicant = {
  id: string
  name: string
  platform: string
  platformAccount?: string
  platformNickname?: string
  followers: number
  douyinSalesLevel?: string
  contact: string
  wechatId?: string
  quotePrice?: string
  visitTimeSlot?: string
  alipayAccount?: string
  intro?: string
  profileLink?: string
  paymentMethod?: string
  mpOrderId?: string
  merchantOrderNo?: string
  /** 小程序 openid（报名写入，用于 inbox / 群码匹配） */
  wxOpenId?: string
  appliedAt: string
  province?: string
  city?: string
  gender?: string
  accountTags?: string[]
  assignedIceSlotId?: string
  /** 剪辑师认领条数（edit_ice） */
  claimedSlotCount?: number
  /** 认领锁定的成片位 id 列表 */
  assignedIceSlotIds?: string[]
  assignedVideoLabel?: string
  assignedVideoDownloadUrl?: string
  /** 剪辑师批量回传的成片链接 */
  editDeliverLinks?: string[]
  douyinPublishUrl?: string
  aiVerifyStatus?: 'pending' | 'passed' | 'failed'
  aiVerifyNote?: string
  completedAt?: string
  taskStatus?: MpApplicantTaskStatus
  /** 拒绝/超时释放原因 */
  rejectReason?: string
  /** PR 已确认选择该报名 */
  prSelected?: boolean
  /** 商家 ERP 反选 */
  merchantSelected?: boolean
  kolTier?: KolTierKey
  groupJoinStatus?: 'pending' | 'confirmed' | 'joined'
  /** 达人确认入选后愿意配合探店（档期意向） */
  scheduleConfirmedAt?: string
  /** PR/AI 安排的探店时间，如 2026/6/15 17:00-20:00 */
  assignedVisitAt?: string
  assignedVisitStore?: string
  tableNote?: string
  tableGroupId?: string
  scheduleAssignedAt?: string
  scheduleAssignedBy?: 'manual' | 'ai'
  visitAssignmentStatus?: 'talent_preferred' | 'pr_draft' | 'pending_talent_confirm' | 'confirmed' | 'declined'
  visitAssignmentDeclineReason?: string
  visitAssignmentConfirmedAt?: string
  /** PR 修改已生效排期后标记，达人需重新调整 */
  visitScheduleRevisedAt?: string
  /** 达人自填探店意向（日期+时段），PR 排期前 */
  talentPreferredVisitAt?: string
  talentVisitPlanAt?: string
  talentVisitUpdatedAt?: string
  visitCheckInAt?: string
  visitCheckInMethod?: string
  visitStatus?: 'pending_assign' | 'scheduled' | 'checked_in' | 'no_show' | 'completed'
  videoUrl?: string
  videoStatus?: 'draft' | 'pending' | 'passed' | 'rejected'
  videoRejectReason?: string
  videoSubmittedAt?: string
  /** 累计提交次数（含首次上传与驳回后重传） */
  videoSubmitCount?: number
  /** 探店文稿（小红书/大众点评）：文件 URL 或外链 */
  scriptUrl?: string
  scriptLinkUrl?: string
  scriptFileName?: string
  scriptStatus?: 'draft' | 'pending' | 'passed' | 'rejected'
  scriptRejectReason?: string
  scriptSubmittedAt?: string
  scriptSubmitCount?: number
  talentMemberId?: string
  /** 报名截止后达人申请取消：pending 待 PR 审核 / rejected 已驳回 */
  cancelRequestStatus?: 'pending' | 'rejected'
  cancelRequestedAt?: string
  cancelRequestReviewedAt?: string
  cancelRequestRejectReason?: string
  /** 星选增值：履约时间线（系统事件 + 手动备注） */
  fulfillmentTimeline?: MpFulfillmentTimelineEvent[]
}

/** 星选增值 · 商单订阅偏好（达人/团队） */
export type MpOrderSubscriptionPrefs = {
  enabled: boolean
  platforms: string[]
  cities: string[]
  categories: string[]
  budgetMin?: number
  budgetMax?: number
  urgentOnly?: boolean
  updatedAt: string
}

/** 星选增值 · PR 合作达人池条目 */
export type MpCooperationPoolEntry = {
  id: string
  talentMemberId?: string
  lingqiTalentId?: string
  talentLibraryId?: string
  displayName: string
  platform?: string
  platformAccount?: string
  avatarUrl?: string
  tags: string[]
  note?: string
  lastCoopAt?: string
  addedAt: string
}

/** 星选增值 · PR 团队黑/灰名单条目（团队内共享） */
export type MpTalentWatchlistEntry = {
  id: string
  talentMemberId?: string
  lingqiTalentId?: string
  platformAccount?: string
  wxOpenId?: string
  displayName: string
  platform?: string
  reason?: string
  addedAt: string
  addedBy?: string
}

/** 星选增值 · 结构化 Brief */
export type MpBriefStructured = {
  visitDate?: string
  visitTime?: string
  storeAddress?: string
  deliverables?: string[]
  forbidden?: string[]
  referenceLinks?: string[]
  notes?: string
}

/** 星选增值 · PR Brief 模版 */
export type MpBriefTemplate = {
  id: string
  title: string
  brief: MpBriefStructured
  bodyMarkdown?: string
  createdAt: string
  updatedAt: string
}

/** 星选增值 · 履约时间线事件 */
export type MpFulfillmentTimelineEvent = {
  at: string
  stage: string
  label: string
  note?: string
}

export type RegistryTalentLibraryEntry = {
  id: string
  /** 灵祺固定达人身份 ID（LQ-D-xxxxxx） */
  lingqiTalentId?: string
  platform: '抖音' | '小红书' | '大众点评' | '快手' | '微信视频号'
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  douyinSalesLevel?: string
  contact: string
  wechatId: string
  quotePrice: string
  paymentMethod: string
  alipayAccount?: string
  visitTimeSlot?: string
  updatedAt: string
  lastMpOrderId?: string
  lastMerchantOrderNo?: string
  province?: string
  city?: string
  gender?: string
  accountTags?: string[]
  /** 运营台开通：增值服务 / 推荐大厅 + 单项权限覆盖 */
  mpFeatureAccess?: {
    addons?: boolean
    recommendHall?: boolean
    overrides?: Record<string, boolean | number | string>
  }
  /** 本月套餐配额用量（分钟/次数） */
  mpQuotaUsageMonth?: string
  mpQuotaUsage?: Record<string, number>
  /** 星选会员档位（运营台维护，默认 basic） */
  mpMembershipPlan?: 'basic' | 'pro' | 'flagship' | 'enterprise'
  /** 星选会员到期时间（ISO；支付续费可叠加） */
  mpMembershipExpiresAt?: string
  /** AI 积分余额（套餐 + 充值合计，与双桶同步） */
  mpAiPointsBalance?: number
  /** 套餐赠送额度余额（会员月赠 / 升级即时到账） */
  mpAiPointsPackageBalance?: number
  /** 充值积分余额 */
  mpAiPointsRechargeBalance?: number
  /** 已发放赠送积分的自然月 YYYY-MM（上海时区） */
  mpAiPointsGiftMonth?: string
  /** 本自然月已累计发放至套餐桶的赠送积分（含升级补差） */
  mpAiPointsMonthlyGiftGranted?: number
  /** 推荐大厅只读补全，不落库 */
  avatarUrl?: string
}

/** 达人招募小程序 · 单平台资料（抖音/小红书） */
export type RegistryMpTalentPlatformProfile = {
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  douyinSalesLevel?: string
  quotePrice: string
  alipayAccount: string
  accountTags?: string[]
}

/** 拍摄/剪辑团队扩展资料（小程序与履约 Web 共用） */
export type RegistrySupplierTeamProfile = {
  teamName?: string
  entityType?: 'personal' | 'studio' | 'company'
  teamSize?: string
  experienceYears?: string
  dailyCapacity?: string
  intro?: string
  categoryTags?: string[]
  shootTypes?: string[]
  equipment?: string[]
  editTypes?: string[]
  editStyles?: string[]
  software?: string[]
  portfolioLink?: string
  halfDayQuote?: string
  fullDayQuote?: string
  perClipQuote?: string
  travelRule?: string
  packageLevel?: string
  urgentRule?: string
  acceptsIce?: boolean
}

/** 达人给指定 PR 的专属报价 */
export type RegistryMpTalentPrExclusiveQuote = {
  prLingqiId: string
  prRegistryId?: string
  prDisplayName?: string
  platform: string
  quoteYuan: number
  note?: string
  updatedAt: string
}

/** 平台参考价（来客/林客/手动） */
export type RegistryMpTalentPlatformReferenceQuote = {
  platform: string
  source: 'manual' | 'laike' | 'linke'
  quoteYuan?: number
  quoteText?: string
  syncedAt?: string
}

/** 达人招募小程序 · 灵祺达人会员 */
export type RegistryMpTalentMember = {
  id: string
  /** 灵祺固定达人身份 ID（LQ-D-xxxxxx），填写平台资料后分配 */
  lingqiTalentId?: string
  memberType: 'douyin' | 'xiaohongshu' | 'both'
  wxNickName: string
  wxAvatarUrl: string
  wxOpenId?: string
  /** 微信开放平台 unionid（小程序与服务号同主体时可用） */
  wxUnionId?: string
  /** 已绑定的微信服务号 openid（带参二维码关注） */
  wxOaOpenId?: string
  wxOaBoundAt?: string
  contact: string
  wechatId: string
  province?: string
  city?: string
  workIdentity?: 'talent' | 'shoot' | 'edit'
  lingqiShootTeamId?: string
  lingqiEditTeamId?: string
  accountTags?: string[]
  supplierProfile?: RegistrySupplierTeamProfile
  douyin?: RegistryMpTalentPlatformProfile
  xiaohongshu?: RegistryMpTalentPlatformProfile
  /** 履约 Web / 小程序多平台资料（优先于 douyin / xiaohongshu） */
  platformProfiles?: Record<
    string,
    RegistryMpTalentPlatformProfile & { enabled?: boolean; talentGrade?: string }
  >
  alipayAccount?: string
  gender?: string
  /** 运营台开通：增值服务 / 推荐大厅 + 单项权限覆盖 */
  mpFeatureAccess?: {
    addons?: boolean
    recommendHall?: boolean
    overrides?: Record<string, boolean | number | string>
  }
  /** 本月套餐配额用量（分钟/次数） */
  mpQuotaUsageMonth?: string
  mpQuotaUsage?: Record<string, number>
  /** 星选会员档位（运营台维护，默认 basic） */
  mpMembershipPlan?: 'basic' | 'pro' | 'flagship' | 'enterprise'
  /** 星选会员到期时间（ISO；支付续费可叠加） */
  mpMembershipExpiresAt?: string
  /** AI 积分余额（合计） */
  mpAiPointsBalance?: number
  /** 套餐赠送额度余额 */
  mpAiPointsPackageBalance?: number
  /** 充值积分余额 */
  mpAiPointsRechargeBalance?: number
  /** 已发放赠送积分的自然月 YYYY-MM */
  mpAiPointsGiftMonth?: string
  /** 本自然月已累计发放至套餐桶的赠送积分 */
  mpAiPointsMonthlyGiftGranted?: number
  /** 达人给指定 PR 的专属报价 */
  prExclusiveQuotes?: RegistryMpTalentPrExclusiveQuote[]
  /** 平台参考价（来客/林客/手动） */
  platformReferenceQuotes?: RegistryMpTalentPlatformReferenceQuote[]
  /** 星选增值：商单订阅（城市/品类/预算提醒） */
  orderSubscription?: MpOrderSubscriptionPrefs
  registeredAt: string
  updatedAt: string
}

export type RegistrySupplierTeamLibraryEntry = {
  id: string
  memberId?: string
  lingqiTeamId?: string
  lingqiTalentId?: string
  teamType: 'shoot' | 'edit'
  wxNickName: string
  wxAvatarUrl?: string
  contact: string
  wechatId: string
  province?: string
  city?: string
  platform?: '抖音' | '小红书'
  platformAccount?: string
  platformNickname?: string
  accountTags?: string[]
  sourceChannel?: 'mp' | 'web'
  updatedAt: string
}

/** 达人招募小程序 · PR 用户（机构/个人发单方） */
export type RegistryMpPrUser = {
  id: string
  /** 灵祺固定 PR 身份 ID（LQ-P-xxxxxx） */
  lingqiPrId: string
  accountType: 'company' | 'personal'
  companyName?: string
  personalName?: string
  contactName?: string
  contactPhone?: string
  wechatId?: string
  province?: string
  city?: string
  intro?: string
  wxNickName?: string
  wxAvatarUrl?: string
  wxOpenId?: string
  /** 登录平台账号：小程序=微信 openid，履约 Web=手机号；用于锁死灵祺 PRID */
  platformAccount?: string
  /** mp=小程序微信登录；web=履约 Web 手机登录 */
  sourceChannel?: 'mp' | 'web'
  registeredAt: string
  updatedAt: string
  /** 运营台开通：增值服务 / 推荐大厅 + 单项权限覆盖 */
  prFeatureAccess?: {
    addons?: boolean
    recommendHall?: boolean
    overrides?: Record<string, boolean | number | string>
  }
  /** 本月套餐配额用量（分钟/次数） */
  mpQuotaUsageMonth?: string
  mpQuotaUsage?: Record<string, number>
  /** 星选会员档位（运营台维护，默认 basic） */
  mpMembershipPlan?: 'basic' | 'pro' | 'flagship' | 'enterprise'
  /** 星选会员到期时间（ISO；支付续费可叠加） */
  mpMembershipExpiresAt?: string
  /** AI 积分余额（合计） */
  mpAiPointsBalance?: number
  /** 套餐赠送额度余额 */
  mpAiPointsPackageBalance?: number
  /** 充值积分余额 */
  mpAiPointsRechargeBalance?: number
  /** 已发放赠送积分的自然月 YYYY-MM */
  mpAiPointsGiftMonth?: string
  /** 本自然月已累计发放至套餐桶的赠送积分 */
  mpAiPointsMonthlyGiftGranted?: number
  /** 星选增值：合作达人池 */
  cooperationPool?: MpCooperationPoolEntry[]
  /** 星选增值：Brief 模版库 */
  briefTemplates?: MpBriefTemplate[]
  /** 星选增值：团队黑名单（报名拦截） */
  talentBlacklist?: MpTalentWatchlistEntry[]
  /** 星选增值：团队灰名单（审核警示，不拦截报名） */
  talentGraylist?: MpTalentWatchlistEntry[]
}

export type RegistryMpRecruitmentOrder = {
  id: string
  sourceMerchantOrderId: string
  customerName: string
  storeName: string
  merchantRequirements: string
  status: 'open' | 'collecting' | 'pending_settlement' | 'closed' | 'done'
  createdAt: string
  updatedAt: string
  applicants?: RegistryMpRecruitmentApplicant[]
  /** 可选：部分接口写入的报名计数（有 applicants 时以 applicants 为准） */
  applicantCount?: number
  /** 累计浏览次数（大厅热度） */
  viewCount?: number
  orderKind?: RecruitmentOrderKind
  hall?: MpRecruitmentHall
  iceVideoSlots?: RegistryIceVideoSlot[]
  title?: string
  recruitmentInfo?: string
  taskDetail?: string
  platform?: string
  fansRequirement?: string
  budgetText?: string
  recruitCount?: number
  region?: string
  category?: string
  serviceAmount?: number
  /** 急单大厅展示 */
  urgent?: boolean
  fulfillmentLoop?: RecruitmentFulfillmentLoop
  /** 报名截止（发招募写入） */
  deadline?: string
  /** PR 反选达人 applicant.id 列表 */
  selectedApplicantIds?: string[]
  /** PR 已发送入选通知的 applicant.id 列表（写入 registry，不依赖 hall inbox 切片） */
  notifiedApplicantIds?: string[]
  /** PR 上传的项目群二维码（data URL 或 https） */
  groupQrImage?: string
  /** 剪辑云剪：剪辑师进群二维码（认领后下发，大厅脱敏） */
  editGroupQrImage?: string
  /** 招募单封面（data URL、https 或图库路径）；分享卡片用 */
  coverImage?: string
  /** 报名截止满 7 天后自动清理群码时写入 */
  groupQrClearedAt?: string
  mpPublishMeta?: Record<string, unknown>
  /** PR 星选：林客 CPS 定向计划同步（通知满员后自动创建） */
  cpsLinkage?: RecruitmentCpsLinkage
  /** pr：小程序发招募；merchant：商家/运营后台同步 */
  publisherIdentity?: 'pr' | 'merchant'
  /** 星选增值：结构化 Brief（与 recruitmentInfo 并存，不替代） */
  briefStructured?: MpBriefStructured
}

/** 达人招募小程序 · 站内信（registry 同步，达人端拉取） */
export type RegistryMpTalentInboxItem = {
  id: string
  talentMemberId: string
  title: string
  body: string
  category: 'order' | 'business' | 'system'
  mpOrderId?: string
  /** 与报名手机号一致时达人端可匹配（无会员 id 时） */
  contact?: string
  platformAccount?: string
  applicantId?: string
  /** 群二维码等附图（与 body 一并展示） */
  imageUrl?: string
  noticeType?: 'selection' | 'general' | 'video_reject' | 'script_reject' | 'schedule' | 'ops_broadcast'
  /** 运营台批量公告 id */
  announcementId?: string
  pinned?: boolean
  createdAt: string
  read?: boolean
}

/** 运营台 → 达人小程序公告发送记录 */
export type RegistryMpOpsAnnouncement = {
  id: string
  title: string
  body: string
  showHomePopup: boolean
  targetFilter: Record<string, unknown>
  recipientCount: number
  createdAt: string
  createdBy?: string | null
}

/** 管控台回传解析后的达人候选，供 ERP 达人池展示 */
export type RegistryTalentPoolRow = {
  id: string
  name: string
  platform: string
  contentFormat: string
  status: 'pending_confirm' | 'confirmed' | 'rejected' | 'communicating'
  followers: number
  niche: string
  baseFee: number
  bonus: number
  schedulingConflict?: boolean
  /** 运营台「已接单」上传招募表时写入，供 ERP 达人池按订单筛选 */
  sourceRecruitmentOrderId?: string
}

/** AI 排期结果（dev 注册表，ERP 与管控台共用） */
export type RegistryScheduleRow = {
  id: string
  time: string
  talentName: string
  storeName: string
  tableNote: string
  applicantId?: string
  mpOrderId?: string
  recruitmentOrderId?: string
}

/** 达人视频审核（dev 注册表，由 API/上传同步写入） */
export type RegistryVideoSubmission = {
  id: string
  author: string
  title: string
  status: 'pending' | 'passed' | 'rejected'
  submittedAt: string
  aiNote: string
  thumbUrl?: string
  duration?: string
  applicantId?: string
  mpOrderId?: string
  recruitmentOrderId?: string
  rejectReason?: string
  videoUrl?: string
}

export type RegistryMpMembershipCheckoutRequest = {
  id: string
  role: 'pr' | 'talent' | 'shoot' | 'edit'
  accountId: string
  lingqiId?: string
  /** PR 用户 id / 达人库 id / 团队库 id，支付成功后写 mpMembershipPlan */
  registryTargetId?: string
  displayName?: string
  planId: string
  billing: 'monthly' | 'yearly'
  amountCents: number
  channel: 'wechat' | 'alipay' | 'douyin'
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  /** 在线支付商户单号 */
  outTradeNo?: string
  payMode?:
    | 'manual'
    | 'wechat_native'
    | 'wechat_jsapi'
    | 'alipay_precreate'
    | 'alipay_page'
    | 'douyin_request_order'
    | 'douyin_native'
  wechatPrepayId?: string
  wechatTransactionId?: string
  alipayTradeNo?: string
  douyinOrderId?: string
  paidAt?: string
}

/** 星选平台积分充值订单（微信 / 支付宝 / 抖音 / 手动申报） */
export type RegistryMpPointsCheckoutRequest = {
  id: string
  role: 'pr' | 'talent' | 'shoot' | 'edit'
  accountId: string
  lingqiId?: string
  displayName?: string
  /** 注册表目标 id（PR 用户 id / 达人库 id / 团队库 id） */
  registryTargetId?: string
  /** 充值积分数量 */
  points: number
  amountCents: number
  channel: 'wechat' | 'alipay' | 'douyin'
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  outTradeNo?: string
  payMode?:
    | 'manual'
    | 'wechat_native'
    | 'wechat_jsapi'
    | 'alipay_precreate'
    | 'alipay_page'
    | 'douyin_native'
  wechatPrepayId?: string
  wechatTransactionId?: string
  alipayTradeNo?: string
  douyinOrderId?: string
  paidAt?: string
}

/** 星选 AI 积分消耗流水（幂等键 / 审计） */
export type RegistryMpAiPointsSpendEntry = {
  id: string
  accountId: string
  idempotencyKey?: string
  kind:
    | 'video'
    | 'article'
    | 'brief'
    | 'mix_material_analyze'
    | 'shortvideo'
    | 'cloud_edit'
    | 'cloud_edit_smart'
    | 'digital_human'
    | 'visual_studio_copy'
    | 'visual_studio_image'
    | 'visual_studio_image_pro'
    | 'product_plan'
    | 'ops_plan'
    | 'agent_image'
    | 'recruitment_ai'
    | 'goods_ai'
    | 'ad_ai'
    | 'review_ai'
  points: number
  balanceAfter: number
  createdAt: string
  note?: string
  /** 本次消耗的套餐配额键（如 ai_compliance_video） */
  quotaKey?: string
  /** 本次消耗的套餐额度（视频为分钟，文稿为次数） */
  quotaUnitsUsed?: number
}

/** 星选 AI 合规检核记录（文稿/短视频） */
export type RegistryMpComplianceReviewRecord = {
  id: string
  accountId: string
  idempotencyKey?: string
  mode: 'video' | 'script'
  label: string
  platform: string
  verdict: string
  statusText: string
  statusTone: string
  detail: string
  resultJson: string
  pointsCharged?: number
  createdAt: string
}

/** 商单群聊消息（小程序内群，非微信外部群） */
export type RegistryMpOrderGroupChatMessage = {
  id: string
  fromParticipantKey: string
  fromName: string
  type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'file'
  text?: string
  mediaUrl?: string
  durationSec?: number
  latitude?: number
  longitude?: number
  locationName?: string
  fileName?: string
  mentionKeys?: string[]
  ts: number
}

/** 商单群聊会话 */
export type RegistryMpOrderGroupChat = {
  id: string
  mpOrderId: string
  title: string
  createdAt: string
  status: 'active' | 'closed'
  closedAt?: string
  closeReason?: string
  memberParticipantKeys: string[]
  memberNames: Record<string, string>
  messages: RegistryMpOrderGroupChatMessage[]
  lastMessageAt?: string
}

/** 星选爆款 Brief 生成记录 */
export type RegistryMpBriefGenRecord = {
  id: string
  accountId: string
  idempotencyKey?: string
  orderId: string
  orderTitle: string
  platform: string
  style: string
  outputMode: string
  resultJson: string
  fullMarkdown: string
  createdAt: string
}

export type RegistryFile = {
  tenants: RegistryTenant[]
  aiModels: RegistryAiModels
  /** 各厂商 API Key（dev 落盘，生产勿提交仓库） */
  vendorKeys: RegistryVendorKeys
  vendorKeysUpdatedAt: string
  vendorKeysWriter: 'erp' | 'ops'
  /** 磁盘：仅追加型自定义厂商列表；网关 GET 会与内置目录合并写入此字段再给前端 */
  aiVendorCatalog?: AiVendorCatalogEntry[]
  /** 短视频/视频模型网关（运营台「AI模型」专区） */
  videoAi?: RegistryVideoAi
  videoAiUpdatedAt?: string
  videoAiWriter?: 'erp' | 'ops'
  recruitmentOrders?: RegistryRecruitmentOrder[]
  mpRecruitmentOrders?: RegistryMpRecruitmentOrder[]
  /** 群二维码 side map（订单体脱敏后仅存 orderId → https URL） */
  mpGroupQrByOrderId?: Record<string, string>
  /** 小程序商单群聊（PR 一键拉群） */
  mpOrderGroupChats?: RegistryMpOrderGroupChat[]
  mpTalentInbox?: RegistryMpTalentInboxItem[]
  /** 运营台 → 达人小程序批量公告发送记录 */
  mpOpsAnnouncements?: RegistryMpOpsAnnouncement[]
  mpTalentMembers?: RegistryMpTalentMember[]
  mpPrUsers?: RegistryMpPrUser[]
  /** 达人版会员权限版本（运营台可编辑权限项与定价） */
  talentMembershipPlanVersions?: import('./mpMembershipCatalog.js').MpMembershipPlanVersion[]
  /** PR 版会员权限版本（运营台可编辑权限项与定价） */
  prMembershipPlanVersions?: import('./mpMembershipCatalog.js').MpMembershipPlanVersion[]
  /** 拍摄团队版会员权限版本 */
  shootMembershipPlanVersions?: import('./mpMembershipCatalog.js').MpMembershipPlanVersion[]
  /** 剪辑团队版会员权限版本 */
  editMembershipPlanVersions?: import('./mpMembershipCatalog.js').MpMembershipPlanVersion[]
  /** 星选平台会员开通支付申报（待运营确认） */
  mpMembershipCheckoutRequests?: RegistryMpMembershipCheckoutRequest[]
  /** 星选平台积分充值订单 */
  mpPointsCheckoutRequests?: RegistryMpPointsCheckoutRequest[]
  /** 星选 AI 积分消耗流水 */
  mpAiPointsSpendLedger?: RegistryMpAiPointsSpendEntry[]
  /** 星选爆款 Brief 生成记录（近 7 天） */
  mpBriefGenRecords?: RegistryMpBriefGenRecord[]
  /** 星选 AI 合规检核记录（近 7 天） */
  mpComplianceReviewRecords?: RegistryMpComplianceReviewRecord[]
  talentLibraryEntries?: RegistryTalentLibraryEntry[]
  shootTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  editTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  talentPoolCandidates?: RegistryTalentPoolRow[]
  recruitmentScheduleRows?: RegistryScheduleRow[]
  recruitmentVideoSubmissions?: RegistryVideoSubmission[]
  helpManualCategories?: RegistryHelpManualCategory[]
  helpManualArticles?: RegistryHelpManualArticle[]
  teamIntro?: RegistryTeamIntro
  /** 平台装修：活动海报弹窗 / 页面广告位 */
  platformDecoration?: import('./platformDecorTypes.js').RegistryPlatformDecoration
  /** 抖音带货等级月度重置标记（YYYY-MM，每月 6 日上海时区） */
  douyinSalesLevelResetYm?: string
  /** 达人平台链接月度自动解析完成标记（YYYY-MM，每月 5 日上海时区） */
  talentProfileLinkRefreshYm?: string
  /** 月度解析断点：当前 member 下标（与 talentProfileLinkRefreshCursorYm 配套） */
  talentProfileLinkRefreshCursor?: number
  talentProfileLinkRefreshCursorYm?: string
  /** 服务号绑定 ticket（短期，关注回调后标记 bound） */
  mpWechatOaBindTickets?: Array<{
    ticket: string
    talentMemberId: string
    createdAt: string
    expiresAt: string
    status: 'pending' | 'bound' | 'expired'
    oaOpenId?: string
    boundAt?: string
  }>
  /** 达人 talentMemberId ↔ 服务号 openid 绑定表 */
  mpWechatOaBindings?: Array<{
    talentMemberId: string
    oaOpenId: string
    mpOpenId?: string
    boundAt: string
    active?: boolean
    unboundAt?: string
  }>
  /** 渠道分销 · 全局策略与 P1/P2 数据（注册表扩展） */
  distributionPolicy?: import('./distributionRegistryTypes.js').RegistryDistributionPolicy
  distributionAffiliates?: import('./distributionRegistryTypes.js').RegistryDistributionAffiliate[]
  distributionPartnerChannels?: import('./distributionRegistryTypes.js').RegistryDistributionPartnerChannel[]
  distributionWithdrawRequests?: import('./distributionRegistryTypes.js').RegistryDistributionWithdrawRequest[]
  distributionSettlementBatches?: import('./distributionRegistryTypes.js').RegistryDistributionSettlementBatch[]
  distributionWallets?: import('./distributionRegistryTypes.js').RegistryDistributionWallet[]
  distributionAttributions?: import('./distributionRegistryTypes.js').RegistryDistributionAttribution[]
}

export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment' | 'mp'

export type RegistryHelpManualCategory = {
  id: string
  edition: HelpManualEdition
  title: string
  sortOrder: number
  parentId?: string
}

export type RegistryHelpManualArticle = {
  id: string
  edition: HelpManualEdition
  categoryId: string
  title: string
  body: string
  sortOrder: number
  updatedAt: string
}

export type RegistryTeamIntro = {
  subtitle?: string
  paragraphs: string[]
  updatedAt: string
}

/** 与 `RegistryFile` 同构：注册表快照读写（Supabase ops_registry_snapshot） */
export type RegistrySnapshot = RegistryFile

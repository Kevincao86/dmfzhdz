export type RegistryTenantSource = 'erp' | 'ops_manual'

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
  recruitmentPlatform?: '抖音' | '小红书'
  iceVideoCount?: number
  iceVideoSlots?: RegistryIceVideoSlot[]
  fulfillmentLoop?: RecruitmentFulfillmentLoop
  autoPublishMp?: boolean
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
  appliedAt: string
  province?: string
  city?: string
  assignedIceSlotId?: string
  assignedVideoLabel?: string
  assignedVideoDownloadUrl?: string
  douyinPublishUrl?: string
  aiVerifyStatus?: 'pending' | 'passed' | 'failed'
  aiVerifyNote?: string
  completedAt?: string
  taskStatus?: MpApplicantTaskStatus
}

export type RegistryTalentLibraryEntry = {
  id: string
  /** 灵祺固定达人身份 ID（LQ-D-xxxxxx） */
  lingqiTalentId?: string
  platform: '抖音' | '小红书'
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

/** 达人招募小程序 · 灵祺达人会员 */
export type RegistryMpTalentMember = {
  id: string
  /** 灵祺固定达人身份 ID（LQ-D-xxxxxx），填写平台资料后分配 */
  lingqiTalentId?: string
  memberType: 'douyin' | 'xiaohongshu' | 'both'
  wxNickName: string
  wxAvatarUrl: string
  wxOpenId?: string
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
  registeredAt: string
  updatedAt: string
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
  /** PR 上传的项目群二维码（data URL 或 https） */
  groupQrImage?: string
  /** 报名截止满 7 天后自动清理群码时写入 */
  groupQrClearedAt?: string
  mpPublishMeta?: Record<string, unknown>
  /** pr：小程序发招募；merchant：商家/运营后台同步 */
  publisherIdentity?: 'pr' | 'merchant'
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
  noticeType?: 'selection' | 'general'
  pinned?: boolean
  createdAt: string
  read?: boolean
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
  mpTalentInbox?: RegistryMpTalentInboxItem[]
  mpTalentMembers?: RegistryMpTalentMember[]
  mpPrUsers?: RegistryMpPrUser[]
  talentLibraryEntries?: RegistryTalentLibraryEntry[]
  shootTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  editTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  talentPoolCandidates?: RegistryTalentPoolRow[]
  recruitmentScheduleRows?: RegistryScheduleRow[]
  recruitmentVideoSubmissions?: RegistryVideoSubmission[]
}

/** 与 `RegistryFile` 同构：注册表快照读写（Supabase ops_registry_snapshot） */
export type RegistrySnapshot = RegistryFile

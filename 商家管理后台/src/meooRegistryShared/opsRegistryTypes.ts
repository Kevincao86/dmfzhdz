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
  /**
   * 可选：方舟视频专用 Key。留空时 ERP dev 服务端会回退注册表 vendorKeys.doubao
   * 或服务端 MERCHANT_AI_DOUBAO_KEY（按合并策略）。
   */
  arkVideoApiKey?: string
}

/** 运营台可扩展的 AI 供应商目录项（磁盘仅存非内置条目，GET 网关会合并内置目录后再返回）。 */
export type AiVendorCatalogEntry = {
  id: string
  label: string
  hint?: string
  /** 可选：HTTPS 图床地址，或商户 ERP 同域相对路径（如 `/ai-vendors/foo.svg`） */
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

/** 达人招募订单（dev 注册表，供运营管控台列表与 ERP 提需对齐） */
export type RegistryRecruitmentOrder = {
  id: string
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
  /** 运营接单方式：手动表格 / 小程序招募 */
  acceptMode?: 'manual' | 'miniprogram'
  /** 关联的小程序招募单号（acceptMode=miniprogram 时写入） */
  linkedMpOrderId?: string
  /** 下发小程序招募的平台（抖音 / 小红书） */
  recruitmentPlatform?: '抖音' | '小红书'
}

/** 小程序达人招募单（运营「小程序招募」接单后生成，供达人端小程序展示与报名） */
export type RegistryMpRecruitmentApplicant = {
  id: string
  /** 兼容旧数据：等同 platformNickname */
  name: string
  platform: string
  /** 抖音/小红书号 */
  platformAccount?: string
  /** 抖音/小红书昵称 */
  platformNickname?: string
  followers: number
  /** 带货等级（抖音） */
  douyinSalesLevel?: string
  /** 联系方式（手机等） */
  contact: string
  wechatId?: string
  /** 报价，如 ¥150 */
  quotePrice?: string
  /** 探店时间段，精确到小时，如 2026-05-20 14:00-16:00 */
  visitTimeSlot?: string
  /** 支付宝账号（结算） */
  alipayAccount?: string
  intro?: string
  profileLink?: string
  paymentMethod?: string
  mpOrderId?: string
  merchantOrderNo?: string
  appliedAt: string
  province?: string
  city?: string
}

/** 墨典达人库（按平台+达人ID去重，报价等取最新报名） */
export type RegistryTalentLibraryEntry = {
  id: string
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

export type RegistryMpTalentPlatformProfile = {
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  douyinSalesLevel?: string
  quotePrice: string
  alipayAccount: string
}

export type RegistryMpTalentMember = {
  id: string
  memberType: 'douyin' | 'xiaohongshu' | 'both'
  wxNickName: string
  wxAvatarUrl: string
  wxOpenId?: string
  contact: string
  wechatId: string
  province?: string
  city?: string
  douyin?: RegistryMpTalentPlatformProfile
  xiaohongshu?: RegistryMpTalentPlatformProfile
  registeredAt: string
  updatedAt: string
}

export type RegistryMpRecruitmentOrder = {
  id: string
  /** 商家达人招募订单号 */
  sourceMerchantOrderId: string
  customerName: string
  storeName: string
  /** 商家要求（由商家订单 infoSummary 自动填入） */
  merchantRequirements: string
  status: 'open' | 'collecting' | 'closed' | 'done'
  createdAt: string
  updatedAt: string
  applicants?: RegistryMpRecruitmentApplicant[]
  /** 列表/详情展示用（创建时从商家订单同步） */
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
  urgent?: boolean
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
  mpTalentMembers?: RegistryMpTalentMember[]
  talentLibraryEntries?: RegistryTalentLibraryEntry[]
  talentPoolCandidates?: RegistryTalentPoolRow[]
  recruitmentScheduleRows?: RegistryScheduleRow[]
  recruitmentVideoSubmissions?: RegistryVideoSubmission[]
}

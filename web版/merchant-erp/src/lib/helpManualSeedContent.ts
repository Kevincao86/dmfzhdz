import type {
  HelpManualEdition,
  RegistryHelpManualArticle,
  RegistryHelpManualCategory,
} from './helpManualTypes.js'

const SEED_VERSION = '2026-06-09'

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function cat(
  id: string,
  edition: HelpManualEdition,
  title: string,
  sortOrder: number,
  parentId?: string,
): RegistryHelpManualCategory {
  return { id, edition, title, sortOrder, ...(parentId ? { parentId } : {}) }
}

function art(
  id: string,
  edition: HelpManualEdition,
  categoryId: string,
  title: string,
  body: string,
  sortOrder: number,
): RegistryHelpManualArticle {
  return { id, edition, categoryId, title, body, sortOrder, updatedAt: nowStr() }
}

export type HelpManualEditionSeed = {
  categories: RegistryHelpManualCategory[]
  articles: RegistryHelpManualArticle[]
}

function merchantSeed(): HelpManualEditionSeed {
  const e: HelpManualEdition = 'merchant'
  const categories: RegistryHelpManualCategory[] = [
    cat('HMC-m-manual', e, '使用手册', 0),
    cat('HMC2-m-start', e, '快速入门', 0, 'HMC-m-manual'),
    cat('HMC2-m-store', e, '店铺与商品', 1, 'HMC-m-manual'),
    cat('HMC2-m-recruit', e, '达人招募', 2, 'HMC-m-manual'),
    cat('HMC2-m-ai', e, 'AI 与运营', 3, 'HMC-m-manual'),
    cat('HMC-m-faq', e, '常见问题', 1),
    cat('HMC2-m-faq-account', e, '账号与会员', 0, 'HMC-m-faq'),
    cat('HMC2-m-faq-bind', e, '平台绑定', 1, 'HMC-m-faq'),
    cat('HMC2-m-faq-recruit', e, '招募与客服', 2, 'HMC-m-faq'),
    cat('HMC2-m-faq-ai', e, 'AI 与增值服务', 3, 'HMC-m-faq'),
  ]
  const articles: RegistryHelpManualArticle[] = [
    art(
      'HMA-m-start-1',
      e,
      'HMC2-m-start',
      '首次登录要做哪些准备？',
      `1. 使用手机号注册并登录灵祺AI智能ERP（商家版）。
2. 进入「系统 → 平台连接」，完成抖音来客账号绑定（探店招募、商品同步、POI 门店选择均依赖此步骤）。
3. 在「店铺 → 店铺信息」核对门店名称、地址与营业信息是否与来客一致。
4. 如需 AI 对话、文章生成、云剪等功能，在「系统 → AI 模型绑定」配置各厂商 API Key，或开通会员使用平台托管额度。
5. 右下角「在线客服」可联系运营；复杂招募单提交后由星选履约平台接单执行。

版本说明：免费版含基础功能及每月有限次直连 AI 调用；会员版开放 GEO、竞对分析、报税管理等能力。`,
      0,
    ),
    art(
      'HMA-m-start-2',
      e,
      'HMC2-m-start',
      '界面与菜单说明',
      `左侧主导航：
· 首页：经营概览与快捷入口
· AI 智能体：自然语言对话，可预览后确认执行改商品、发招募等操作
· 店铺：门店信息、菜单价目、店铺装修
· 商品：创建/编辑/上下架团购商品（支持多平台）
· 运营：达人招募、活动中心、评价、GEO 优化、竞对分析、AI 文章与话题、短视频 AI、数字人口播
· 投流 / 线索 / 财务：投放、线索跟进、对账与报税
· 系统：平台绑定、会员订阅、AI Key、账号安全

帮助入口：登录页或页脚「帮助手册」；团队介绍见「关于我们」。`,
      1,
    ),
    art(
      'HMA-m-store-1',
      e,
      'HMC2-m-store',
      '如何维护门店与商品？',
      `门店：
· 「店铺 → 店铺信息」编辑基础资料；「菜单价目表」维护团购展示内容。
· 招募表单中选店时，需使用已绑定来客的 POI 门店，可多选。

商品：
· 「商品 → 创建商品」按向导填写标题、图片、价格、适用门店等。
· 支持 AI 辅助写标题与详情；保存后可同步至已绑定平台（以来客为主）。
· 编辑、上下架在商品列表中操作；删除前请确认平台侧无未完成订单。`,
      0,
    ),
    art(
      'HMA-m-recruit-1',
      e,
      'HMC2-m-recruit',
      '新手版与专业版招募有何区别？',
      `新手版（AI 纯智能）：
· 选择投放平台（抖音 / 小红书）、探店门店、城市、行业、预算与目标人数。
· 点击「AI 智能分配达人档位」，系统按达人库均价与预算拆分 V3–V5+ 人数（需 ECS 数据面就绪）。
· 小红书不展示抖音带货档位与达人佣金字段。

专业版：
· 可自定义 Brief、档位策略、排期等，适合有明确投放方案的商户。

提交后订单进入运营管控台与星选履约平台，由 PR/运营接单、达人报名、探店与成片审核。`,
      0,
    ),
    art(
      'HMA-m-recruit-2',
      e,
      'HMC2-m-recruit',
      '招募单提交后如何跟进？',
      `1. 在「运营 → 达人招募」查看本店订单状态与运营备注。
2. 达人通过小程序/星选平台报名，运营在管控台筛选、建群、排期。
3. 视频提交后在管控台审核；通过后进入结算环节。
4. 紧急问题：ERP 右下角在线客服，或联系您的服务顾问。

注意：修改预算、人数或费用模式后，需重新点击 AI 分配再提交。`,
      1,
    ),
    art(
      'HMA-m-ai-1',
      e,
      'HMC2-m-ai',
      'AI 文章、短视频与数字人怎么用？',
      `AI 文章与话题（运营菜单）：
· 选择投放平台（与招募表单一致的芯片：抖音、小红书等）；当前 AI 生成仅支持「抖音」。
· 填写品牌/门店与写作要点，选择文案模型后生成文章或选题。

短视频 AI 处理：
· 上传本地素材或 OSS 链接，使用云剪流水线合成；请勿使用占位 URL 或非 OSS 外链。

数字人口播：
· 选择形象与脚本，生成口播视频；需配置对应视频/ TTS 模型 Key。

GEO / 竞对：会员功能，用于本地搜索可见度与竞品监测。`,
      0,
    ),
    art(
      'HMA-m-faq-a1',
      e,
      'HMC2-m-faq-account',
      '忘记密码或无法登录怎么办？',
      `· 登录页使用「短信验证码登录」，无需记忆密码。
· 若提示账号不存在，请先注册；同一手机号仅对应一个商家租户。
· 免费版到期后部分菜单会隐藏，可在「系统 → 会员订阅」续费或联系运营开通试用。
· 换浏览器登录后，本地草稿不共享，重要内容请及时提交保存。`,
      0,
    ),
    art(
      'HMA-m-faq-a2',
      e,
      'HMC2-m-faq-account',
      '免费版与会员版有什么区别？',
      `免费版：基础 ERP 功能 + 每月有限次直连 AI（豆包/千问/MiniMax/DeepSeek）；不含 GEO、竞对分析、报税管理。

会员版：上述高级模块开放，AI 模型选择更完整。

会员 Plus：含 OpenAI、Claude、Gemini 等高阶模型及一键报税等能力。

具体以「系统 → 会员订阅」页展示为准。`,
      1,
    ),
    art(
      'HMA-m-faq-b1',
      e,
      'HMC2-m-faq-bind',
      '抖音来客绑定失败怎么排查？',
      `1. 确认在来客侧已完成商户授权，且登录账号有门店管理权限。
2. 「系统 → 平台连接」重新发起绑定，按提示完成 OAuth。
3. 绑定成功后刷新页面，在招募/选店处应能看到 POI 列表。
4. 若 API 报 502，多为 ECS 服务未启动，请联系管理员检查 mofangdianai.com/erp-api 健康检查。
5. 美团、快手等平台的深度能力仍在迭代，以页面提示为准。`,
      0,
    ),
    art(
      'HMA-m-faq-r1',
      e,
      'HMC2-m-faq-recruit',
      'AI 档位分配结果不对怎么办？',
      `· 修改预算、招募人数或费用模式后，必须重新点击「AI 智能分配达人档位」。
· 分配依据运营台达人库各档位平均报价；同城样本不足时会结合城市参考价，标签显示「离线估算」或「达人库测算」。
· 若长期无达人库数据，请联系运营完善达人库条目（报价、带货等级、城市）。
· 小红书招募按预算估算人数，无 V 档位拆分。`,
      0,
    ),
    art(
      'HMA-m-faq-r2',
      e,
      'HMC2-m-faq-recruit',
      '在线客服消息发不出去？',
      `商家 ERP 客服（右下角）：
· 需完成登录；生产环境消息经云端表同步至运营台。

若运营已回复但小程序看不到：
· 属运营台侧会话通道问题，请运营在「小程序在线客服」页回复 lq-mp- 开头会话，并确认 ECS auth-api 已更新。

您可在客服窗口描述问题并留下手机号，便于运营回电。`,
      1,
    ),
    art(
      'HMA-m-faq-ai1',
      e,
      'HMC2-m-faq-ai',
      'AI 提示未配置 Key 或调用失败？',
      `1. 打开「系统 → AI 模型绑定 → 管理各模型 API Key」，填入对应厂商密钥。
2. 或在「AI 智能体」面板关闭「自动」并指定已配置 Key 的模型。
3. 免费版注意每月直连 AI 次数上限。
4. 云剪报 InputFile is bad：清空素材列表，仅使用本地上传或 OSS 稳定链接后重试。
5. 持续失败请截图错误文案并联系客服，附带操作时间与门店名称。`,
      0,
    ),
  ]
  return { categories, articles }
}

function partnerSeed(): HelpManualEditionSeed {
  const e: HelpManualEdition = 'partner'
  const categories: RegistryHelpManualCategory[] = [
    cat('HMC-p-manual', e, '使用手册', 0),
    cat('HMC2-p-start', e, '快速入门', 0, 'HMC-p-manual'),
    cat('HMC2-p-client', e, '客户与代运营', 1, 'HMC-p-manual'),
    cat('HMC2-p-ops', e, '协同作业', 2, 'HMC-p-manual'),
    cat('HMC-p-faq', e, '常见问题', 1),
    cat('HMC2-p-faq-account', e, '账号与权限', 0, 'HMC-p-faq'),
    cat('HMC2-p-faq-client', e, '客户绑定', 1, 'HMC-p-faq'),
    cat('HMC2-p-faq-work', e, '作业与数据', 2, 'HMC-p-faq'),
  ]
  const articles: RegistryHelpManualArticle[] = [
    art(
      'HMA-p-start-1',
      e,
      'HMC2-p-start',
      '服务商版与商家版有何不同？',
      `服务商版（fws.mofangdianai.com）与商家版（cs.mofangdianai.com）共用同一套 ERP 能力，但租户类型为 partner：

· 独立注册/登录，数据与商家租户隔离
· 顶栏可切换「全部客户」或某一绑定商家，代查看/代操作其数据
· 「系统 → 服务商平台」绑定各平台服务商身份
· 「系统 → 客户商家」维护代运营客户列表
· 商品查询默认走服务商视角（goods_query_type=3）

登录页可一键跳转商家版；两站点会话互不影响。`,
      0,
    ),
    art(
      'HMA-p-start-2',
      e,
      'HMC2-p-start',
      '新服务商 onboarding 清单',
      `1. 注册服务商租户并完成平台服务商身份绑定。
2. 邀请或录入客户商家账号，在「客户商家」中建立绑定关系。
3. 顶栏切换到目标客户，为其完成来客绑定、商品与招募配置。
4. 约定 SLA：招募单由您代提或指导客户自助提交，履约仍走星选平台。
5. 为客户配置 AI Key 或使用您统一托管的 Key（注意额度与安全）。
6. 培训客户使用右下角客服与帮助手册入口。`,
      1,
    ),
    art(
      'HMA-p-client-1',
      e,
      'HMC2-p-client',
      '如何绑定与管理客户商家？',
      `· 「系统 → 客户商家」添加客户：通常为客户注册手机号或租户编号，按页面指引完成授权。
· 绑定成功后，顶栏客户切换器出现该客户名称。
· 选择客户后，商品、招募、财务等模块展示的是该客户数据，而非服务商自身空租户。
· 解除绑定前请与客户确认，避免进行中的招募单无人跟进。
· 勿将服务商账号密码提供给客户；应各自独立登录。`,
      0,
    ),
    art(
      'HMA-p-ops-1',
      e,
      'HMC2-p-ops',
      '代客户发布招募与 AI 作业',
      `代发招募：
· 切换到客户 → 「运营 → 达人招募」，流程与商家版一致。
· infoSummary 中会记录投放平台、预算、档位等信息，便于运营接单。

代运营 AI：
· 可代客户配置 Key，或使用服务商统一 Key（注意账单归属）。
· AI 智能体执行写操作前均有预览确认，避免误改客户商品。

报告与对账：
· 财务、GEO 等模块均随当前选中客户切换；导出时注意客户名称标注。`,
      0,
    ),
    art(
      'HMA-p-faq-a1',
      e,
      'HMC2-p-faq-account',
      '切换客户后数据不对？',
      `· 确认顶栏当前选中的是目标客户，而非「全部客户」汇总视图。
· 刷新页面后重新选择客户；缓存的表单草稿可能属于上一客户，请勿误提交。
· 若客户列表为空，检查绑定是否已在运营台审核通过。
· 两个浏览器标签分别登录商家版与服务商版时，注意区分站点。`,
      0,
    ),
    art(
      'HMA-p-faq-c1',
      e,
      'HMC2-p-faq-client',
      '客户绑定失败或看不到门店？',
      `· 绑定关系需客户侧授权；请客户先在商家版完成注册。
· 门店与 POI 属于客户租户的来客绑定，服务商切换客户后应使用该客户已绑门店。
· 若来客绑定在客户账号下，服务商无法用自己的来客顶替。
· 迁移客户时，请先在旧账号导出必要数据，再在新租户重建绑定。`,
      0,
    ),
    art(
      'HMA-p-faq-w1',
      e,
      'HMC2-p-faq-work',
      '服务商代操作的责任边界？',
      `· 智能体与批量操作需人工确认后再执行，避免误上架/误改价。
· 招募预算与档位分配会直接影响履约成本，提交前请与客户书面确认。
· API Key 建议使用客户自有 Key；若共用 Key，请约定用量与费用。
· 数据导出含客户经营信息，遵守保密协议，勿外泄。`,
      0,
    ),
  ]
  return { categories, articles }
}

function fulfillmentSeed(): HelpManualEditionSeed {
  const e: HelpManualEdition = 'fulfillment'
  const categories: RegistryHelpManualCategory[] = [
    cat('HMC-f-manual', e, '使用手册', 0),
    cat('HMC2-f-start', e, '快速入门', 0, 'HMC-f-manual'),
    cat('HMC2-f-pr', e, 'PR 发单', 1, 'HMC-f-manual'),
    cat('HMC2-f-talent', e, '达人/团队', 2, 'HMC-f-manual'),
    cat('HMC2-f-addon', e, '增值服务', 3, 'HMC-f-manual'),
    cat('HMC-f-faq', e, '常见问题', 1),
    cat('HMC2-f-faq-account', e, '账号与身份', 0, 'HMC-f-faq'),
    cat('HMC2-f-faq-order', e, '招募与订单', 1, 'HMC-f-faq'),
    cat('HMC2-f-faq-support', e, '客服与消息', 2, 'HMC-f-faq'),
  ]
  const articles: RegistryHelpManualArticle[] = [
    art(
      'HMA-f-start-1',
      e,
      'HMC2-f-start',
      '灵祺星选平台是什么？',
      `灵祺星选（履约平台）连接商家招募需求与达人/PR/拍摄剪辑团队：

· PR：发布招募、管理报名、审核视频、使用模版快速发单
· 达人：在大厅浏览招募、报名、提交探店视频
· 拍摄/剪辑团队：接拍摄类、云剪类需求
· 增值服务：嵌入商家 Web 的短视频 AI、AI 文章、数字人口播

数据经 ECS API（mofangdianai.com/erp-api）与运营注册表同步，请使用最新版小程序与 Web。`,
      0,
    ),
    art(
      'HMA-f-start-2',
      e,
      'HMC2-f-start',
      '注册与身份切换',
      `1. 首页选择 PR / 达人 / 拍摄 / 剪辑等身份注册（微信授权 + 手机验证）。
2. 「我的 → 身份切换」可在达人/拍摄/剪辑工作身份间切换（若已绑定）。
3. PR 与达人账号体系独立，请勿混用登录入口。
4. 完善资料：平台账号、报价、城市、标签等，便于被商家筛选。
5. 帮助手册、团队介绍、隐私政策见登录页链接。`,
      1,
    ),
    art(
      'HMA-f-pr-1',
      e,
      'HMC2-f-pr',
      '如何发布招募单？',
      `1. 进入「发布招募」，选择探店/品宣/直播/拍摄/剪辑/云剪等模式。
2. 填写招募平台（抖音、小红书等）、城市、标签、预算、人数、Brief 等。
3. 可选封面与模版；急单会进入急单大厅并缩短报名窗口。
4. 提交后出现在「我的发单」，可查看报名列表、审核达人、视频验收。
5. 商家 ERP 提交的订单也会同步到大厅，由运营分配 PR 跟进。`,
      0,
    ),
    art(
      'HMA-f-pr-2',
      e,
      'HMC2-f-pr',
      '模版与批量发单',
      `· 「我的模版」保存常用招募字段，发单时可一键套用。
· 修改模版不影响历史订单。
· 同一模版多次发布请注意更新预算、时间与门店信息，避免达人误报。`,
      1,
    ),
    art(
      'HMA-f-talent-1',
      e,
      'HMC2-f-talent',
      '达人如何报名与交片？',
      `1. 「招募大厅」筛选城市、平台、标签，进入详情点击报名。
2. 报名后可在「我的报名」查看状态；排期与群通知由 PR/运营推送。
3. 探店完成后按 Brief 上传视频；驳回可修改重传。
4. 报价与等级请在「我的 → 达人资料」维护，与商家达人库同步后影响档位参考价。
5. 拍摄/剪辑团队在大厅接「拍摄」「云剪」类订单，流程类似。`,
      0,
    ),
    art(
      'HMA-f-addon-1',
      e,
      'HMC2-f-addon',
      '增值服务（短视频 / AI 文章 / 数字人）',
      `入口：左侧「增值服务」。

· 短视频 AI 处理：与商家 Web 同源，素材请本地上传或 OSS 链接。
· AI 文章与话题：平台选择与招募表单一致；AI 生成当前仅支持抖音口径。
· 数字人口播：填写脚本与形象生成口播视频。

需登录且 ECS 可达；失败时检查网络与 config 中 MERCHANT_API_BASE_URL。`,
      0,
    ),
    art(
      'HMA-f-faq-a1',
      e,
      'HMC2-f-faq-account',
      '小程序登录失败或 -101 网络错误？',
      `· 确认 config.release.js 中 API 指向 https://mofangdianai.com/erp-api。
· 开发者工具可勾选「不校验合法域名」做本地调试；真机需备案域名。
· Safari 打开 /erp-api/mp-cronet-ping 应返回 ok:true。
· 仍失败请联系运营检查 ECS auth-api 与 Nginx 反代。`,
      0,
    ),
    art(
      'HMA-f-faq-o1',
      e,
      'HMC2-f-faq-order',
      '报名后长时间无反馈？',
      `· 急单与普通大厅曝光规则不同，急单 24 小时内截止报名。
· PR 可在「我的发单 → 报名列表」筛选；达人侧请保持消息通知开启。
· 商家侧订单需运营/PR 接单后才会推进，并非报名即探店。
· 可在「小灵同学」人工客服描述订单编号咨询。`,
      0,
    ),
    art(
      'HMA-f-faq-s1',
      e,
      'HMC2-f-faq-support',
      '小灵同学 / 人工客服怎么用？',
      `· 小程序「我的 → 小灵同学」智能问答；输入「人工服务」可接入运营。
· 人工模式下消息写入云端，运营在管控台「小程序在线客服」回复。
· 若发送按钮灰色，检查是否已点「人工服务」且网络正常。
· ERP 商家客服与小程序客服通道不同，勿混淆会话编号。`,
      0,
    ),
  ]
  return { categories, articles }
}

const SEED_BY_EDITION: Record<HelpManualEdition, () => HelpManualEditionSeed> = {
  merchant: merchantSeed,
  partner: partnerSeed,
  fulfillment: fulfillmentSeed,
}

export function getHelpManualSeedForEdition(edition: HelpManualEdition): HelpManualEditionSeed {
  return SEED_BY_EDITION[edition]()
}

export function getAllHelpManualSeeds(): Record<HelpManualEdition, HelpManualEditionSeed> {
  return {
    merchant: merchantSeed(),
    partner: partnerSeed(),
    fulfillment: fulfillmentSeed(),
  }
}

export const HELP_MANUAL_SEED_VERSION = SEED_VERSION

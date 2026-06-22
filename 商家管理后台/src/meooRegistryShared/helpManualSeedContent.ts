/**
 * AUTO-GENERATED — 勿手改。源：web版/merchant-erp/src/lib/helpManualSeedContent.ts
 * 同步：node scripts/sync-help-manual-seed.mjs（商家管理后台 prebuild 自动执行）
 */
import type {
  HelpManualEdition,
  RegistryHelpManualArticle,
  RegistryHelpManualCategory,
} from './helpManualTypes.js'

const SEED_VERSION = '2026-06-14'

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
    cat('HMC2-f-pr', e, 'PR 使用手册', 1, 'HMC-f-manual'),
    cat('HMC2-f-talent', e, '达人使用手册', 2, 'HMC-f-manual'),
    cat('HMC2-f-shoot', e, '拍摄使用手册', 3, 'HMC-f-manual'),
    cat('HMC2-f-edit', e, '剪辑使用手册', 4, 'HMC-f-manual'),
    cat('HMC2-f-addon', e, '增值服务', 5, 'HMC-f-manual'),
    cat('HMC-f-faq', e, '常见问题', 1),
    cat('HMC2-f-faq-account', e, '账号与身份', 0, 'HMC-f-faq'),
    cat('HMC2-f-faq-pr', e, 'PR 常见问题', 1, 'HMC-f-faq'),
    cat('HMC2-f-faq-talent', e, '达人常见问题', 2, 'HMC-f-faq'),
    cat('HMC2-f-faq-shoot', e, '拍摄常见问题', 3, 'HMC-f-faq'),
    cat('HMC2-f-faq-edit', e, '剪辑常见问题', 4, 'HMC-f-faq'),
    cat('HMC2-f-faq-order', e, '招募与订单', 5, 'HMC-f-faq'),
    cat('HMC2-f-faq-support', e, '客服与消息', 6, 'HMC-f-faq'),
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
3. 上传封面海报（分享至小程序时自动裁成 5:4 铺满）；关联达人/拍摄/剪辑报名表模版。
4. 急单会进入急单大厅并缩短报名窗口；提交后出现在「我的发单」。
5. 商家 ERP 提交的订单也会同步到大厅，由运营分配 PR 跟进。`,
      0,
    ),
    art(
      'HMA-f-pr-2',
      e,
      'HMC2-f-pr',
      '模版与批量发单',
      `· 「我的模版」为达人、拍摄、剪辑分别保存常用招募字段，发单时可一键套用。
· 修改模版不影响历史订单。
· 同一模版多次发布请注意更新预算、时间与门店信息，避免达人误报。`,
      1,
    ),
    art(
      'HMA-f-pr-3',
      e,
      'HMC2-f-pr',
      '审核报名与视频验收',
      `1. 「我的发单」→ 选择订单 →「报名列表」查看达人/团队报名。
2. 可按粉丝、报价、城市筛选；通过/拒绝后达人侧「我的报名」同步状态。
3. 启用视频回传流程时，进入「视频审核」逐条审片；驳回需备注修改点。
4. 通过消息 Tab 或群二维码通知达人排期与交片要求。
5. 剪辑任务包审片通过后，可选择「已完成」结案或「转达人直发任务」生成云剪单。`,
      2,
    ),
    art(
      'HMA-f-pr-4',
      e,
      'HMC2-f-pr',
      '转发工具（外部表单转单）',
      `适用：报名表在腾讯文档/飞书/金数据，希望借助灵祺流量分发但报名仍走原表。

1. 进入「转发工具」，粘贴原表 HTTPS 链接（必填）。
2. 填写或 AI 解析标题、正文摘要；备注框可写补充说明。
3. 预览区支持 inline 编辑标题与正文，改完后「重新预览」或直接发布。
4. 生成站内招募单；达人侧显示「前往原表报名」，正文内原表链接行已隐藏。
5. 支持导出报名数据辅助回填外部表格。`,
      3,
    ),
    art(
      'HMA-f-talent-1',
      e,
      'HMC2-f-talent',
      '完善达人资料与 AI 推荐',
      `1. 进入「我的 → 达人资料」，填写抖音/小红书等平台昵称、粉丝量、带货等级。
2. 补充城市、品类标签、联系方式与报价区间。
3. 资料越完整，「推荐」Tab 的 AI 匹配分越高、排序越靠前。
4. 多平台账号可分别维护；与商家达人库同步后影响档位参考价。
5. 修改资料后刷新推荐页即可看到新匹配结果。`,
      0,
    ),
    art(
      'HMA-f-talent-2',
      e,
      'HMC2-f-talent',
      '找单报名全流程',
      `1. 「招募大厅」按平台、城市、预算筛选；急单 Tab 展示时效紧缺单子。
2. 「推荐」Tab 按 AI 匹配分排序，优先查看高匹配招募。
3. 进入详情查看 Brief、截止时间、AI 匹配分；普通单点「立即报名」填表。
4. 转单招募显示「前往原表报名」，跳转腾讯文档等外部链接（需先登录）。
5. 提交后在「我的报名」跟踪待审核/已通过/未通过状态。`,
      1,
    ),
    art(
      'HMA-f-talent-3',
      e,
      'HMC2-f-talent',
      '探店交片与视频回传',
      `1. 报名通过后，按 PR 消息或群通知确认探店排期。
2. 探店完成后按 Brief 要求拍摄、剪辑并上传成片。
3. PR 在「视频审核」审片；驳回可修改后重传。
4. 审核通过后订单进入待结算/结案流程。
5. 分享招募：详情页右上角分享，封面自动 5:4 裁剪铺满，避免微信卡片黑边。`,
      2,
    ),
    art(
      'HMA-f-talent-4',
      e,
      'HMC2-f-talent',
      '云剪直发任务接单',
      `1. 在招募大厅「云剪任务」或首页云剪入口查看直发单。
2. 每人认领 1 条，确认接收后下载系统分配的唯一成片。
3. 在规定时间内发布至指定平台，回传作品链接。
4. 审核方式为 AI 核查时，回传并通过即完成；PR 审核时需等待 PR 通过。
5. 完成后在「我的报名」查看状态，全链路可复盘对账。`,
      3,
    ),
    art(
      'HMA-f-shoot-1',
      e,
      'HMC2-f-shoot',
      '完善拍摄团队资料',
      `1. 切换为「拍摄团队」身份后，进入「我的 → 团队信息」。
2. 填写团队名称、所在城市、设备清单（相机/灯光/稳定器等）。
3. 补充拍摄风格（探店/活动/商拍）、日产能与作品集链接。
4. 维护联系方式与报价区间，便于 PR 筛选匹配。
5. 资料完善后可在招募大厅筛选「拍摄」类订单接单。`,
      0,
    ),
    art(
      'HMA-f-shoot-2',
      e,
      'HMC2-f-shoot',
      '接拍摄类招募',
      `1. 在招募大厅筛选目标为「拍摄团队」的招募单。
2. 查看 Brief 中的拍摄地点、时长、交付格式与截止时间。
3. 点击「立即报名」，填写团队报价、可执行档期、设备说明等。
4. 报名通过后与 PR 确认排期；档期冲突请及时在消息中沟通。
5. 拍摄完成后按约定格式交片，PR 在视频审核中验收。`,
      1,
    ),
    art(
      'HMA-f-shoot-3',
      e,
      'HMC2-f-shoot',
      '档期管理与交片规范',
      `· 报名前确认 Brief 中的探店/活动日期与己方档期无冲突。
· 多订单并行时，在报价与备注中说明可执行时间段，避免爽约。
· 交片格式按 Brief 要求（分辨率、时长、横竖版）；命名规范便于 PR 批量审核。
· 驳回后根据备注修改重传，保持与 PR 消息同步。
· 长期合作可在资料中更新作品集链接，提升 PR 通过率。`,
      2,
    ),
    art(
      'HMA-f-edit-1',
      e,
      'HMC2-f-edit',
      '完善剪辑团队资料',
      `1. 切换为「剪辑团队」身份后，进入「我的 → 团队信息」。
2. 填写团队名称、擅长风格（探店/Vlog/口播/云剪等）、日产能。
3. 补充剪辑软件、交付格式、报价区间与作品集链接。
4. 维护联系方式，便于 PR 在审片驳回时快速沟通。
5. 资料完善后可在大厅接「剪辑」「云剪」类招募与剪辑任务包。`,
      0,
    ),
    art(
      'HMA-f-edit-2',
      e,
      'HMC2-f-edit',
      '接剪辑/云剪招募',
      `1. 在招募大厅筛选目标为「剪辑团队」的单子，或进入「云剪任务」专区。
2. 查看 Brief 中的素材来源、条数、风格参考与交付截止时间。
3. 点击报名，填写报价、产能与预计交片时间。
4. 普通剪辑单：收素材 → 剪辑 → 交片 → PR 审片。
5. 云剪直发单：认领 1 条 → 下载成片 → 发布回传链接。`,
      1,
    ),
    art(
      'HMA-f-edit-3',
      e,
      'HMC2-f-edit',
      '剪辑任务包认领与批量上传',
      `1. PR 发布「剪辑任务包」（如 20 条成片位），仅剪辑身份可认领。
2. 查看剩余可认领条数，输入认领数量 N 并锁定成片位。
3. 打开批量上传窗口，拖拽/选择 N 个文件；条数不足时无法提交。
4. 满 N/N 后提交，进入 PR 审片队列，状态为「待审片」。
5. 审片驳回的条可单独修改重传，通过后进入「已通过池」。`,
      2,
    ),
    art(
      'HMA-f-edit-4',
      e,
      'HMC2-f-edit',
      '审片驳回与重传',
      `· PR 逐条审片：通过 / 驳回 / 备注；驳回条需按备注修改后重传对应文件。
· 全部通过后 PR 可选择「已完成」结案，或「转达人直发任务」生成云剪单。
· 转直发后每条已通过成片生成唯一下载链接，派给达人发布。
· 上传前确认格式、时长、画幅与 Brief 一致，减少驳回轮次。
· 批量上传时文件名建议含序号，便于 PR 对照审片。`,
      3,
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
      'HMA-f-faq-a2',
      e,
      'HMC2-f-faq-account',
      '如何切换达人/拍摄/剪辑/PR 身份？',
      `· 小程序：「我的」页顶部点击当前身份标签，在弹窗中选择目标身份。
· Web：左侧栏底部「身份切换」，在已绑定的工作身份间切换。
· 一号可双身份（如 PR + 达人），但菜单与功能随当前身份变化。
· 切换后请完善对应资料页（达人资料 / 团队信息 / PR 信息），避免推荐与筛选不准。`,
      1,
    ),
    art(
      'HMA-f-faq-pr1',
      e,
      'HMC2-f-faq-pr',
      'PR 发单后达人看不到？',
      `· 确认订单状态为「进行中」且未过截止时间。
· 检查招募目标是否选对（达人/拍摄/剪辑），达人侧筛选条件是否过严。
· 急单与普通大厅曝光规则不同，急单 24 小时内截止报名。
· Web 与小程序共用 ECS 数据面，发布后应同步展示；若仅一端看不到，刷新或重新登录。
· 仍异常请联系运营检查注册表同步。`,
      0,
    ),
    art(
      'HMA-f-faq-pr2',
      e,
      'HMC2-f-faq-pr',
      '转单招募如何发布？达人显示什么按钮？',
      `· 使用「转发工具」粘贴原表 HTTPS 链接，预览编辑后发布。
· 生成站内招募单后，达人/Web 详情显示「前往原表报名」（非「立即报名」）。
· 正文内原表链接行已隐藏，仅通过按钮跳转，避免误点。
· Web 端新窗口打开原表；小程序内嵌或复制链接引导页。
· 若仍显示「立即报名」，请更新至最新 Web/小程序版本。`,
      1,
    ),
    art(
      'HMA-f-faq-pr3',
      e,
      'HMC2-f-faq-pr',
      'PR 如何审核报名与通知达人？',
      `· 「我的发单」→ 选择订单 →「报名列表」逐条通过/拒绝。
· 通过后达人「我的报名」状态同步；可通过消息 Tab 发送排期与群二维码。
· 启用视频回传时，达人在约定时间交片，PR 在「视频审核」审片。
· 剪辑任务包审片通过后，可选「转达人直发任务」一键生成云剪单。
· 批量操作时注意核对粉丝、报价与城市，避免误通过。`,
      2,
    ),
    art(
      'HMA-f-faq-pr4',
      e,
      'HMC2-f-faq-pr',
      '模版修改会影响历史订单吗？',
      `· 不会。修改「我的模版」仅影响之后新发布的招募单。
· 已发布订单的报名表字段以发布时关联的模版快照为准。
· 建议为达人、拍摄、剪辑分别维护模版，发单时按目标选择。
· 复用模版发单时务必更新预算、门店、截止时间等可变信息。`,
      3,
    ),
    art(
      'HMA-f-faq-t1',
      e,
      'HMC2-f-faq-talent',
      '推荐大厅为空或匹配分很低？',
      `· 进入「我的 → 达人资料」，补全平台粉丝、城市、品类标签。
· 粉丝量与招募要求差距过大时匹配分偏低，属正常筛选逻辑。
· 修改资料后下拉刷新「推荐」Tab。
· 也可在「首页」招募大厅手动筛选，不依赖 AI 推荐。
· 新注册用户资料为空时推荐可能暂无结果。`,
      0,
    ),
    art(
      'HMA-f-faq-t2',
      e,
      'HMC2-f-faq-talent',
      '达人报名后长时间无反馈？',
      `· 报名≠立即探店；PR 需在「报名列表」审核，商家订单还需运营/PR 接单推进。
· 急单截止快，请留意详情页报名截止时间。
· 保持「消息通知」开启，关注 PR 审核结果与排期消息。
· 可在「小灵同学」输入订单编号转人工咨询。
· 勿重复提交同一订单报名。`,
      1,
    ),
    art(
      'HMA-f-faq-t3',
      e,
      'HMC2-f-faq-talent',
      '分享招募卡片海报有黑边？',
      `· 请更新至最新体验版小程序（构建号见 config.release.js）。
· 系统会将封面居中裁剪为 5:4 铺满，勿直接使用未裁剪远程图。
· PR 发单时建议上传高清横版或竖版海报作为封面。
· Web 端分享依赖小程序能力，达人侧分享请以小程序为准。`,
      2,
    ),
    art(
      'HMA-f-faq-t4',
      e,
      'HMC2-f-faq-talent',
      '「前往原表报名」打不开？',
      `· 请先完成微信登录，未登录无法跳转外部链接。
· 小程序业务域名未配置时，会进入「复制链接」引导页，手动粘贴到浏览器打开。
· 原表须为 HTTPS 链接（腾讯文档、飞书等）。
· Web 端会在新窗口打开原表，无需 web-view 白名单。`,
      3,
    ),
    art(
      'HMA-f-faq-s1',
      e,
      'HMC2-f-faq-shoot',
      '拍摄团队接不到拍摄类订单？',
      `· 确认已切换为「拍摄团队」身份，而非达人或剪辑身份。
· 完善团队信息：设备、风格、日产能、作品集链接与城市。
· 招募大厅筛选「拍摄」类目标，或放宽城市/预算条件。
· 报价过高或档期备注不清可能降低 PR 通过率。
· 可先报名普通探店拍摄需求积累案例。`,
      0,
    ),
    art(
      'HMA-f-faq-s2',
      e,
      'HMC2-f-faq-shoot',
      '档期冲突或无法按时交片怎么办？',
      `· 报名前仔细核对 Brief 中的拍摄日期与地点。
· 冲突时尽快通过「消息」联系 PR 说明，勿静默爽约。
· PR 可在报名列表改选其他团队；已通过后变更需双方确认。
· 交片延迟请提前告知并协商新时间节点。
· 多次爽约可能影响后续报名通过率。`,
      1,
    ),
    art(
      'HMA-f-faq-s3',
      e,
      'HMC2-f-faq-shoot',
      '视频审核被驳回怎么办？',
      `· 查看 PR 驳回备注中的修改点（画幅、时长、调色、字幕等）。
· 按 Brief 要求修改后重新上传，保持文件命名规范。
· 不确定处通过消息与 PR 确认，避免多轮无效重传。
· 批量订单注意每条对应关系，勿传错素材。`,
      2,
    ),
    art(
      'HMA-f-faq-e1',
      e,
      'HMC2-f-faq-edit',
      '云剪任务如何接单？',
      `· 在首页「云剪任务」或招募大厅云剪专区进入详情。
· 点击报名 → 确认接收 → 下载系统分配的唯一成片。
· 在规定时间内发布至指定平台，回传作品链接。
· AI 审核模式下回传并通过即完成；PR 审核需等待通过。
· 每人通常认领 1 条，勿重复认领占用名额。`,
      0,
    ),
    art(
      'HMA-f-faq-e2',
      e,
      'HMC2-f-faq-edit',
      '剪辑任务包认领失败或条数不足？',
      `· 仅「剪辑团队」身份可认领剪辑任务包，达人/拍摄身份无此入口。
· 认领数量不得超过剩余可认领条数。
· 批量上传时文件数须等于认领数 N，不足时系统提示「还差 M 条」无法提交。
· 提交前检查文件格式与大小是否符合上传限制。
· 若页面异常，刷新后重试或联系运营。`,
      1,
    ),
    art(
      'HMA-f-faq-e3',
      e,
      'HMC2-f-faq-edit',
      '审片驳回后如何重传？',
      `· 在剪辑任务包详情查看被驳回的条及 PR 备注。
· 仅修改对应条重新上传，不必重传全部。
· 修改后重新进入审片队列，PR 逐条审核。
· 全部通过后进入「已通过池」，等待 PR 结案或转达人直发。
· 上传前对照 Brief 的风格、时长、画幅要求。`,
      2,
    ),
    art(
      'HMA-f-faq-e4',
      e,
      'HMC2-f-faq-edit',
      '剪辑与云剪直发有什么区别？',
      `· 剪辑招募：收素材后由剪辑团队制作成片，PR 审片验收。
· 剪辑任务包：PR 发布批量成片位，剪辑师认领并批量上传，PR 审片。
· 云剪直发：PR 将已通过成片转给达人，达人下载后发布并回传链接。
· 剪辑团队侧重生产；云剪直发侧重分发，达人侧执行发布。
· 同一订单可能经历「剪辑任务包 → 审片 → 转达人直发」全链路。`,
      3,
    ),
    art(
      'HMA-f-faq-o1',
      e,
      'HMC2-f-faq-order',
      'Web 与小程序数据不同步？',
      `· 确认两端登录同一微信账号（同一 mp_accounts）。
· API 须指向 ECS 数据面 https://mofangdianai.com/erp-api，勿使用旧云端地址。
· 退出登录会清除本机缓存，切换账号后请重新登录。
· 报名、发单、消息均实时同步；若仅一端异常，刷新或清缓存后重登。
· 长期不同步请联系运营检查 auth-api 与注册表。`,
      0,
    ),
    art(
      'HMA-f-faq-o2',
      e,
      'HMC2-f-faq-order',
      '报名后长时间无反馈？（通用）',
      `· 急单与普通大厅曝光规则不同，急单 24 小时内截止报名。
· PR 可在「我的发单 → 报名列表」筛选；达人侧请保持消息通知开启。
· 商家侧订单需运营/PR 接单后才会推进，并非报名即探店。
· 可在「小灵同学」人工客服描述订单编号咨询。`,
      1,
    ),
    art(
      'HMA-f-faq-sup1',
      e,
      'HMC2-f-faq-support',
      '小灵同学 / 人工客服怎么用？',
      `· 小程序「我的 → 小灵同学」或 Web「我的 → 小灵同学」智能问答。
· 输入「人工服务」可接入运营人工处理。
· 人工模式下消息写入云端，运营在管控台「小程序在线客服」回复。
· 若发送按钮灰色，检查是否已点「人工服务」且网络正常。
· ERP 商家客服与星选客服通道不同，勿混淆会话编号。`,
      0,
    ),
  ]
  return { categories, articles }
}

function remapHelpManualSeedEdition(
  seed: HelpManualEditionSeed,
  edition: HelpManualEdition,
): HelpManualEditionSeed {
  const mapId = (id: string) => id.replace(/-f-/g, '-mp-')
  return {
    categories: seed.categories.map((c) => ({
      ...c,
      edition,
      id: mapId(c.id),
      parentId: c.parentId ? mapId(c.parentId) : undefined,
    })),
    articles: seed.articles.map((a) => ({
      ...a,
      edition,
      id: mapId(a.id),
      categoryId: mapId(a.categoryId),
    })),
  }
}

function mpSeed(): HelpManualEditionSeed {
  return remapHelpManualSeedEdition(fulfillmentSeed(), 'mp')
}

const SEED_BY_EDITION: Record<HelpManualEdition, () => HelpManualEditionSeed> = {
  merchant: merchantSeed,
  partner: partnerSeed,
  fulfillment: fulfillmentSeed,
  mp: mpSeed,
}

export function getHelpManualSeedForEdition(edition: HelpManualEdition): HelpManualEditionSeed {
  return SEED_BY_EDITION[edition]()
}

export function getAllHelpManualSeeds(): Record<HelpManualEdition, HelpManualEditionSeed> {
  return {
    merchant: merchantSeed(),
    partner: partnerSeed(),
    fulfillment: fulfillmentSeed(),
    mp: mpSeed(),
  }
}

export const HELP_MANUAL_SEED_VERSION = SEED_VERSION

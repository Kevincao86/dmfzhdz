import type {
  AiRecruitmentBriefPreview,
  RecruitContentForm,
  RecruitWizardBudget,
  RecruitWizardScope,
  RecruitWizardShoot,
  RecruitWizardStep,
} from './aiAgentTypes'
import { parseRecruitmentIntentFromText } from './aiAgentRecruitmentParse'
import {
  LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT,
  LOCAL_LIFE_KOL_COMMISSION_MAX_PCT,
  LOCAL_LIFE_KOL_COMMISSION_MIN_PCT,
} from './localLifeKolCommission'
import {
  loadMerchantBriefProductPicks,
  pickBriefMainAndSecondary,
  resolveMerchantBriefContext,
} from './merchantBriefCatalog'
import {
  isTalentFacingRecruitmentPriceLeak,
  stripTalentFacingRecruitmentCopy,
} from './recruitmentInfoFilter'

export const RECRUIT_WIZARD_STEP_META: Record<
  RecruitWizardStep,
  { title: string; hint: string }
> = {
  1: { title: '发什么、发给谁', hint: '先核对主推品、平台和城市，确认后再看预算。' },
  2: { title: '花多少、招几人', hint: '核对预算和人数，确认后再写拍摄要求。' },
  3: { title: '怎么拍、何时交', hint: '核对完整拍摄与合作要求，确认后看汇总。' },
  4: { title: '确认发布', hint: '确认后发到星选大厅，不会直接私信达人。' },
}

export const RECRUIT_CONTENT_FORM_OPTIONS: { id: RecruitContentForm; label: string }[] = [
  { id: 'instore', label: '到店探店' },
  { id: 'talk', label: '不到店口播' },
  { id: 'note', label: '图文笔记' },
]

export function recruitContentFormLabel(form: RecruitContentForm | undefined): string {
  return RECRUIT_CONTENT_FORM_OPTIONS.find((x) => x.id === form)?.label ?? '到店探店'
}

export function recruitPlatformLabel(platform: '抖音' | '小红书' | string | undefined): string {
  return platform === '小红书' ? '小红书' : '抖音来客'
}

export function clampRecruitCommissionPct(n: number): number {
  if (!Number.isFinite(n)) return LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT
  return Math.max(LOCAL_LIFE_KOL_COMMISSION_MIN_PCT, Math.min(LOCAL_LIFE_KOL_COMMISSION_MAX_PCT, Math.round(n)))
}

function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function recruitWizardStepOf(brief: AiRecruitmentBriefPreview | undefined): RecruitWizardStep {
  const step = brief?.wizardStep
  if (step === 2 || step === 3 || step === 4) return step
  return 1
}

export function buildRecruitWizardSeed(
  userBrief: string,
  assistantContent?: string,
): AiRecruitmentBriefPreview {
  const intent = parseRecruitmentIntentFromText([userBrief, assistantContent].filter(Boolean).join('\n'))
  const ctx = resolveMerchantBriefContext()
  const catalog = loadMerchantBriefProductPicks(24)
  const hint = [userBrief, assistantContent].filter(Boolean).join('\n').slice(0, 3500)
  const { main } = pickBriefMainAndSecondary(userBrief, catalog, hint)
  const contentForm: RecruitContentForm = /图文|笔记/.test(hint)
    ? 'note'
    : /口播|不到店/.test(hint)
      ? 'talk'
      : 'instore'
  const scope: RecruitWizardScope = {
    platform: intent.platform,
    city: intent.city,
    storeName: ctx.storeName?.trim() || '',
    mainProductName: main.name,
    contentForm,
  }
  const headcount =
    intent.headcountHint && intent.headcountHint > 0
      ? intent.headcountHint
      : Math.max(3, Math.min(36, Math.round(intent.budgetYuan / 1200)))
  const budget: RecruitWizardBudget = {
    budgetYuan: intent.budgetYuan > 0 ? intent.budgetYuan : 5000,
    headcount,
    commissionPct: clampRecruitCommissionPct(intent.kolCommissionPct),
  }
  return {
    platform: recruitPlatformLabel(scope.platform),
    mainProductName: scope.mainProductName,
    tags: [],
    briefText: '',
    wizardStep: 1,
    wizardScope: scope,
    wizardBudget: budget,
    wizardBudgetStatus: 'idle',
    wizardShootStatus: 'idle',
    enrichStatus: 'ready',
  }
}

export function summarizeRecruitWizardScope(scope: RecruitWizardScope | undefined): string {
  if (!scope) return ''
  const store = scope.storeName.trim() || scope.city.trim() || '门店待识别'
  return `${recruitPlatformLabel(scope.platform)} · ${store} · ${scope.mainProductName} · ${recruitContentFormLabel(scope.contentForm)}`
}

export function summarizeRecruitWizardBudget(budget: RecruitWizardBudget | undefined): string {
  if (!budget) return ''
  const a = budget.allocation
  const tier =
    a && budget.headcount > 0
      ? ` · V3 ${a.v3} / V4 ${a.v4} / V5 ${a.v5} / V5+ ${a.v5plus}`
      : ''
  return `预算 ¥${budget.budgetYuan.toLocaleString('zh-CN')} · ${budget.headcount} 人 · 佣金 ${budget.commissionPct}%${tier}`
}

type IndustryKind = 'spa' | 'food' | 'digital' | 'life'

function industryKindOf(label: string): IndustryKind {
  const t = label || ''
  if (/洗浴|按摩|足道|SPA|spa|汤泉|养生|美容|美业/.test(t)) return 'spa'
  if (/餐饮|美食|火锅|烧烤|咖啡|茶饮|小吃|食堂/.test(t)) return 'food'
  if (/数码|3c|3C|手机|电脑|电子|科技/.test(t)) return 'digital'
  return 'life'
}

function numbered(items: string[]): string {
  return items.filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n')
}

export function composeRecruitWizardBriefText(
  scope: RecruitWizardScope,
  budget: RecruitWizardBudget,
  shoot: RecruitWizardShoot,
): string {
  const storeLine = [scope.city, scope.storeName].filter(Boolean).join(' · ') || '按门店地址'
  const raw = [
    `【达人招募 Brief】${scope.mainProductName}`,
    `平台：${recruitPlatformLabel(scope.platform)}　形式：${recruitContentFormLabel(scope.contentForm)}`,
    `城市/门店：${storeLine}`,
    `主推：${scope.mainProductName}`,
    `招募人数：${budget.headcount} 人`,
    `档期：报名至 ${shoot.applyDeadline}，成片至 ${shoot.deliverDeadline}`,
    '',
    `一、推广目标`,
    shoot.goal,
    '',
    `二、目标人群`,
    shoot.audience,
    '',
    `三、内容切入`,
    shoot.storyAngle,
    '',
    `四、必讲卖点`,
    numbered(shoot.sellingPoints.filter((p) => !isTalentFacingRecruitmentPriceLeak(p))),
    '',
    `五、必拍镜头`,
    numbered(shoot.mustShoot),
    '',
    `六、口播结构`,
    numbered(shoot.talkTrack),
    shoot.hooks[0] ? `\n主钩子：${shoot.hooks[0]}` : '',
    shoot.hooks[1] ? `备选钩子：${shoot.hooks[1]}` : '',
    '',
    `七、时长与交付`,
    shoot.durationHint,
    shoot.deliverables,
    '',
    `八、转化动作`,
    shoot.convertAction,
    '',
    `九、到店配合`,
    shoot.storeCoop,
    '',
    `十、禁忌`,
    numbered(shoot.tabooItems?.length ? shoot.tabooItems : [shoot.taboo]),
    shoot.hashtags?.length ? `\n话题：${shoot.hashtags.map((t) => `#${t}`).join(' ')}` : '',
  ]
    .filter((line) => line != null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  return stripTalentFacingRecruitmentCopy(raw)
}

export function buildLocalRecruitWizardShoot(
  scope: RecruitWizardScope,
  budget: RecruitWizardBudget,
  industryLabel?: string,
): RecruitWizardShoot {
  const name = scope.mainProductName.trim() || '主推套餐'
  const store = scope.storeName.trim() || '指定门店'
  const kind = industryKindOf(industryLabel || name)
  const form = scope.contentForm
  const applyDeadline = isoDatePlusDays(7)
  const deliverDeadline = isoDatePlusDays(21)

  const byKind = {
    spa: {
      goal: `本单只推「${name}」团购到店核销，让观众看完就能判断适不适合自己，并完成下单或到店预约，不为空泛涨粉。`,
      audience: `本地情侣/夫妻约会、想犒劳自己的上班族，以及第一次到店、需要被讲清楚项目流程和禁忌的新客。`,
      sellingPoints: [
        `开场先讲「${name}」解决什么场景（约会、放松、送礼），不要先报一长串价目。`,
        `说清套餐含几项、大约多久、适不适合两人同行，避免观众以为是单人按摩。`,
        `用到店真实感受讲环境、灯光、私密性和等待体验，少用「高端」「奢华」空词。`,
        `团购价、适用门店（${store}）、营业时段要各说一次，方便直接下单。`,
        `收尾给一个「适合谁 / 不适合谁」，降低到店预期落差。`,
      ],
      storyAngle:
        form === 'talk'
          ? `不到店也可拍：用「上次约会不知道去哪」或「下班只想躺平」切入，再对照套餐能覆盖的项目。`
          : `以一次真实到店为主线：进门→更衣/等待→项目过程（不露隐私部位）→结束后的体感，最后落到团购页。`,
      mustShoot:
        form === 'note'
          ? [
              '门头与店招，让观众确认是哪家店',
              '大厅/走廊氛围（灯光、整洁、等候区），建立安心感',
              '房间一角或设备细节，不拍其他客人面部',
              `${name} 套餐卡或价目，能看清项目名`,
              '团购下单页或核销码示意，服务转化',
              '双人位或两杯茶等「可同行」线索（若门店有）',
            ]
          : form === 'talk'
            ? [
                '出镜口播正面，光线清楚、口播字幕可读',
                `${name} 套餐名称与包含项目特写（图卡或价目）`,
                '门头或室内环境空镜（可用门店提供素材）',
                '团购下单页演示：点哪里、选哪家门店',
                '适合人群/不适合人群字幕卡',
              ]
            : [
                '门头全景，停留至少 2 秒，店名可读',
                '进店接待或等候区，体现干净、好找',
                '房间环境（床位/灯光/香氛），不拍其他客人脸',
                '项目开始前的准备动作（更衣、毛巾、设备），不拍私密部位',
                `${name} 价签/套餐明细，原价与团购价同时入镜一次`,
                '结束后体感或茶水收尾，给「值得再来」的理由',
                '团购链接页或到店核销动作',
              ],
      talkTrack: [
        '开场 3 秒：点出痛点（累、不会挑店、约会没着落），立刻报店名和套餐名。',
        `中间讲「${name}」含什么、大概多久、两个人怎么安排。`,
        '补一条真实细节（水温、房间安静、技师是否讲解），建立可信。',
        '说清团购价、适用门店、是否需预约。',
        '结尾：适合谁 + 引导挂车/领券/到店核销。',
      ],
      hooks: [
        `约会不想只吃饭的话，这家的「${name}」更适合待一下午。`,
        `别只看价，先看「${name}」含几项、能不能两人一起做。`,
      ] as [string, string],
      durationHint:
        form === 'note'
          ? '图文笔记 8～12 张，封面含店名或套餐名；或 1 条 15～30 秒切片。'
          : '成片 30～60 秒为主，可另切 1 条 15 秒钩子；口播需字幕。',
      deliverables:
        form === 'note'
          ? `每人至少 1 篇图文（含封面）或 1 条短视频；须露出门店与「${name}」，并挂团购或写清到店方式。`
          : `每人至少 1 条成片 + 1 张封面；成片须口播或字幕点名「${name}」，并挂团购链接。`,
      convertAction: `视频/笔记内挂「${name}」团购，口播说「链接下单，到 ${store} 核销」；无挂车则引导私信要地址并预约。`,
      storeCoop: `须到 ${store} 拍摄（不到店口播可用店方提供空镜）。到店请提前预约，说明是探店拍摄；是否含套餐体验以商家确认为准，未含则只拍环境与价目，不承诺免费做完全程。`,
      tabooItems: [
        '不说治疗、排毒、治病、正骨疗效等医疗承诺',
        '不对比点名竞品店，不贬低同行',
        '不虚构原价、不说「全网最低」',
        '不拍其他客人面部或更衣室/私密部位',
        '不引导未成年人到店消费',
      ],
      hashtags: ['本地探店', '情侣约会', name.slice(0, 12), '到店核销'],
    },
    food: {
      goal: `本单主推「${name}」到店核销或团购下单，让观众看完知道点什么、多少钱、适不适合聚餐。`,
      audience: `附近上班族、家庭聚餐、朋友小聚，以及第一次来、需要避雷点菜的新客。`,
      sellingPoints: [
        `先报「${name}」是几人份、大概能吃饱还是当配菜。`,
        '讲 1～2 个必点理由（口味、分量、上菜速度），不要报整本菜单。',
        '团购价和到店价差要说清楚，避免到店加价争议。',
        `适用门店 ${store}、是否需预约、高峰是否排队。`,
        '收尾给「适合谁」：约会 / 带孩子 / 请客。',
      ],
      storyAngle:
        form === 'talk'
          ? `用「不知道点什么不踩雷」切入，对照「${name}」的分量与口味。`
          : `按到店顺序拍：门头→座位→上菜→试吃反应→买单/团购页。`,
      mustShoot:
        form === 'note'
          ? ['门头', '招牌或环境座位', `${name} 整盘成品`, '关键食材/做法特写', '价目或团购页', '用餐氛围（不拍陌生人正脸）']
          : [
              '门头全景',
              '店内座位与卫生',
              `${name} 上桌成品，停留看清卖相`,
              '试吃或切开/蘸料细节',
              '价签或团购页',
              '收尾买单或打包',
            ],
      talkTrack: [
        '开场报店名和「今天只点这一份」。',
        `介绍「${name}」几人份、口味、有没有雷。`,
        '补一句环境或服务（等位、上菜）。',
        '报团购价和适用门店。',
        '引导挂车下单或到店报团购。',
      ],
      hooks: [
        `来${store}别乱点，先看「${name}」适不适合你们这桌。`,
        `这份「${name}」是给聚餐的，不是单人加餐。`,
      ] as [string, string],
      durationHint: '成片 30～45 秒，或笔记 8～10 图；食物特写至少 3 秒。',
      deliverables: `每人 1 条成片或 1 篇笔记；须露出「${name}」与门店，并挂团购。`,
      convertAction: `挂「${name}」团购，口播「链接下单，到店核销」；说明是否需预约。`,
      storeCoop: `到 ${store} 拍摄请错开高峰或先预约；是否含套餐以商家确认为准，未含则自费点「${name}」拍摄。`,
      tabooItems: [
        '不说祖传秘方、国家认证等无法核实的说法',
        '不拍后厨卫生死角恐吓观众',
        '不虚构分量或赠品',
        '不对比点名隔壁店',
      ],
      hashtags: ['探店', '本地美食', name.slice(0, 12), '团购'],
    },
    digital: {
      goal: `讲清「${name}」适不适合到店体验/购买，推动到店看机或下单，不空喊性价比。`,
      audience: `学生、换机用户、家庭娱乐采购，需要对比参数但不想被话术带跑的人。`,
      sellingPoints: [
        `「${name}」解决什么使用场景（上课、通勤、家里投屏等）。`,
        '讲 2 个可感知卖点（续航、接口、质感），少堆参数表。',
        '到店能否试用、有无学生/以旧换新，说清楚门槛。',
        `门店 ${store} 的库存或预约方式。`,
      ],
      storyAngle: `用一个真实使用场景带出「${name}」，再给到店核验的理由。`,
      mustShoot: ['门头', '柜台或体验桌', `${name} 真机细节`, '价签/活动牌', '团购或预约页'],
      talkTrack: [
        '开场说自己要解决的使用问题。',
        `对照「${name}」两点体验。`,
        '提醒到店看成色/配件。',
        '引导预约或挂车。',
      ],
      hooks: [
        `别只看参数，「${name}」适不适合你，到店摸一下更准。`,
        `学生党先看「${name}」包不包含配件，再谈价。`,
      ] as [string, string],
      durationHint: '成片 30～45 秒，真机特写清楚。',
      deliverables: `1 条成片；须露出「${name}」与门店，并说明如何到店。`,
      convertAction: '挂链接或引导到店预约看机，不承诺线下价格与线上完全一致。',
      storeCoop: `到 ${store} 拍摄需店员同意；不拆封未售商品，不拍其他顾客屏幕隐私。`,
      tabooItems: ['不承诺官方授权无法核实的说法', '不对比点名友商门店', '不泄露顾客信息'],
      hashtags: ['数码探店', name.slice(0, 12), '到店体验'],
    },
    life: {
      goal: `本单主推「${name}」，目标是到店核销或团购下单，内容必须让观众知道去哪、买什么、怎么约。`,
      audience: `门店周边居民、第一次到店的新客，以及需要被讲清流程和注意事项的人。`,
      sellingPoints: [
        `「${name}」适合什么场景，不要只重复套餐名。`,
        '用 2 条可感知体验（环境、耗时、是否需预约）建立信任。',
        `团购价、适用门店 ${store}、是否限时段，各说一次。`,
        '收尾「适合谁 / 不适合谁」。',
      ],
      storyAngle:
        form === 'talk'
          ? `用一个具体生活场景切入，再落到「${name}」怎么解决。`
          : `按到店路径拍完整：找店→体验→价目→下单。`,
      mustShoot: [
        '门头，店名可读',
        '店内环境主视觉',
        `${name} 服务或商品特写`,
        '价目或团购页',
        '转化动作（下单/预约）',
      ],
      talkTrack: [
        '开场痛点 + 店名。',
        `讲「${name}」含什么、要多久。`,
        '补一条真实细节。',
        '报价格和门店。',
        '引导挂车或预约。',
      ],
      hooks: [
        `来之前先看「${name}」到底含什么，别到店才问。`,
        `适合第一次来的人：流程短、好预约。`,
      ] as [string, string],
      durationHint: form === 'note' ? '图文 8～12 张或 1 条短视频。' : '成片 30～60 秒，需字幕。',
      deliverables: `每人 1 条成片或 1 篇笔记，须露出「${name}」并挂团购或写清预约方式。`,
      convertAction: `挂「${name}」团购，口播到 ${store} 核销；无团购则引导预约到店。`,
      storeCoop: `拍摄以 ${store} 为准，请提前预约并告知探店身份；是否含套餐体验以商家确认为准。`,
      tabooItems: ['不承诺无法兑现的效果', '不对比点名竞品', '不虚构原价或赠品', '不拍其他客人正脸'],
      hashtags: ['本地生活', '探店', name.slice(0, 12)],
    },
  }[kind]

  const shoot: RecruitWizardShoot = {
    goal: byKind.goal,
    audience: byKind.audience,
    sellingPoints: byKind.sellingPoints,
    storyAngle: byKind.storyAngle,
    mustShoot: byKind.mustShoot,
    talkTrack: byKind.talkTrack,
    hooks: byKind.hooks,
    durationHint: byKind.durationHint,
    deliverables: byKind.deliverables,
    convertAction: byKind.convertAction,
    storeCoop: byKind.storeCoop,
    taboo: byKind.tabooItems.join('；'),
    tabooItems: byKind.tabooItems,
    hashtags: byKind.hashtags.filter(Boolean),
    applyDeadline,
    deliverDeadline,
    briefText: '',
  }
  shoot.briefText = composeRecruitWizardBriefText(scope, budget, shoot)
  return shoot
}

export function mergeRecruitWizardShoot(
  base: RecruitWizardShoot,
  patch: {
    goal?: string
    audience?: string
    sellingPoints?: string[]
    storyAngle?: string
    mustShoot?: string[]
    talkTrack?: string[]
    hooks?: [string, string]
    durationHint?: string
    deliverables?: string
    convertAction?: string
    storeCoop?: string
    tabooItems?: string[]
    hashtags?: string[]
  },
): RecruitWizardShoot {
  const take = (v: string | undefined, fallback: string) => (v && v.length >= 8 ? v : fallback)
  const takeList = (v: string[] | undefined, fallback: string[]) =>
    v && v.length >= 3 ? v : fallback
  const next: RecruitWizardShoot = {
    ...base,
    goal: take(patch.goal, base.goal),
    audience: take(patch.audience, base.audience),
    sellingPoints: takeList(patch.sellingPoints, base.sellingPoints),
    storyAngle: take(patch.storyAngle, base.storyAngle),
    mustShoot: takeList(patch.mustShoot, base.mustShoot),
    talkTrack: takeList(patch.talkTrack, base.talkTrack),
    hooks: patch.hooks && patch.hooks[0] && patch.hooks[1] ? patch.hooks : base.hooks,
    durationHint: take(patch.durationHint, base.durationHint),
    deliverables: take(patch.deliverables, base.deliverables),
    convertAction: take(patch.convertAction, base.convertAction),
    storeCoop: take(patch.storeCoop, base.storeCoop),
    tabooItems: patch.tabooItems && patch.tabooItems.length >= 3 ? patch.tabooItems : base.tabooItems,
    hashtags: patch.hashtags && patch.hashtags.length >= 3 ? patch.hashtags : base.hashtags,
    applyDeadline: base.applyDeadline,
    deliverDeadline: base.deliverDeadline,
    briefText: '',
  }
  next.taboo = next.tabooItems.join('；')
  return next
}

export function composeRecruitWizardUserBrief(
  scope: RecruitWizardScope,
  budget: RecruitWizardBudget,
  fallback: string,
): string {
  return [
    fallback.replace(/\[引用[\s\S]*?\n\n/, '').trim(),
    `预算:${budget.budgetYuan}元`,
    `招募${budget.headcount}个达人`,
    scope.city ? `在${scope.city.endsWith('市') ? scope.city : `${scope.city}市`}` : '',
    `佣金:${budget.commissionPct}%`,
    scope.platform === '小红书' ? '小红书' : '抖音',
    scope.mainProductName,
  ]
    .filter(Boolean)
    .join(' ')
}

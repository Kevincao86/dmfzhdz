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

export const RECRUIT_WIZARD_STEP_META: Record<
  RecruitWizardStep,
  { title: string; hint: string }
> = {
  1: { title: '发什么、发给谁', hint: '先核对主推品、平台和城市，确认后再看预算。' },
  2: { title: '花多少、招几人', hint: '核对预算和人数，确认后再写拍摄要求。' },
  3: { title: '怎么拍、何时交', hint: '核对拍摄要点和档期，确认后看汇总。' },
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

export function composeRecruitWizardBriefText(
  scope: RecruitWizardScope,
  budget: RecruitWizardBudget,
  shoot: RecruitWizardShoot,
): string {
  return [
    `【达人招募 Brief】${scope.mainProductName}`,
    `平台：${recruitPlatformLabel(scope.platform)}`,
    `城市/门店：${[scope.city, scope.storeName].filter(Boolean).join(' · ') || '按门店地址'}`,
    `形式：${recruitContentFormLabel(scope.contentForm)}`,
    `主推：${scope.mainProductName}`,
    `卖点：${shoot.sellingPoints.filter(Boolean).join('；')}`,
    `必拍：${shoot.mustShoot.filter(Boolean).join('；')}`,
    `转化：${shoot.convertAction}`,
    `禁忌：${shoot.taboo}`,
    `档期：报名至 ${shoot.applyDeadline}，成片至 ${shoot.deliverDeadline}`,
    `预算：¥${budget.budgetYuan} · ${budget.headcount} 人 · 佣金 ${budget.commissionPct}%`,
    shoot.hooks[0] ? `口播钩子：${shoot.hooks[0]}` : '',
    shoot.hooks[1] ? `备选钩子：${shoot.hooks[1]}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildLocalRecruitWizardShoot(
  scope: RecruitWizardScope,
  budget: RecruitWizardBudget,
): RecruitWizardShoot {
  const sellingPoints = [
    `主推「${scope.mainProductName}」`,
    '到店体验真实可感',
    '团购价下单/核销',
  ]
  const mustShoot =
    scope.contentForm === 'note'
      ? ['门头或环境', '套餐细节特写', '价签或团购页']
      : scope.contentForm === 'talk'
        ? ['出镜口播', '套餐卖点特写', '下单页引导']
        : ['门头', '项目/套餐过程', '价签或团购页']
  const convertAction = '挂团购链接，引导到店核销'
  const taboo = '不承诺疗效、不对比竞品、不虚构原价'
  const hooks: [string, string] = [
    `先讲痛点，再引出「${scope.mainProductName}」`,
    `用真实到店场景带出「${scope.mainProductName}」`,
  ]
  const shoot: RecruitWizardShoot = {
    sellingPoints,
    mustShoot,
    convertAction,
    taboo,
    applyDeadline: isoDatePlusDays(7),
    deliverDeadline: isoDatePlusDays(21),
    hooks,
    briefText: '',
  }
  shoot.briefText = composeRecruitWizardBriefText(scope, budget, shoot)
  return shoot
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

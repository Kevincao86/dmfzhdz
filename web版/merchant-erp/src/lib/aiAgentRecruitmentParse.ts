import type { KolTierStrategy } from './opsRegistryTypes'
import { LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT } from './localLifeKolCommission'
import type { RecruitmentPlatform } from './recruitmentPlatformOptions'

/** 从用户自然语言中解析招募意图（预算、人数、城市、平台等） */
export type AiRecruitmentIntent = {
  budgetYuan: number
  /** 方案/话术里写了达人预算（非默认 5000） */
  budgetFromPlan?: boolean
  headcountHint?: number
  headcountFromPlan?: boolean
  city: string
  platform: '抖音' | '小红书'
  platforms: RecruitmentPlatform[]
  industry: string
  strategy: KolTierStrategy
  kolCommissionPct: number
}

const NON_TALENT_BUDGET_RE = /视频制作|剪辑费用|剪辑|后期制作|拍摄制作|素材制作|直播间装修|道具|投流物料/
const TALENT_BUDGET_HINT_RE = /达人|车马费|KOL|kol/

function yuanFromCapture(raw: string, wan?: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return wan ? Math.round(n * 10000) : Math.round(n)
}

function clampRecruitBudget(n: number): number {
  if (!Number.isFinite(n) || n < 100) return 0
  return Math.min(500_000, Math.round(n))
}

function clampRecruitHeadcount(n: number): number | undefined {
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(80, Math.round(n))
}

/** 方案正文里的达人预算（优先「达人费用」行，排除视频制作等） */
export function extractTalentPlanBudgetYuan(text: string): number {
  const t = String(text || '').replace(/,/g, '')
  let sum = 0
  const lineRe = /预算\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(万)?\s*元?[^\n]{0,80}/g
  for (const m of t.matchAll(lineRe)) {
    const line = m[0]
    if (NON_TALENT_BUDGET_RE.test(line) && !TALENT_BUDGET_HINT_RE.test(line)) continue
    if (!TALENT_BUDGET_HINT_RE.test(line)) continue
    const n = clampRecruitBudget(yuanFromCapture(m[1], m[2]))
    if (n > 0) sum += n
  }
  if (sum > 0) return sum

  let labeled = 0
  const labeledRe = /达人(?:费用|预算|投放|合作(?:费用)?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(万)?/g
  for (const m of t.matchAll(labeledRe)) {
    const n = clampRecruitBudget(yuanFromCapture(m[1], m[2]))
    if (n > 0) labeled += n
  }
  if (labeled > 0) return labeled

  const jsonM = t.match(
    /"(?:talentBudget|kolBudget|influencerBudget|talent_budget)"\s*:\s*(?:\{\s*"[^"]+"\s*:\s*)?(\d{3,7})/,
  )
  if (jsonM) return clampRecruitBudget(Number(jsonM[1]))
  return 0
}

/** 方案里的达人数：3-5 位取中值；单值按「邀请/招募 N 位达人」 */
export function extractTalentPlanHeadcount(text: string): number | undefined {
  const t = String(text || '')
  const range = t.match(/(\d{1,2})\s*[-~～—至到]\s*(\d{1,2})\s*[位个名]?\s*(?:城市)?达人/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (a >= 1 && b >= a && b <= 80) return clampRecruitHeadcount(Math.round((a + b) / 2))
  }
  const labeled = t.match(/(?:邀请|招募|合作|安排|找)\s*(\d{1,2})\s*[位个名]?\s*(?:城市)?达人/)
  if (labeled) return clampRecruitHeadcount(Number(labeled[1]))
  const plain = t.match(/(\d{1,2})\s*[位个名]\s*(?:城市)?达人/)
  if (plain) return clampRecruitHeadcount(Number(plain[1]))
  const m1 = t.match(/招募\s*(\d+)\s*个?达人/i)
  if (m1) return clampRecruitHeadcount(Number(m1[1]))
  const m2 = t.match(/(\d+)\s*个达人/)
  if (m2) return clampRecruitHeadcount(Number(m2[1]))
  return undefined
}

function parseBudgetYuan(text: string): number {
  const talent = extractTalentPlanBudgetYuan(text)
  if (talent > 0) return talent

  const t = text.replace(/,/g, '')
  const lineRe = /预算\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(万)?\s*元?[^\n]{0,80}/g
  for (const m of t.matchAll(lineRe)) {
    const line = m[0]
    if (NON_TALENT_BUDGET_RE.test(line) && !TALENT_BUDGET_HINT_RE.test(line)) continue
    const n = clampRecruitBudget(yuanFromCapture(m[1], m[2]))
    if (n > 0) return n
  }
  const m2 = t.match(/(\d+(?:\.\d+)?)\s*万\s*元?/)
  if (m2) return clampRecruitBudget(yuanFromCapture(m2[1], '万'))
  return 0
}

function parseHeadcount(text: string): number | undefined {
  return extractTalentPlanHeadcount(text)
}

function parseCity(text: string): string {
  const m = text.match(/([\u4e00-\u9fa5]{2,12}?)市/)
  if (m) return `${m[1]}市`
  const m2 = text.match(/在\s*([\u4e00-\u9fa5]{2,8})/)
  if (m2) return m2[1].endsWith('市') ? m2[1] : `${m2[1]}市`
  return ''
}

function parsePlatforms(text: string): RecruitmentPlatform[] {
  const found: RecruitmentPlatform[] = []
  const rules: [RegExp, RecruitmentPlatform][] = [
    [/抖音|douyin/i, '抖音'],
    [/小红书|红薯|种草笔记|xiaohongshu|\bxhs\b/i, '小红书'],
    [/大众点评|美团点评/, '大众点评'],
    [/快手|kuaishou/i, '快手'],
    [/视频号/, '微信视频号'],
  ]
  for (const [re, p] of rules) {
    if (re.test(text) && !found.includes(p)) found.push(p)
  }
  return found.length ? found : ['抖音']
}

function primaryPlatformOf(platforms: RecruitmentPlatform[]): '抖音' | '小红书' {
  if (platforms.includes('抖音')) return '抖音'
  if (platforms.includes('小红书')) return '小红书'
  return '抖音'
}

function parseStrategy(text: string): KolTierStrategy {
  if (/v3|V3|低粉|素人/.test(text) && /多|偏|优先/.test(text)) return 'more_v3'
  if (/v5|V5|高粉|头部/.test(text) && /多|偏|优先/.test(text)) return 'more_v5'
  return 'more_v4'
}

function parseKolCommission(text: string): number {
  const m = text.match(/佣金\s*[:：]?\s*(\d{1,2})\s*%?/)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n)) return Math.max(0, Math.min(80, n))
  }
  return LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT
}

/** 合并用户多轮输入与 Brief 上下文解析招募参数 */
export function parseRecruitmentIntentFromText(userBrief: string): AiRecruitmentIntent {
  const text = userBrief.trim()
  const talentBudget = extractTalentPlanBudgetYuan(text)
  const genericBudget = talentBudget > 0 ? 0 : parseBudgetYuan(text)
  const parsedBudget = talentBudget > 0 ? talentBudget : genericBudget
  const budgetFromPlan = parsedBudget > 0
  const budgetYuan = budgetFromPlan ? parsedBudget : 5000
  const headcountHint = parseHeadcount(text)

  const platforms = parsePlatforms(text)
  return {
    budgetYuan,
    budgetFromPlan,
    headcountHint,
    headcountFromPlan: headcountHint != null && headcountHint > 0,
    city: parseCity(text),
    platform: primaryPlatformOf(platforms),
    platforms,
    industry: /餐饮|美食|火锅|烧烤/.test(text) ? '餐饮' : '本地生活',
    strategy: parseStrategy(text),
    kolCommissionPct: parseKolCommission(text),
  }
}

/** 向导填预算/人数：首次用方案里达人规划；之后尊重用户手改，0 则回填方案 */
export function mergeWizardBudgetFromPlan(params: {
  current: { budgetYuan: number; headcount: number }
  planText: string
  firstFill: boolean
}): { budgetYuan: number; headcount: number } {
  const intent = parseRecruitmentIntentFromText(params.planText)
  let budgetYuan = params.current.budgetYuan
  let headcount = params.current.headcount
  if (params.firstFill) {
    if (intent.budgetFromPlan && intent.budgetYuan > 0) budgetYuan = intent.budgetYuan
    if (intent.headcountFromPlan && intent.headcountHint && intent.headcountHint > 0) {
      headcount = intent.headcountHint
    }
  }
  if (!(budgetYuan > 0)) budgetYuan = intent.budgetYuan > 0 ? intent.budgetYuan : 5000
  if (!(headcount > 0)) {
    headcount =
      intent.headcountHint && intent.headcountHint > 0
        ? intent.headcountHint
        : Math.max(3, Math.min(36, Math.round(budgetYuan / 1200)))
  }
  return { budgetYuan, headcount }
}

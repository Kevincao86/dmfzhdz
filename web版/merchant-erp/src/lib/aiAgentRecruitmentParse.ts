import type { KolTierStrategy } from './opsRegistryTypes'
import { LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT } from './localLifeKolCommission'

/** 从用户自然语言中解析招募意图（预算、人数、城市、平台等） */
export type AiRecruitmentIntent = {
  budgetYuan: number
  headcountHint?: number
  city: string
  platform: '抖音' | '小红书'
  industry: string
  strategy: KolTierStrategy
  kolCommissionPct: number
}

function parseBudgetYuan(text: string): number {
  const t = text.replace(/,/g, '')
  const m1 = t.match(/预算\s*[:：]?\s*(\d+(?:\.\d+)?)\s*万?/i)
  if (m1) {
    const n = Number(m1[1])
    return Number.isFinite(n) ? (t.includes('万') && m1[0].includes('万') ? Math.round(n * 10000) : Math.round(n)) : 0
  }
  const m2 = t.match(/(\d+(?:\.\d+)?)\s*万\s*元?/)
  if (m2) {
    const n = Number(m2[1])
    return Number.isFinite(n) ? Math.round(n * 10000) : 0
  }
  const m3 = t.match(/(\d{3,6})\s*元/)
  if (m3) {
    const n = Number(m3[1])
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function parseHeadcount(text: string): number | undefined {
  const m1 = text.match(/招募\s*(\d+)\s*个?达人/i)
  if (m1) return Number(m1[1])
  const m2 = text.match(/(\d+)\s*个?达人/)
  if (m2) return Number(m2[1])
  return undefined
}

function parseCity(text: string): string {
  const m = text.match(/([\u4e00-\u9fa5]{2,12}?)市/)
  if (m) return `${m[1]}市`
  const m2 = text.match(/在\s*([\u4e00-\u9fa5]{2,8})/)
  if (m2) return m2[1].endsWith('市') ? m2[1] : `${m2[1]}市`
  return ''
}

function parsePlatform(text: string): '抖音' | '小红书' {
  if (/小红书|红薯|种草笔记/.test(text)) return '小红书'
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
  let budgetYuan = parseBudgetYuan(text)
  if (budgetYuan <= 0) {
    const nums = [...text.matchAll(/(\d{3,6})/g)].map((m) => Number(m[1])).filter((n) => n >= 500 && n <= 500000)
    if (nums.length) budgetYuan = nums[0]
  }
  if (budgetYuan <= 0) budgetYuan = 5000

  return {
    budgetYuan,
    headcountHint: parseHeadcount(text),
    city: parseCity(text),
    platform: parsePlatform(text),
    industry: /餐饮|美食|火锅|烧烤/.test(text) ? '餐饮' : '本地生活',
    strategy: parseStrategy(text),
    kolCommissionPct: parseKolCommission(text),
  }
}

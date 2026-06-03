import { normalizePlatform } from './platformLabels'

export type EnrichedMpOrder = {
  mpOrderId: string
  merchantOrderNo: string
  merchantName: string
  storeName: string
  title: string
  platform: string
  region: string
  category: string
  fansRequirement: string
  budgetText: string
  recruitCount: string
  recruitmentInfo: string
  recruitmentInfoLines: string[]
  taskDetail: string
  taskDetailLines: string[]
  applicantCount: number
  status: string
  isIce: boolean
}

function splitLines(text: string) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function enrichMpOrder(mp: Record<string, unknown>): EnrichedMpOrder {
  const customerName = String(mp.customerName || mp.title || '—')
  const storeName = String(mp.storeName || '—')
  const platform = normalizePlatform(mp.platform || '抖音')
  const region = String(mp.region || storeName || '—')
  const category = String(mp.category || '本地生活')
  const serviceAmount = mp.serviceAmount != null ? Number(mp.serviceAmount) : 0
  const budgetText =
    String(mp.budgetText || '') || (serviceAmount > 0 ? `¥${serviceAmount.toLocaleString('zh-CN')}` : '面议')
  const recruitCount = String(mp.recruitCount || 1)
  const title = String(mp.title || '').trim() || `${customerName}·达人招募`
  const recruitmentInfo = String(mp.recruitmentInfo || mp.merchantRequirements || '—')
  const taskDetail = String(mp.taskDetail || mp.merchantRequirements || recruitmentInfo)
  const isIce = mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'
  return {
    mpOrderId: String(mp.id || ''),
    merchantOrderNo: String(mp.id || '—'),
    merchantName: customerName,
    storeName,
    title,
    platform,
    region,
    category,
    fansRequirement: String(mp.fansRequirement || '≥5000'),
    budgetText,
    recruitCount,
    recruitmentInfo,
    recruitmentInfoLines: splitLines(recruitmentInfo),
    taskDetail,
    taskDetailLines: splitLines(taskDetail),
    applicantCount: Array.isArray(mp.applicants) ? mp.applicants.length : 0,
    status: String(mp.status || 'open'),
    isIce,
  }
}

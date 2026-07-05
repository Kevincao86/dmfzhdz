import { resolveDeadlineMsFromMp, resolveApplicantCountFromMp } from '../mpRecruitment/listFilters'
import { patchRecruitmentInfoTierQuotes } from './mpRecruitmentTierQuote'
import { normalizePlatform } from './platformLabels'
import {
  formatFormRelayRecruitmentText,
  isFormRelayGroupQrRelay,
  isFormRelayOrder,
  isFormRelaySourceLinkLine,
  readExternalFormRelay,
} from '@merchant/lib/formRelayPlatforms'

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
  isFormRelay: boolean
  formRelayGroupQr: boolean
  deadlineMs: number
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
  const isFormRelay = isFormRelayOrder(mp)
  const formRelay = readExternalFormRelay(mp)
  let recruitmentInfo = String(mp.recruitmentInfo || mp.merchantRequirements || '—')
  let taskDetail = String(mp.taskDetail || mp.merchantRequirements || recruitmentInfo)
  const publishMeta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  if (publishMeta) {
    recruitmentInfo = patchRecruitmentInfoTierQuotes(recruitmentInfo, publishMeta)
    taskDetail = patchRecruitmentInfoTierQuotes(taskDetail, publishMeta)
  }
  if (isFormRelay) {
    recruitmentInfo = formatFormRelayRecruitmentText(recruitmentInfo, formRelay)
    taskDetail = formatFormRelayRecruitmentText(taskDetail, formRelay)
  }
  const isIce = mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'
  const summaryForDeadline = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = resolveDeadlineMsFromMp(mp, summaryForDeadline)
  let recruitmentInfoLines = splitLines(recruitmentInfo).filter(
    (l) => !/^招募标题[:：]/.test(String(l || '').trim()),
  )
  if (isFormRelay) {
    recruitmentInfoLines = recruitmentInfoLines.filter((l) => !isFormRelaySourceLinkLine(l))
  }
  const taskDetailLinesRaw = splitLines(taskDetail)
  const taskDetailLines = isFormRelay
    ? taskDetailLinesRaw.filter((l) => !isFormRelaySourceLinkLine(l))
    : taskDetailLinesRaw
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
    recruitmentInfoLines,
    taskDetail,
    taskDetailLines: taskDetailLines,
    applicantCount: resolveApplicantCountFromMp(mp),
    status: String(mp.status || 'open'),
    isIce,
    isFormRelay,
    formRelayGroupQr: isFormRelayGroupQrRelay(formRelay),
    deadlineMs,
  }
}

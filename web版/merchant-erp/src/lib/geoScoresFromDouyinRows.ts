import type { DouyinStoreRow } from '../services/douyinMerchantApi'
import type { GeoHealthInputs } from './geoModuleSpec'
import { contentFreshnessPercentFromLastUpdate } from './geoModuleSpec'

/** 与概览「问法覆盖」演示表结构一致，供无 AI 时展示 */
export const DEFAULT_GEO_QUERY_SAMPLES: { q: string; covered: boolean }[] = [
  { q: '附近有什么好吃的火锅', covered: true },
  { q: '这家店营业到几点', covered: true },
  { q: '有没有停车位', covered: false },
  { q: '支持团购核销吗', covered: true },
  { q: '人均消费大概多少', covered: false },
]

function infoCompletenessOneStore(s: DouyinStoreRow): number {
  const checks = [
    Boolean(s.name?.trim()),
    Boolean(s.address?.trim()),
    Boolean(s.city?.trim() || (s.address && s.address.trim().length > 8)),
    Boolean(s.businessHours?.trim()),
    Boolean(s.phone?.trim()),
    Boolean(s.avatarUrl?.trim()),
    Boolean(/停车|车位|车库|Parking/i.test(`${s.announcement ?? ''}${s.address ?? ''}`)),
  ]
  return Math.round((checks.filter(Boolean).length / 7) * 100)
}

function maxUpdatedAtMs(stores: DouyinStoreRow[]): number {
  let t = 0
  for (const s of stores) {
    const raw = s.updatedAt?.trim()
    if (!raw) continue
    const ms = Date.parse(raw)
    if (!Number.isNaN(ms)) t = Math.max(t, ms)
  }
  return t > 0 ? t : Date.now() - 14 * 24 * 60 * 60 * 1000
}

/**
 * 无模型或模型 JSON 解析失败时，基于抖音来客列表行做保守估算（与 geoModuleSpec 权重配合使用）。
 */
export function computeDeterministicGeoFromStores(stores: DouyinStoreRow[]): {
  inputs: GeoHealthInputs
  lastStructuredContentUpdateMs: number
  querySamples: { q: string; covered: boolean }[]
} {
  if (stores.length === 0) {
    return {
      inputs: { infoCompletenessPercent: 0, questionCoveragePercent: 0, contentFreshnessPercent: 0 },
      lastStructuredContentUpdateMs: Date.now(),
      querySamples: DEFAULT_GEO_QUERY_SAMPLES.map((x) => ({ ...x })),
    }
  }

  const infoCompletenessPercent = Math.round(
    stores.reduce((sum, s) => sum + infoCompletenessOneStore(s), 0) / stores.length,
  )

  const qChecks: { q: string; covered: boolean }[] = [
    { q: '这家店营业到几点', covered: stores.some((s) => Boolean(s.businessHours?.trim())) },
    { q: '地址在哪里', covered: stores.some((s) => Boolean(s.address?.trim())) },
    {
      q: '有没有停车位',
      covered: stores.some((s) => /停|车位|车库/i.test(`${s.announcement ?? ''}${s.address ?? ''}`)),
    },
    { q: '联系电话多少', covered: stores.some((s) => Boolean(s.phone?.trim())) },
    { q: '店名叫什么', covered: stores.some((s) => Boolean(s.name?.trim())) },
  ]
  const covered = qChecks.filter((x) => x.covered).length
  const questionCoveragePercent = Math.round((covered / qChecks.length) * 100)

  const lastStructuredContentUpdateMs = maxUpdatedAtMs(stores)
  const contentFreshnessPercent = contentFreshnessPercentFromLastUpdate(lastStructuredContentUpdateMs)

  return {
    inputs: { infoCompletenessPercent, questionCoveragePercent, contentFreshnessPercent },
    lastStructuredContentUpdateMs,
    querySamples: qChecks,
  }
}

/** 供已对接文本模型做 GEO 综合评分的上下文 JSON（字符串） */
export function buildGeoScoreContextPayload(args: {
  scope: 'account' | 'brand' | 'single'
  brandKeyword?: string
  accountName?: string
  stores: DouyinStoreRow[]
}): string {
  const storesPayload = args.stores.slice(0, 45).map((s) => ({
    poi_id: s.id,
    poi_name: s.name,
    brand_name: s.brandName,
    address: s.address,
    city: s.city,
    business_hours: s.businessHours,
    phone: s.phone,
    has_head_image: Boolean(s.avatarUrl),
    announcement: (s.announcement ?? '').slice(0, 280),
    updated_at: s.updatedAt,
    business_status: s.businessStatus,
    claim_status: s.claimStatus,
  }))
  return JSON.stringify(
    {
      scope: args.scope,
      brand_filter: args.brandKeyword?.trim() || null,
      account_name: args.accountName ?? null,
      store_count: args.stores.length,
      stores: storesPayload,
      scoring_spec: {
        health_score_formula: 'health = infoCompleteness*0.4 + questionCoverage*0.35 + contentFreshness*0.25（满分100）',
        info_dimensions_hint: '名称、地址、定位线索、营业时间、电话、门头图、停车相关表述',
        question_coverage_hint: '用户常问：营业、地址、停车、电话、团购/预约等是否在事实中可答',
        freshness_hint: '依据各店 updated_at 推断内容维护活跃度；无时间则给中性偏低分',
      },
    },
    null,
    0,
  )
}

import type { DouyinStoreRow } from '../services/douyinMerchantApi'

export type GeoStoreDiagnosticRow = {
  poiId: string
  name: string
  brandName?: string
  completenessPercent: number
  missingFields: string[]
  parkingMentioned: boolean
  hasAvatar: boolean
  updatedAt?: string
}

const FIELD_LABELS: Record<string, string> = {
  storeName: '店名',
  address: '地址',
  businessHours: '营业时间',
  phone: '电话',
  mainDoorImg: '门头图',
  parkingInfo: '停车信息',
}

function storeCompleteness(s: DouyinStoreRow): { percent: number; missing: string[] } {
  const checks: { key: string; ok: boolean }[] = [
    { key: 'storeName', ok: Boolean(s.name?.trim()) },
    { key: 'address', ok: Boolean(s.address?.trim() && s.address.length > 4) },
    { key: 'businessHours', ok: Boolean(s.businessHours?.trim()) },
    { key: 'phone', ok: Boolean(s.phone?.trim()) },
    { key: 'mainDoorImg', ok: Boolean(s.avatarUrl?.trim()) },
    {
      key: 'parkingInfo',
      ok: /停|车位|车库/i.test(`${s.announcement ?? ''}${s.address ?? ''}`),
    },
  ]
  const missing = checks.filter((c) => !c.ok).map((c) => FIELD_LABELS[c.key] ?? c.key)
  const ok = checks.filter((c) => c.ok).length
  const percent = Math.round((ok / checks.length) * 100)
  return { percent, missing }
}

export function computePerStoreGeoDiagnostics(stores: DouyinStoreRow[]): GeoStoreDiagnosticRow[] {
  return stores.map((s) => {
    const { percent, missing } = storeCompleteness(s)
    const parkingMentioned = !missing.includes(FIELD_LABELS.parkingInfo)
    return {
      poiId: s.id,
      name: s.name,
      brandName: s.brandName,
      completenessPercent: percent,
      missingFields: missing,
      parkingMentioned,
      hasAvatar: Boolean(s.avatarUrl?.trim()),
      updatedAt: s.updatedAt,
    }
  })
}

export function geoOptimizationPlaybook(healthScore: number): { phase: string; items: string[] }[] {
  const base = [
    {
      phase: '第 1 周 · 事实库打底',
      items: [
        '补全各店地址、营业时间与电话（来客 ↔ ERP 一致）',
        '上传门头图并在公告中写明停车/预约规则',
        '在「问法覆盖」中核对营业、停车、套餐三类高频问法',
      ],
    },
    {
      phase: '第 2–3 周 · 内容与问法',
      items: [
        '在「AI 文章与话题」生成 FAQ / 门店摘要并沉淀到内容库',
        '用「AI 咨询测试」验证模型是否瞎编地址或营业时间',
        '针对未覆盖问法在店铺公告或商品卖点中补齐口径',
      ],
    },
    {
      phase: '持续 · 监测闭环',
      items: [
        '每 7 天同步来客并重新 AI 评分，追踪健康分变化',
        '结合「竞争对手分析」更新差异化话术与组品策略',
        '评论管理中的高赞评价提炼为口碑证据短语',
      ],
    },
  ]
  if (healthScore >= 90) {
    return [
      {
        phase: '维持期',
        items: ['保持 7 日内来客数据更新', '每月扩展 2–3 条新问法覆盖', '大促前刷新活动要点进内容库'],
      },
      ...base.slice(2),
    ]
  }
  return base
}

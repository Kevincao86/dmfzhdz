export const LIVE_PLATFORMS = ['抖音直播', '快手直播', '视频号直播', '淘宝直播'] as const

export const LIVE_TYPES = ['专场带货', '混场种草', '品牌发布会', '门店直播'] as const

export const LIVE_DURATIONS = ['1-2小时', '2-4小时', '4小时以上'] as const

export const SAMPLE_POLICIES = ['商家寄样', '达人自备', '无需样品', '到店体验后播'] as const

export type LivePublishFields = {
  livePlatform: string
  liveDate: string
  liveTimeStart: string
  liveDuration: string
  liveType: string
  productSummary: string
  samplePolicy: string
  scriptRequirement: string
}

export function emptyLiveFields(): LivePublishFields {
  return {
    livePlatform: '',
    liveDate: '',
    liveTimeStart: '',
    liveDuration: '',
    liveType: '',
    productSummary: '',
    samplePolicy: '',
    scriptRequirement: '',
  }
}

export function defaultLiveApplyFields() {
  return [
    { id: 'lv-nick', role: 'platformNickname', required: true },
    { id: 'lv-acct', role: 'platformAccount', required: true },
    { id: 'lv-fans', role: 'followers', required: true },
    { id: 'lv-wx', role: 'wechatId', required: true },
    { id: 'lv-phone', role: 'contact', required: true },
    { id: 'lv-quote', role: 'quotePrice', required: true },
    { id: 'lv-dylevel', role: 'douyinSalesLevel', required: false },
    { id: 'lv-alipay', role: 'alipayAccount', required: true },
  ]
}

export function isDouyinLivePlatform(livePlatform: string) {
  return String(livePlatform || '').includes('抖音')
}

export function validateLivePublish(f: LivePublishFields): string | null {
  if (!String(f.livePlatform || '').trim()) return '请选择直播平台'
  if (!String(f.liveDate || '').trim()) return '请选择直播日期'
  if (!String(f.liveTimeStart || '').trim()) return '请选择开播时间'
  if (!String(f.liveDuration || '').trim()) return '请选择预计直播时长'
  if (!String(f.liveType || '').trim()) return '请选择直播类型'
  if (!String(f.productSummary || '').trim()) return '请填写带货商品/套餐说明'
  if (!String(f.samplePolicy || '').trim()) return '请选择样品/寄样方式'
  return null
}

export function buildLiveRecruitmentLines(f: LivePublishFields): string[] {
  const lines = [
    `直播平台：${f.livePlatform || '—'}`,
    `直播日期：${f.liveDate || '—'}`,
    `开播时间：${f.liveTimeStart || '—'}`,
    `预计时长：${f.liveDuration || '—'}`,
    `直播类型：${f.liveType || '—'}`,
    `带货说明：${String(f.productSummary || '').trim() || '—'}`,
    `样品方式：${f.samplePolicy || '—'}`,
  ]
  const script = String(f.scriptRequirement || '').trim()
  if (script) lines.push(`脚本话术：${script}`)
  return lines
}

export function restoreLiveFields(meta: Record<string, unknown> | null | undefined): LivePublishFields {
  const m = meta && typeof meta === 'object' ? meta : {}
  return {
    livePlatform: String(m.livePlatform || '').trim(),
    liveDate: String(m.liveDate || '').trim(),
    liveTimeStart: String(m.liveTimeStart || '').trim(),
    liveDuration: String(m.liveDuration || '').trim(),
    liveType: String(m.liveType || '').trim(),
    productSummary: String(m.productSummary || '').trim(),
    samplePolicy: String(m.samplePolicy || '').trim(),
    scriptRequirement: String(m.scriptRequirement || '').trim(),
  }
}

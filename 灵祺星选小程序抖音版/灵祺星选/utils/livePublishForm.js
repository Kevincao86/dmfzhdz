const LIVE_PLATFORMS = ['抖音直播', '快手直播', '视频号直播', '淘宝直播']

const LIVE_TYPES = ['专场带货', '混场种草', '品牌发布会', '门店直播']

const LIVE_DURATIONS = ['1-2小时', '2-4小时', '4小时以上']

const SAMPLE_POLICIES = ['商家寄样', '达人自备', '无需样品', '到店体验后播']

function emptyLiveFields() {
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

function defaultLiveApplyFields() {
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

function isDouyinLivePlatform(livePlatform) {
  return String(livePlatform || '').includes('抖音')
}

function validateLivePublish(f) {
  if (!String(f.livePlatform || '').trim()) return '请选择直播平台'
  if (!String(f.liveDate || '').trim()) return '请选择直播日期'
  if (!String(f.liveTimeStart || '').trim()) return '请选择开播时间'
  if (!String(f.liveDuration || '').trim()) return '请选择预计直播时长'
  if (!String(f.liveType || '').trim()) return '请选择直播类型'
  if (!String(f.productSummary || '').trim()) return '请填写带货商品/套餐说明'
  if (!String(f.samplePolicy || '').trim()) return '请选择样品/寄样方式'
  return null
}

function buildLiveRecruitmentLines(f) {
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

function patchLiveMeta(meta, f) {
  return {
    ...meta,
    livePlatform: f.livePlatform,
    liveDate: f.liveDate,
    liveTimeStart: f.liveTimeStart,
    liveDuration: f.liveDuration,
    liveType: f.liveType,
    productSummary: f.productSummary,
    samplePolicy: f.samplePolicy,
    scriptRequirement: f.scriptRequirement,
  }
}

function restoreLiveFields(meta) {
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

module.exports = {
  LIVE_PLATFORMS,
  LIVE_TYPES,
  LIVE_DURATIONS,
  SAMPLE_POLICIES,
  emptyLiveFields,
  defaultLiveApplyFields,
  isDouyinLivePlatform,
  validateLivePublish,
  buildLiveRecruitmentLines,
  patchLiveMeta,
  restoreLiveFields,
}

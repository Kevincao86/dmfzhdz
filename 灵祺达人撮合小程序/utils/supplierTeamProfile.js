const { TALENT_TAGS } = require('./publishFormOptions.js')

const ENTITY_TYPES = [
  { id: 'personal', label: '个人' },
  { id: 'studio', label: '工作室' },
  { id: 'company', label: '公司' },
]

const EXPERIENCE_YEARS = ['1年内', '1-3年', '3-5年', '5年以上']

const SHOOT_TYPES = ['探店跟拍', '活动现场', '产品静物', '达人人设', '门店环境']

const SHOOT_EQUIPMENT = ['稳定器', '灯光', '收音', '航拍', '多机位']

const EDIT_TYPES = ['探店短视频', '品宣包装', '信息流广告', '云剪合成', '直播切片']

const EDIT_STYLES = ['快节奏口播', 'Vlog', '电影感', '种草清单', '剧情向']

const EDIT_SOFTWARE = ['剪映', 'Premiere', 'Final Cut', '达芬奇']

const DAILY_CAPACITY = ['1-3条', '4-8条', '8条以上']

const TRAVEL_RULES = ['市内包邮', '按公里', '实报实销']

const PACKAGE_LEVELS = ['不含', '基础字幕', '全包装']

const URGENT_RULES = ['不加急', '+50%', '面议']

function supplierTagsForWorkId(workId) {
  if (workId === 'shoot') return ['拍摄团队', '拍摄', '跟拍']
  if (workId === 'edit') return ['剪辑团队', '剪辑', '后期']
  return []
}

function emptySupplierProfile() {
  return {
    teamName: '',
    entityType: 'personal',
    teamSize: '',
    experienceYears: '',
    dailyCapacity: '',
    intro: '',
    categoryTags: [],
    shootTypes: [],
    equipment: [],
    editTypes: [],
    editStyles: [],
    software: [],
    portfolioLink: '',
    halfDayQuote: '',
    fullDayQuote: '',
    perClipQuote: '',
    travelRule: '',
    packageLevel: '',
    urgentRule: '',
    acceptsIce: false,
  }
}

function normalizeSupplierProfile(raw) {
  const base = emptySupplierProfile()
  if (!raw || typeof raw !== 'object') return base
  const tags = Array.isArray(raw.categoryTags)
    ? raw.categoryTags.filter((t) => TALENT_TAGS.includes(t))
    : []
  return {
    ...base,
    ...raw,
    entityType: ENTITY_TYPES.some((e) => e.id === raw.entityType) ? raw.entityType : 'personal',
    categoryTags: tags,
    shootTypes: Array.isArray(raw.shootTypes) ? raw.shootTypes.filter((t) => SHOOT_TYPES.includes(t)) : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment.filter((t) => SHOOT_EQUIPMENT.includes(t)) : [],
    editTypes: Array.isArray(raw.editTypes) ? raw.editTypes.filter((t) => EDIT_TYPES.includes(t)) : [],
    editStyles: Array.isArray(raw.editStyles) ? raw.editStyles.filter((t) => EDIT_STYLES.includes(t)) : [],
    software: Array.isArray(raw.software) ? raw.software.filter((t) => EDIT_SOFTWARE.includes(t)) : [],
    acceptsIce: !!raw.acceptsIce,
  }
}

function buildCategoryTagGrid(selected) {
  const set = new Set(Array.isArray(selected) ? selected : [])
  return TALENT_TAGS.map((name) => ({ name, on: set.has(name) }))
}

function buildMultiGrid(options, selected) {
  const set = new Set(Array.isArray(selected) ? selected : [])
  return options.map((name) => ({ name, on: set.has(name) }))
}

function validateSupplierProfile(workId, profile, contactFields) {
  const p = normalizeSupplierProfile(profile)
  if (!String(p.teamName || '').trim()) return '请填写团队名称'
  if (!String(contactFields.contact || '').trim()) return '请填写联系方式'
  if (!String(contactFields.wechatId || '').trim()) return '请填写微信号'
  if (!String(contactFields.alipayAccount || '').trim()) return '请填写支付宝账号'
  if (!contactFields.province || !contactFields.city) return '请选择省市'
  if (!p.categoryTags.length) return '请选择擅长品类标签（至少1个）'
  if (workId === 'shoot' && !p.shootTypes.length) return '请选择拍摄类型'
  if (workId === 'edit' && !p.editTypes.length) return '请选择成片类型'
  if (!String(p.portfolioLink || '').trim()) return '请填写作品集链接'
  return null
}

function supplierSummaryLabel(workId, profile) {
  const p = normalizeSupplierProfile(profile)
  const name = String(p.teamName || '').trim()
  if (!name) return workId === 'edit' ? '完善剪辑团队资料' : '完善拍摄团队资料'
  const tags = (p.categoryTags || []).slice(0, 2).join('、')
  return tags ? `${name} · ${tags}` : name
}

function memberToRegistryPayload(member, workId) {
  const tags = [
    ...supplierTagsForWorkId(workId),
    ...(member.supplierProfile?.categoryTags || []),
  ]
  const payload = {
    ...member,
    workIdentity: workId,
    accountTags: [...new Set(tags)],
    supplierProfile: normalizeSupplierProfile(member.supplierProfile),
  }
  if (workId === 'shoot' || workId === 'edit') {
    payload.memberType = payload.memberType || 'douyin'
  }
  return payload
}

module.exports = {
  ENTITY_TYPES,
  EXPERIENCE_YEARS,
  SHOOT_TYPES,
  SHOOT_EQUIPMENT,
  EDIT_TYPES,
  EDIT_STYLES,
  EDIT_SOFTWARE,
  DAILY_CAPACITY,
  TRAVEL_RULES,
  PACKAGE_LEVELS,
  URGENT_RULES,
  supplierTagsForWorkId,
  emptySupplierProfile,
  normalizeSupplierProfile,
  buildCategoryTagGrid,
  buildMultiGrid,
  validateSupplierProfile,
  supplierSummaryLabel,
  memberToRegistryPayload,
}

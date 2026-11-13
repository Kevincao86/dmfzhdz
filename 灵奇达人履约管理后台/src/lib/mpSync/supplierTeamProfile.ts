import { TALENT_TAGS } from './publishFormOptions'

export const ENTITY_TYPES = [
  { id: 'personal', label: '个人' },
  { id: 'studio', label: '工作室' },
  { id: 'company', label: '公司' },
] as const

export const EXPERIENCE_YEARS = ['1年内', '1-3年', '3-5年', '5年以上'] as const
export const SHOOT_TYPES = ['探店跟拍', '活动现场', '产品静物', '达人人设', '门店环境'] as const
export const SHOOT_EQUIPMENT = ['稳定器', '灯光', '收音', '航拍', '多机位'] as const
export const EDIT_TYPES = ['探店短视频', '品宣包装', '信息流广告', '云剪合成', '直播切片'] as const
export const EDIT_STYLES = ['快节奏口播', 'Vlog', '电影感', '种草清单', '剧情向'] as const
export const EDIT_SOFTWARE = ['剪映', 'Premiere', 'Final Cut', '达芬奇'] as const
export const DAILY_CAPACITY = ['1-3条', '4-8条', '8条以上'] as const

export type SupplierProfile = {
  teamName: string
  entityType: string
  teamSize: string
  experienceYears: string
  dailyCapacity: string
  intro: string
  categoryTags: string[]
  shootTypes: string[]
  equipment: string[]
  editTypes: string[]
  editStyles: string[]
  software: string[]
  portfolioLink: string
  halfDayQuote: string
  fullDayQuote: string
  perClipQuote: string
  travelRule: string
  packageLevel: string
  urgentRule: string
  acceptsIce: boolean
}

export function supplierTagsForWorkId(workId: string): string[] {
  if (workId === 'shoot') return ['拍摄团队', '拍摄', '跟拍']
  if (workId === 'edit') return ['剪辑团队', '剪辑', '后期']
  return []
}

export function emptySupplierProfile(): SupplierProfile {
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

export function normalizeSupplierProfile(raw: unknown): SupplierProfile {
  const base = emptySupplierProfile()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<SupplierProfile>
  const tags = Array.isArray(r.categoryTags) ? r.categoryTags.filter((t) => TALENT_TAGS.includes(t as never)) : []
  return {
    ...base,
    ...r,
    entityType: ENTITY_TYPES.some((e) => e.id === r.entityType) ? (r.entityType as string) : 'personal',
    categoryTags: tags,
    shootTypes: Array.isArray(r.shootTypes) ? r.shootTypes.filter((t) => SHOOT_TYPES.includes(t as never)) : [],
    equipment: Array.isArray(r.equipment) ? r.equipment.filter((t) => SHOOT_EQUIPMENT.includes(t as never)) : [],
    editTypes: Array.isArray(r.editTypes) ? r.editTypes.filter((t) => EDIT_TYPES.includes(t as never)) : [],
    editStyles: Array.isArray(r.editStyles) ? r.editStyles.filter((t) => EDIT_STYLES.includes(t as never)) : [],
    software: Array.isArray(r.software) ? r.software.filter((t) => EDIT_SOFTWARE.includes(t as never)) : [],
    acceptsIce: !!r.acceptsIce,
  }
}

export function validateSupplierProfile(
  workId: string,
  profile: SupplierProfile,
  contact: {
    wxNickName?: string
    contact?: string
    wechatId?: string
    alipayAccount?: string
    gender?: string
    province?: string
    city?: string
  },
): string | null {
  const p = normalizeSupplierProfile(profile)
  if (!String(contact.wxNickName || '').trim()) return '请填写昵称'
  const gender = String(contact.gender || '').trim()
  if (gender !== '男' && gender !== '女') return '请选择性别'
  if (!String(p.teamName || '').trim()) return '请填写团队名称'
  if (!String(contact.contact || '').trim()) return '请填写联系电话'
  if (!String(contact.wechatId || '').trim()) return '请填写微信号'
  if (!String(contact.alipayAccount || '').trim()) return '请填写支付宝账号'
  if (!contact.province || !contact.city) return '请选择省市'
  if (!p.categoryTags.length) return '请选择擅长品类标签'
  if (workId === 'shoot' && !p.shootTypes.length) return '请选择拍摄类型'
  if (workId === 'edit' && !p.editTypes.length) return '请选择成片类型'
  if (!String(p.portfolioLink || '').trim()) return '请填写作品集链接'
  return null
}

export function supplierSummaryLabel(workId: string, profile: SupplierProfile | undefined): string {
  const p = normalizeSupplierProfile(profile)
  const name = String(p.teamName || '').trim()
  if (!name) return workId === 'edit' ? '完善剪辑团队资料' : '完善拍摄团队资料'
  const tags = p.categoryTags.slice(0, 2).join('、')
  return tags ? `${name} · ${tags}` : name
}

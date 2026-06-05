import type { ApplyField } from './applyFormTemplates'

export { EDIT_STYLES, SHOOT_EQUIPMENT } from './supplierTeamProfile'

export const DELIVERABLES = ['原片', '粗剪', '精剪交付'] as const
export const MATERIAL_SOURCES = ['PR提供链接', '拍摄团队移交', '达人原片'] as const
export const ASPECT_RATIOS = ['9:16 竖屏', '16:9 横屏', '1:1'] as const
export const TARGET_DURATIONS = ['15s', '30s', '60s', '90s+', '自定义'] as const
export const PACKAGE_TAGS = ['字幕', '贴纸', 'BGM', '调色', '封面'] as const

export type SupplierPublishFields = {
  shootDate: string
  shootTimeStart: string
  shootTimeEnd: string
  shootLocation: string
  deliverables: string[]
  equipmentRequired: string[]
  materialSource: string
  materialUrl: string
  aspectRatio: string
  targetDuration: string
  styleTags: string[]
  packageTags: string[]
  deliveryDeadline: string
  referenceUrl: string
}

export function emptySupplierPublishFields(): SupplierPublishFields {
  return {
    shootDate: '',
    shootTimeStart: '',
    shootTimeEnd: '',
    shootLocation: '',
    deliverables: [],
    equipmentRequired: [],
    materialSource: '',
    materialUrl: '',
    aspectRatio: '',
    targetDuration: '',
    styleTags: [],
    packageTags: [],
    deliveryDeadline: '',
    referenceUrl: '',
  }
}

export function defaultSupplierApplyFields(workId: string): ApplyField[] {
  const common: ApplyField[] = [
    { id: 'sf-team', role: 'teamName', required: true, type: 'text' },
    { id: 'sf-phone', role: 'contact', required: true, type: 'number' },
    { id: 'sf-wx', role: 'wechatId', required: true, type: 'text' },
    { id: 'sf-prov', role: 'province', required: true, type: 'regionProvince' },
    { id: 'sf-city', role: 'city', required: true, type: 'regionCity' },
    { id: 'sf-port', role: 'portfolioLink', required: true, type: 'text' },
    { id: 'sf-quote', role: 'quotePrice', required: true, type: 'digit' },
    { id: 'sf-alipay', role: 'alipayAccount', required: false, type: 'text' },
  ]
  if (workId === 'shoot') {
    return [
      ...common,
      { id: 'sf-stype', role: 'shootTypes', required: true, type: 'text' },
      { id: 'sf-equip', role: 'equipment', required: false, type: 'text' },
      { id: 'sf-date', role: 'shootDate', required: true, type: 'date' },
    ]
  }
  return [
    ...common,
    { id: 'sf-estyle', role: 'editStyles', required: true, type: 'text' },
    { id: 'sf-soft', role: 'software', required: false, type: 'text' },
    { id: 'sf-eta', role: 'deliveryEta', required: true, type: 'text' },
  ]
}

export function validateSupplierPublish(
  workId: string,
  f: SupplierPublishFields & { talentTags?: string[]; iceVideoUrl?: string },
  recruitMode: string,
): string | null {
  if (!(f.talentTags || []).length) return '请选择需求品类标签'
  if (workId === 'shoot') {
    if (!String(f.shootDate || '').trim()) return '请选择拍摄日期'
    if (!String(f.shootTimeStart || '').trim() || !String(f.shootTimeEnd || '').trim()) {
      return '请填写拍摄时段'
    }
    if (!String(f.shootLocation || '').trim()) return '请填写拍摄地点'
    if (!(f.deliverables || []).length) return '请选择成片交付形式'
  }
  if (workId === 'edit') {
    if (!String(f.materialSource || '').trim()) return '请选择素材来源'
    if (
      (f.materialSource === 'PR提供链接' || recruitMode === 'edit_ice') &&
      !String(f.materialUrl || '').trim()
    ) {
      return '请填写素材链接'
    }
    if (!String(f.aspectRatio || '').trim()) return '请选择成片画幅'
    if (!String(f.targetDuration || '').trim()) return '请选择目标时长'
    if (!(f.styleTags || []).length) return '请选择剪辑风格'
    if (!String(f.deliveryDeadline || '').trim()) return '请填写交付截止时间'
    if (recruitMode === 'edit_ice' && !String(f.iceVideoUrl || '').trim()) {
      return '云剪任务请填写参考成片链接'
    }
  }
  return null
}

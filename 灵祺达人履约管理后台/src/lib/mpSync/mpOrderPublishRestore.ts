import { getApplyConfigForMpOrder, getTemplateById } from './applyFormTemplates'
import { modeById, newFansTier, newLevelTier } from './publishFormOptions'
import type { PublishForm } from './publishOrder'
import { restoreLiveFields } from './livePublishForm'
import { emptySupplierPublishFields } from './supplierPublishForm'
import { emptyPublishLinkeAttach } from './prDouyinLinkeTypes'
import { merchantLocationFromMeta } from './merchantLocation'
import type { MpLinkeLinkage } from '@merchant/lib/opsRegistryTypes'

function pickField(text: string, key: string) {
  const re = new RegExp(`${key}[:：]([^\\n]+)`)
  const m = String(text || '').match(re)
  return m ? m[1].trim() : ''
}

export function parseDeadlineParts(deadline: string) {
  const s = String(deadline || '').trim()
  if (!s) return { date: '', time: '23:59' }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  if (m) return { date: m[1], time: m[2] }
  return { date: s.slice(0, 10), time: '23:59' }
}

export function formPatchFromMpOrder(mp: Record<string, unknown>) {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}) as Record<
    string,
    unknown
  >
  const info = String(mp.recruitmentInfo || mp.merchantRequirements || '')
  const mode = modeById(String(meta.recruitMode || 'visit'))
  const deadlineParts = parseDeadlineParts(String(meta.signupDeadline || mp.deadline || ''))
  const deliveryParts = parseDeadlineParts(String(meta.deliveryDeadline || ''))
  const fansReq = String(mp.fansRequirement || meta.fansRequirement || '').trim()
  let fansLimitMode: 'unlimited' | 'limit' = (meta.fansLimitMode as 'unlimited' | 'limit') || 'unlimited'
  let fansMin = String(meta.fansMin ?? '').trim()
  if (!meta.fansLimitMode && fansReq && fansReq !== '不限') {
    fansLimitMode = 'limit'
    const m = fansReq.match(/(\d+)/)
    if (m) fansMin = m[1]
  }
  const patch: PublishForm = {
    ...emptySupplierPublishFields(),
    deliveryWindow: (meta.deliveryWindow as PublishForm['deliveryWindow']) || (mp.urgent ? 'urgent' : 'normal'),
    title: String(mp.title || mp.customerName || '').trim(),
    platform: String(mp.platform || '').trim(),
    cityNational: !!meta.cityNational,
    selectedCities: Array.isArray(meta.cities) ? [...(meta.cities as string[])] : [],
    talentTags: Array.isArray(meta.talentTags) ? [...(meta.talentTags as string[])] : [],
    fansLimitMode,
    fansMin,
    fansRequirement: fansReq || (fansLimitMode === 'limit' && fansMin ? `粉丝≥${fansMin}` : '不限'),
    douyinSalesLevels:
      Array.isArray(meta.douyinSalesLevels) && (meta.douyinSalesLevels as string[]).length
        ? [...(meta.douyinSalesLevels as string[])]
        : ['不限'],
    feeTypeId: String(meta.feeTypeId || ''),
    fixedPrice: meta.fixedPrice != null ? String(meta.fixedPrice) : '',
    selfQuoteMin: meta.selfQuoteMin != null ? String(meta.selfQuoteMin) : '',
    selfQuoteMax: meta.selfQuoteMax != null ? String(meta.selfQuoteMax) : '',
    levelTiers:
      Array.isArray(meta.levelTiers) && (meta.levelTiers as PublishForm['levelTiers']).length
        ? (meta.levelTiers as PublishForm['levelTiers']).map((t) => ({ ...t }))
        : [newLevelTier(`lt-${Date.now()}`)],
    fansTiers:
      Array.isArray(meta.fansTiers) && (meta.fansTiers as PublishForm['fansTiers']).length
        ? (meta.fansTiers as PublishForm['fansTiers']).map((t) => ({ ...t }))
        : [newFansTier(`ft-${Date.now()}`)],
    cpsPercent: meta.cpsPercent != null ? String(meta.cpsPercent) : '',
    recruitCount: String(mp.recruitCount != null ? mp.recruitCount : meta.recruitCount || '1'),
    recruitDetail: String(meta.recruitDetail || pickField(info, '招募详情') || '').trim(),
    signupDeadline: String(meta.signupDeadline || mp.deadline || '').trim(),
    inviteResponseHours: Number(meta.inviteResponseHours) || 72,
    iceVideoUrl: String(meta.iceVideoUrl || '').trim(),
    iceVerifyMode: String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim() === 'pr' ? 'pr' : 'ai',
    applyFormTemplateId: String(meta.applyFormTemplateId || ''),
    applyFormTemplateName: String(meta.applyFormTemplateName || ''),
    applyFormFields: Array.isArray(meta.applyFormFields)
      ? (meta.applyFormFields as PublishForm['applyFormFields']).map((f) => ({ ...f }))
      : [],
    coverImage: String(mp.coverImage || meta.coverImage || '').trim(),
    coverLibraryId: String(meta.coverLibraryId || '').trim(),
    shootDate: String(meta.shootDate || ''),
    shootTimeStart: String(meta.shootTimeStart || ''),
    shootTimeEnd: String(meta.shootTimeEnd || ''),
    shootLocation: String(meta.shootLocation || ''),
    deliverables: Array.isArray(meta.deliverables) ? [...(meta.deliverables as string[])] : [],
    equipmentRequired: Array.isArray(meta.equipmentRequired) ? [...(meta.equipmentRequired as string[])] : [],
    materialSource: String(meta.materialSource || ''),
    materialUrl: String(meta.materialUrl || ''),
    aspectRatio: String(meta.aspectRatio || ''),
    targetDuration: String(meta.targetDuration || ''),
    styleTags: Array.isArray(meta.styleTags) ? [...(meta.styleTags as string[])] : [],
    packageTags: Array.isArray(meta.packageTags) ? [...(meta.packageTags as string[])] : [],
    deliveryDeadline: String(meta.deliveryDeadline || ''),
    referenceUrl: String(meta.referenceUrl || ''),
    groupQrImage: String(mp.groupQrImage || meta.groupQrImage || '').trim(),
    editGroupQrImage: String(mp.editGroupQrImage || meta.editGroupQrImage || '').trim(),
    linkeAttach: (() => {
      const raw = meta.linkeLinkage as MpLinkeLinkage | undefined
      if (!raw?.enabled) return emptyPublishLinkeAttach()
      return {
        enabled: true,
        clientId: String(raw.clientId || ''),
        merchantAccountId: String(raw.merchantAccountId || ''),
        merchantDisplayName: String(raw.merchantDisplayName || ''),
        productIds: Array.isArray(raw.productIds) ? [...raw.productIds.map(String)] : [],
        merchantPhone: String(raw.merchantPhone || ''),
      }
    })(),
    ...restoreLiveFields(meta),
    ...merchantLocationFromMeta(meta),
  }
  if (!patch.selectedCities.length && mp.region && mp.region !== '全国') {
    patch.selectedCities = String(mp.region)
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (mp.region === '全国') patch.cityNational = true
  const slots = mp.iceVideoSlots as { downloadUrl?: string }[] | undefined
  if (!patch.referenceUrl && Array.isArray(slots) && slots[0]) {
    patch.referenceUrl = String(slots[0].downloadUrl || '').trim()
  }
  if (!patch.referenceUrl && patch.iceVideoUrl) patch.referenceUrl = patch.iceVideoUrl
  if (!patch.applyFormFields.length && meta.applyFormTemplateId) {
    const tpl = getTemplateById(String(meta.applyFormTemplateId))
    if (tpl?.fields) patch.applyFormFields = tpl.fields.map((f) => ({ ...f }))
  }
  const mpId = String(mp.id || '')
  const afCfg = getApplyConfigForMpOrder(mpId, patch.applyFormTemplateId)
  if (afCfg.fields?.length) {
    patch.applyFormFields = afCfg.fields.map((f) => ({ ...f }))
    if (!patch.applyFormTemplateName && afCfg.name) patch.applyFormTemplateName = afCfg.name
  }
  return {
    patch,
    recruitMode: mode.id,
    recruitModeLabel: mode.label,
    signupDeadlineDate: deadlineParts.date,
    signupDeadlineTime: deadlineParts.time,
    deliveryDeadlineDate: deliveryParts.date,
    deliveryDeadlineTime: deliveryParts.time || '18:00',
  }
}

export function recruitModeIdFromMp(mp: Record<string, unknown>) {
  const meta = mp.mpPublishMeta as { recruitMode?: string } | undefined
  if (meta?.recruitMode) return meta.recruitMode
  if (mp.orderKind === 'recruitment_ice' || mp.hall === 'ice') return 'ice'
  if (String(mp.category || '').includes('品宣')) return 'brand'
  if (String(mp.category || '').includes('直播')) return 'live'
  return 'visit'
}

const publishOpts = require('./publishFormOptions.js')
const applyTemplates = require('./applyFormTemplates.js')

const { modeById, newLevelTier, newFansTier } = publishOpts

function pickField(text, key) {
  const re = new RegExp(`${key}[:：]([^\\n]+)`)
  const m = String(text || '').match(re)
  return m ? m[1].trim() : ''
}

function parseDeadlineParts(deadline) {
  const s = String(deadline || '').trim()
  if (!s) return { date: '', time: '23:59' }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  if (m) return { date: m[1], time: m[2] }
  const d = s.slice(0, 10)
  return { date: d, time: '23:59' }
}

/** 从已发布 mp 订单还原发招募表单（优先 mpPublishMeta） */
function formPatchFromMpOrder(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const info = mp?.recruitmentInfo || mp?.merchantRequirements || ''
  const mode = modeById(meta.recruitMode) || modeById('visit')
  const deadlineParts = parseDeadlineParts(meta.signupDeadline || mp?.deadline)
  const fansReq = String(mp?.fansRequirement || meta.fansRequirement || '').trim()
  let fansLimitMode = meta.fansLimitMode || 'unlimited'
  let fansMin = String(meta.fansMin ?? '').trim()
  if (!meta.fansLimitMode && fansReq && fansReq !== '不限') {
    fansLimitMode = 'limit'
    const m = fansReq.match(/(\d+)/)
    if (m) fansMin = m[1]
  }
  const patch = {
    deliveryWindow: meta.deliveryWindow || (mp?.urgent ? 'urgent' : 'normal'),
    title: String(mp?.title || mp?.customerName || '').trim(),
    platform: String(mp?.platform || '').trim(),
    cityNational: !!meta.cityNational,
    selectedCities: Array.isArray(meta.cities) ? [...meta.cities] : [],
    talentTags: Array.isArray(meta.talentTags) ? [...meta.talentTags] : [],
    fansLimitMode,
    fansMin,
    fansRequirement: fansReq || (fansLimitMode === 'limit' && fansMin ? `粉丝≥${fansMin}` : '不限'),
    douyinSalesLevels:
      Array.isArray(meta.douyinSalesLevels) && meta.douyinSalesLevels.length
        ? [...meta.douyinSalesLevels]
        : ['不限'],
    feeTypeId: meta.feeTypeId || '',
    fixedPrice: meta.fixedPrice != null ? String(meta.fixedPrice) : '',
    selfQuoteMin: meta.selfQuoteMin != null ? String(meta.selfQuoteMin) : '',
    selfQuoteMax: meta.selfQuoteMax != null ? String(meta.selfQuoteMax) : '',
    levelTiers:
      Array.isArray(meta.levelTiers) && meta.levelTiers.length
        ? meta.levelTiers.map((t) => ({ ...t }))
        : [newLevelTier(`lt-${Date.now()}`)],
    fansTiers:
      Array.isArray(meta.fansTiers) && meta.fansTiers.length
        ? meta.fansTiers.map((t) => ({ ...t }))
        : [newFansTier(`ft-${Date.now()}`)],
    cpsPercent: meta.cpsPercent != null ? String(meta.cpsPercent) : '',
    recruitCount: String(mp?.recruitCount != null ? mp.recruitCount : meta.recruitCount || '1'),
    recruitDetail: String(meta.recruitDetail || pickField(info, '招募详情') || '').trim(),
    signupDeadline: String(meta.signupDeadline || mp?.deadline || '').trim(),
    iceVideoUrl: String(meta.iceVideoUrl || '').trim(),
    applyFormTemplateId: meta.applyFormTemplateId || '',
    applyFormTemplateName: meta.applyFormTemplateName || '',
    applyFormFields: Array.isArray(meta.applyFormFields)
      ? meta.applyFormFields.map((f) => ({ ...f }))
      : [],
  }
  if (!patch.selectedCities.length && mp?.region && mp.region !== '全国') {
    patch.selectedCities = String(mp.region)
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (mp?.region === '全国') patch.cityNational = true
  if (!patch.iceVideoUrl && Array.isArray(mp?.iceVideoSlots) && mp.iceVideoSlots[0]) {
    patch.iceVideoUrl = String(mp.iceVideoSlots[0].downloadUrl || '').trim()
  }
  if (!patch.applyFormFields.length && meta.applyFormTemplateId) {
    const tpl = applyTemplates.getTemplateById(meta.applyFormTemplateId)
    if (tpl && tpl.fields) patch.applyFormFields = tpl.fields.map((f) => ({ ...f }))
  }
  return {
    patch,
    recruitMode: mode.id,
    recruitModeLabel: mode.label,
    signupDeadlineDate: deadlineParts.date,
    signupDeadlineTime: deadlineParts.time,
    hall: mp?.hall || mode.hall,
  }
}

function recruitModeIdFromMp(mp) {
  const meta = mp?.mpPublishMeta
  if (meta?.recruitMode) return meta.recruitMode
  if (mp?.orderKind === 'recruitment_ice' || mp?.hall === 'ice') return 'ice'
  const cat = String(mp?.category || '')
  if (cat.includes('品宣')) return 'brand'
  return 'visit'
}

module.exports = {
  formPatchFromMpOrder,
  recruitModeIdFromMp,
  parseDeadlineParts,
}

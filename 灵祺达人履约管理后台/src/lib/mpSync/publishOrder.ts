import type { ApplyField } from './applyFormTemplates'
import { emptyCustomTemplate, buildEditorRows, validateTemplateFields } from './applyFormTemplates'
import { validateTierPublish, formatTierPriceSummary } from './mpRecruitmentTierQuote'
import { buildCompactBudgetText } from './recruitmentBudgetDisplay'
import {
  feeTypeLabel,
  modeById,
  newFansTier,
  newLevelTier,
  type FansTier,
  type LevelTier,
} from './publishFormOptions'
import { buildPrProfileSnapshot } from './prRecruitQr'
import { prDisplayName, readPrProfile } from './userProfile'
import { prParticipantKey } from './participant'
import { getAccount } from '../mpSession'
import { emptySupplierPublishFields, validateSupplierPublish } from './supplierPublishForm'
import { defaultSupplierApplyFields } from './supplierPublishForm'
import {
  buildLiveRecruitmentLines,
  emptyLiveFields,
  isDouyinLivePlatform,
  validateLivePublish,
  type LivePublishFields,
} from './livePublishForm'
import { buildCoverFieldsForOrder } from './recruitCoverLibrary'
import { buildMpRecruitmentOrderId } from './mpRecruitmentOrderId'
import { parseNonNegativeInt } from './publishNumeric'
import type { PublishLinkeAttach } from './prDouyinLinkeTypes'
import { emptyPublishLinkeAttach } from './prDouyinLinkeTypes'

export type PublishForm = {
  deliveryWindow: 'normal' | 'urgent'
  title: string
  platform: string
  cityNational: boolean
  selectedCities: string[]
  talentTags: string[]
  fansLimitMode: 'unlimited' | 'limit'
  fansMin: string
  fansRequirement: string
  douyinSalesLevels: string[]
  feeTypeId: string
  fixedPrice: string
  selfQuoteMin: string
  selfQuoteMax: string
  levelTiers: LevelTier[]
  fansTiers: FansTier[]
  cpsPercent: string
  recruitCount: string
  recruitDetail: string
  signupDeadline: string
  iceVideoUrl: string
  iceVerifyMode: 'ai' | 'pr'
  /** 云剪 AI 核查：达人群结算二维码（data URL） */
  groupQrImage?: string
  /** 剪辑师云剪：剪辑师群二维码（data URL） */
  editGroupQrImage?: string
  applyFormTemplateId: string
  applyFormTemplateName: string
  applyFormFields: ApplyField[]
  /** 用户上传封面 data URL（选填） */
  coverImage?: string
  /** 图库封面 id（选填；与 coverImage 二选一） */
  coverLibraryId?: string
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
  /** 抖音林客挂接（非必填） */
  linkeAttach: PublishLinkeAttach
} & LivePublishFields

export function emptyPublishForm(recruitTarget = 'talent'): PublishForm {
  const isSupplier = recruitTarget === 'shoot' || recruitTarget === 'edit'
  const afTpl = emptyCustomTemplate('')
  const supplierFields = emptySupplierPublishFields()
  return {
    deliveryWindow: 'normal',
    title: '',
    platform: isSupplier ? '通用' : '',
    cityNational: false,
    selectedCities: [],
    talentTags: [],
    fansLimitMode: 'unlimited',
    fansMin: '',
    fansRequirement: '不限',
    douyinSalesLevels: ['不限'],
    feeTypeId: '',
    fixedPrice: '',
    selfQuoteMin: '',
    selfQuoteMax: '',
    levelTiers: [newLevelTier('lt-init')],
    fansTiers: [newFansTier('ft-init')],
    cpsPercent: '',
    recruitCount: '1',
    recruitDetail: '',
    signupDeadline: '',
    iceVideoUrl: '',
    iceVerifyMode: 'ai',
    applyFormTemplateId: '',
    applyFormTemplateName: isSupplier ? '团队报名默认项' : '',
    applyFormFields: isSupplier
      ? defaultSupplierApplyFields(recruitTarget)
      : (afTpl.fields || []).map((f) => ({ ...f })),
    ...supplierFields,
    ...emptyLiveFields(),
    linkeAttach: emptyPublishLinkeAttach(),
  }
}

export function resolveIceReferenceVideoUrl(f: Pick<PublishForm, 'referenceUrl' | 'materialUrl' | 'iceVideoUrl'>) {
  return String(f.referenceUrl || f.materialUrl || f.iceVideoUrl || '').trim()
}

export function buildFansRequirementText(f: PublishForm) {
  if (f.fansLimitMode === 'unlimited') return '不限'
  const min = String(f.fansMin ?? '').trim()
  return min ? `粉丝≥${min}` : ''
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatDeadlineLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
}

export function defaultSignupDate() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function buildRegionText(f: PublishForm) {
  if (f.cityNational) return '全国'
  return (f.selectedCities || []).join('、')
}

export function resolveSignupDeadline(f: PublishForm) {
  if (f.deliveryWindow === 'urgent') return formatDeadlineLocal(new Date(Date.now() + 24 * 3600000))
  return String(f.signupDeadline || '').trim()
}

export function buildBudgetDetailText(f: PublishForm) {
  const cps = String(f.cpsPercent || '').trim()
  const prefix = cps ? `CPS ${cps}% · ` : ''
  if (f.feeTypeId === 'level_tier') {
    const parts = (f.levelTiers || []).map((t) => `${(t.levels || []).join('+')} ¥${t.price}`)
    return `${prefix}等级阶梯 ${parts.join(' / ')}`
  }
  if (f.feeTypeId === 'fans_tier') {
    const parts = (f.fansTiers || []).map((t) => `${t.fansRange} ¥${t.price}`)
    return `${prefix}粉丝阶梯 ${parts.join(' / ')}`
  }
  return buildCompactBudgetText(f)
}

export function buildRecruitmentInfo(f: PublishForm, recruitModeId: string, recruitTarget = 'talent') {
  const mode = modeById(recruitModeId)
  const deadline = resolveSignupDeadline(f)
  const windowLabel = f.deliveryWindow === 'urgent' ? '急单大厅' : '招募大厅'
  const isSupplier = recruitTarget === 'shoot' || recruitTarget === 'edit'
  const lines = [
    `招募标题：${String(f.title || '').trim()}`,
    `投放窗口：${windowLabel}`,
    `招募对象：${recruitTarget === 'shoot' ? '拍摄' : recruitTarget === 'edit' ? '剪辑' : '达人'}`,
    `招募模式：${mode.label}`,
    `招募城市：${buildRegionText(f)}`,
    `报名截止：${deadline ? String(deadline).slice(0, 16) : '—'}`,
    `招募人数：${Math.max(1, parseNonNegativeInt(String(f.recruitCount || '1'), 1))} 人`,
    `费用模式：${feeTypeLabel(f.feeTypeId)}`,
  ]
  if (!isSupplier) {
    if (recruitModeId === 'live') {
      lines.splice(4, 0, `直播平台：${f.livePlatform || '—'}`)
      lines.push(...buildLiveRecruitmentLines(f))
    } else {
      lines.splice(4, 0, `招募平台：${f.platform || '—'}`)
    }
    lines.push(`需求达人标签：${(f.talentTags || []).join('、')}`)
    lines.push(`粉丝要求：${buildFansRequirementText(f)}`)
    const douyinLevel =
      recruitModeId === 'live' ? isDouyinLivePlatform(f.livePlatform) : f.platform === '抖音'
    if (douyinLevel) lines.push(`带货等级：${(f.douyinSalesLevels || []).join('、')}`)
  } else {
    lines.push(`需求品类标签：${(f.talentTags || []).join('、')}`)
    if (recruitTarget === 'shoot') {
      lines.push(`拍摄日期：${f.shootDate || '—'}`)
      lines.push(`拍摄时段：${f.shootTimeStart || '—'} - ${f.shootTimeEnd || '—'}`)
      lines.push(`拍摄地点：${f.shootLocation || '—'}`)
      lines.push(`成片交付：${(f.deliverables || []).join('、') || '—'}`)
      if ((f.equipmentRequired || []).length) lines.push(`设备要求：${f.equipmentRequired.join('、')}`)
    }
    if (recruitTarget === 'edit') {
      lines.push(`素材来源：${f.materialSource || '—'}`)
      if (f.materialUrl) lines.push(`素材链接：${f.materialUrl}`)
      lines.push(`成片画幅：${f.aspectRatio || '—'}`)
      lines.push(`目标时长：${f.targetDuration || '—'}`)
      lines.push(`剪辑风格：${(f.styleTags || []).join('、') || '—'}`)
      if ((f.packageTags || []).length) lines.push(`包装要求：${f.packageTags.join('、')}`)
      lines.push(`交付截止：${f.deliveryDeadline ? String(f.deliveryDeadline).slice(0, 16) : '—'}`)
      if (f.referenceUrl) lines.push(`参考片：${f.referenceUrl}`)
    }
  }
  if (f.feeTypeId === 'fixed') lines.push(`一口价：¥${f.fixedPrice}`)
  if (f.feeTypeId === 'exchange_only') lines.push('酬劳：纯置换（无现金）')
  if (f.feeTypeId === 'self_quote') {
    const min = String(f.selfQuoteMin ?? '').trim()
    const max = String(f.selfQuoteMax ?? '').trim()
    lines.push(`可接受报价区间：${min || '0'}-${max || '不限'}`)
  }
  if (f.feeTypeId === 'level_tier') {
    ;(f.levelTiers || []).forEach((t, i) => {
      lines.push(`阶梯${i + 1}：${(t.levels || []).join('、')} · ¥${t.price}`)
    })
  }
  if (f.feeTypeId === 'fans_tier') {
    ;(f.fansTiers || []).forEach((t, i) => {
      lines.push(`阶梯${i + 1}：${t.fansRange} · ¥${t.price}`)
    })
  }
  if (String(f.cpsPercent || '').trim()) lines.push(`佣金CPS：${f.cpsPercent}%`)
  else lines.push('佣金CPS：未设置')
  lines.push(`酬劳摘要：${buildBudgetDetailText(f)}`)
  lines.push('招募详情：')
  const recruitDetail = String(f.recruitDetail || '').trim()
  if (recruitDetail) lines.push(recruitDetail)
  if (recruitModeId === 'ice' && resolveIceReferenceVideoUrl(f)) {
    lines.push(`云剪参考成片：${resolveIceReferenceVideoUrl(f)}`)
    lines.push(`云剪审核方式：${f.iceVerifyMode === 'pr' ? 'PR 审核' : 'AI 核查'}`)
  }
  if (recruitModeId === 'edit_ice') {
    lines.push(`云剪审核方式：${f.iceVerifyMode === 'pr' ? 'PR 审核' : 'AI 核查'}`)
  }
  return lines.join('\n')
}

export function validatePublishFee(f: PublishForm): string | null {
  if (f.feeTypeId === 'fixed') {
    if (String(f.fixedPrice ?? '').trim() === '') return '请填写一口价金额（0 表示置换）'
  }
  if (f.feeTypeId === 'self_quote') {
    const min = String(f.selfQuoteMin ?? '').trim()
    const max = String(f.selfQuoteMax ?? '').trim()
    if (!min && !max) return '请填写可接受报价区间'
  }
  if (f.feeTypeId === 'exchange_only') return null
  if (f.feeTypeId === 'level_tier') {
    for (let i = 0; i < (f.levelTiers || []).length; i++) {
      const err = validateTierPublish(f.levelTiers[i], i, 'level')
      if (err) return err
    }
  }
  if (f.feeTypeId === 'fans_tier') {
    for (let i = 0; i < (f.fansTiers || []).length; i++) {
      const err = validateTierPublish(f.fansTiers[i], i, 'fans')
      if (err) return err
    }
  }
  return null
}

export function validatePublishForm(
  f: PublishForm,
  recruitMode: string,
  recruitTarget = 'talent',
): string | null {
  const isSupplier = recruitTarget === 'shoot' || recruitTarget === 'edit'
  if (!String(f.title || '').trim()) return '请填写招募标题'
  if (recruitMode === 'live') {
    const liveErr = validateLivePublish(f)
    if (liveErr) return liveErr
    if (isDouyinLivePlatform(f.livePlatform) && !(f.douyinSalesLevels || []).length) {
      return '请选择达人带货等级'
    }
  } else if (!isSupplier && !f.platform) return '请选择招募平台'
  if (!f.cityNational && !(f.selectedCities || []).length) return '请选择招募城市'
  if (!(f.talentTags || []).length) return isSupplier ? '请选择需求品类标签' : '请选择需求达人标签'
  if (!isSupplier && f.fansLimitMode === 'limit' && !String(f.fansMin ?? '').trim()) return '请填写粉丝下限'
  if (f.deliveryWindow !== 'urgent' && !String(f.signupDeadline || '').trim()) {
    return '请选择招募报名截止时间'
  }
  if (
    !isSupplier &&
    recruitMode !== 'live' &&
    f.platform === '抖音' &&
    !(f.douyinSalesLevels || []).length
  ) {
    return '请选择达人带货等级'
  }
  if (!f.feeTypeId) return '请选择费用模式'
  const feeErr = validatePublishFee(f)
  if (feeErr) return feeErr
  const n = Math.max(1, parseNonNegativeInt(String(f.recruitCount || '1'), 1))
  if (n < 1) return '招募人数至少为 1'
  if (!String(f.recruitDetail || '').trim() && recruitMode !== 'live') return '请填写招募详情'
  if (isSupplier) {
    const sErr = validateSupplierPublish(recruitTarget, f, recruitMode)
    if (sErr) return sErr
  }
  if (recruitMode === 'ice' && !resolveIceReferenceVideoUrl(f)) {
    return '云剪任务请填写参考片链接'
  }
  if (
    recruitMode === 'ice' &&
    (f.iceVerifyMode || 'ai') === 'ai' &&
    !String(f.groupQrImage || '').trim()
  ) {
    return 'AI 核查模式请上传群二维码'
  }
  if (
    recruitMode === 'edit_ice' &&
    (f.iceVerifyMode || 'ai') === 'ai' &&
    !String(f.editGroupQrImage || '').trim()
  ) {
    return '剪辑云剪请上传剪辑师群二维码'
  }
  if (!(f.applyFormFields || []).length) {
    return isSupplier ? '请配置团队报名必填信息' : '请配置达人报名必填信息'
  }
  const tplErr = validateTemplateFields(f.applyFormFields)
  if (tplErr) return tplErr
  const lk = f.linkeAttach
  if (lk?.enabled) {
    if (!lk.clientId) return '挂接林客时请选择客户商家'
    if (!/^1\d{10}$/.test(String(lk.merchantPhone || '').trim())) {
      return '挂接林客时请填写 11 位商家联系电话'
    }
    if (!(lk.productIds || []).length) return '挂接林客时请至少选择一个团购商品'
  }
  return null
}

export function applyFormSummary(fields: ApplyField[], platform: string) {
  const rows = buildEditorRows(fields || [], platform || '抖音')
  const req = rows.filter((r) => r.required).length
  return `${rows.length} 项 · 必填 ${req} 项`
}

export type PublishDisplay = {
  cityDisplayText: string
  tagsDisplayText: string
  platformDisplayText: string
  levelDisplayText: string
  feeTypeLabel: string
  applyFormDisplayText: string
  applyFormPlaceholder: boolean
  showDouyinLevel: boolean
  showSignupDeadline: boolean
  signupDeadlineDisplay: string
}

export function computePublishDisplay(form: PublishForm, recruitMode = ''): PublishDisplay {
  const isLive = recruitMode === 'live'
  let cityDisplayText = '请选择招募城市'
  if (form.cityNational) cityDisplayText = '全国'
  else if ((form.selectedCities || []).length) {
    const cities = form.selectedCities
    cityDisplayText =
      cities.length <= 2 ? cities.join('、') : `${cities.slice(0, 2).join('、')} 等${cities.length}城`
  }
  const tags = form.talentTags || []
  const tagsDisplayText = tags.length ? tags.join('、') : '请选择达人标签（最多2个）'
  const platformDisplayText = isLive
    ? form.livePlatform || '请选择直播平台'
    : form.platform || '请选择招募平台'
  const levels = form.douyinSalesLevels || []
  const levelDisplayText = !levels.length || levels.includes('不限') ? '不限' : levels.join('、')
  const urgentWin = form.deliveryWindow === 'urgent'
  const af = form.applyFormFields || []
  let applyFormDisplayText = '请配置达人报名必填信息'
  let applyFormPlaceholder = true
  if (af.length) {
    applyFormPlaceholder = false
    const name = form.applyFormTemplateName || '已配置报名项'
    applyFormDisplayText = `${name}（${applyFormSummary(af, form.platform)}）`
  }
  return {
    cityDisplayText,
    tagsDisplayText,
    platformDisplayText,
    levelDisplayText,
    feeTypeLabel: feeTypeLabel(form.feeTypeId),
    applyFormDisplayText,
    applyFormPlaceholder,
    showDouyinLevel:
      recruitMode === 'live'
        ? isDouyinLivePlatform(form.livePlatform)
        : form.platform === '抖音',
    showSignupDeadline: !urgentWin,
    signupDeadlineDisplay: urgentWin
      ? '急单默认发布后 24 小时截止'
      : form.signupDeadline
        ? String(form.signupDeadline).slice(0, 16)
        : '请选择报名截止时间',
  }
}

export function buildPublishOrder(
  form: PublishForm,
  recruitModeId: string,
  options?: { editId?: string; existing?: Record<string, unknown>; recruitTarget?: string },
) {
  const mode = modeById(recruitModeId)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const nowMs = Date.now()
  const existing = options?.existing
  const editId = options?.editId
  const mpId =
    editId && existing
      ? editId
      : mode.hall === 'ice'
        ? buildMpRecruitmentOrderId('ICE', nowMs)
        : buildMpRecruitmentOrderId('RO', nowMs)
  const recruitCount = Math.max(1, parseNonNegativeInt(String(form.recruitCount || '1'), 1))
  const isUrgent = form.deliveryWindow === 'urgent'
  const recruitTarget = options?.recruitTarget === 'shoot' || options?.recruitTarget === 'edit'
    ? options.recruitTarget
    : 'talent'
  const deadline = resolveSignupDeadline(form)
  const recruitmentInfo = buildRecruitmentInfo(form, recruitModeId, recruitTarget)
  const pr = readPrProfile()
  const account = getAccount()
  const coverFields = buildCoverFieldsForOrder(form)
  const groupQrImage = String(form.groupQrImage || '').trim()
  const editGroupQrImage = String(form.editGroupQrImage || '').trim()
  const order: Record<string, unknown> = {
    id: mpId,
    sourceMerchantOrderId:
      existing && existing.sourceMerchantOrderId ? existing.sourceMerchantOrderId : buildMpRecruitmentOrderId('USER', nowMs),
    customerName: String(form.title || '').trim().slice(0, 24),
    storeName: buildRegionText(form),
    merchantRequirements: recruitmentInfo,
    status: existing && existing.status ? existing.status : 'open',
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now,
    ...(editId && existing
      ? Array.isArray(existing.applicants) && existing.applicants.length
        ? { applicants: existing.applicants as Record<string, unknown>[] }
        : {}
      : { applicants: [] }),
    title: String(form.title || '').trim(),
    recruitmentInfo,
    taskDetail: recruitmentInfo,
    platform: recruitModeId === 'live' ? form.livePlatform || form.platform : form.platform,
    fansRequirement: buildFansRequirementText(form),
    urgent: isUrgent,
    deadline,
    budgetText: buildCompactBudgetText(form),
    recruitCount,
    region: buildRegionText(form),
    category: mode.category,
    publisherIdentity: 'pr',
    publisherTemplateId: 'publish-wizard-v2',
    coverImage: coverFields.coverImage,
    mpPublishMeta: {
      lingqiPrId: String(account?.lingqiPrId || '').trim(),
      registryPrId: String(account?.registryPrId || account?.registryMemberId || '').trim(),
      prParticipantKey: prParticipantKey(pr),
      prDisplayName: prDisplayName(pr),
      prProfileSnapshot: buildPrProfileSnapshot(pr),
      prAccountType: pr?.accountType || 'company',
      prWxNickName: String(pr?.wxNickName || '').trim(),
      prWxAvatarUrl: String(pr?.wxAvatarUrl || '').trim(),
      deliveryWindow: form.deliveryWindow,
      recruitMode: mode.id,
      recruitTarget,
      signupDeadline: deadline,
      fansLimitMode: form.fansLimitMode,
      fansMin: form.fansMin,
      talentTags: form.talentTags,
      shootDate: form.shootDate,
      shootTimeStart: form.shootTimeStart,
      shootTimeEnd: form.shootTimeEnd,
      shootLocation: form.shootLocation,
      deliverables: form.deliverables,
      equipmentRequired: form.equipmentRequired,
      materialSource: form.materialSource,
      materialUrl: form.materialUrl,
      aspectRatio: form.aspectRatio,
      targetDuration: form.targetDuration,
      styleTags: form.styleTags,
      packageTags: form.packageTags,
      deliveryDeadline: form.deliveryDeadline,
      referenceUrl: form.referenceUrl,
      livePlatform: form.livePlatform,
      liveDate: form.liveDate,
      liveTimeStart: form.liveTimeStart,
      liveDuration: form.liveDuration,
      liveType: form.liveType,
      productSummary: form.productSummary,
      samplePolicy: form.samplePolicy,
      scriptRequirement: form.scriptRequirement,
      douyinSalesLevels:
        recruitModeId === 'live'
          ? isDouyinLivePlatform(form.livePlatform)
            ? form.douyinSalesLevels
            : []
          : form.platform === '抖音'
            ? form.douyinSalesLevels
            : [],
      feeTypeId: form.feeTypeId,
      fixedPrice: form.fixedPrice,
      selfQuoteMin: form.selfQuoteMin,
      selfQuoteMax: form.selfQuoteMax,
      levelTiers: form.levelTiers,
      fansTiers: form.fansTiers,
      cpsPercent: form.cpsPercent,
      recruitDetail: form.recruitDetail,
      cityNational: !!form.cityNational,
      cities: form.selectedCities || [],
      applyFormTemplateId: form.applyFormTemplateId,
      applyFormTemplateName: form.applyFormTemplateName || '',
      applyFormFields: form.applyFormFields || [],
      coverLibraryId: coverFields.coverLibraryId,
      coverImageSource: coverFields.coverImageSource,
      ...(coverFields.coverImageSource === 'library' && coverFields.coverImage
        ? { coverImage: coverFields.coverImage }
        : {}),
      iceVideoUrl: recruitModeId === 'edit_ice' ? '' : resolveIceReferenceVideoUrl(form),
      iceVerifyMode: form.iceVerifyMode === 'pr' ? 'pr' : 'ai',
      ...(groupQrImage ? { groupQrImage } : {}),
      ...(editGroupQrImage ? { editGroupQrImage } : {}),
      ...(form.linkeAttach?.enabled && form.linkeAttach.clientId
        ? {
            linkeLinkage: {
              enabled: true,
              clientId: form.linkeAttach.clientId,
              merchantAccountId: form.linkeAttach.merchantAccountId,
              merchantDisplayName: form.linkeAttach.merchantDisplayName,
              productIds: form.linkeAttach.productIds || [],
              merchantPhone: String(form.linkeAttach.merchantPhone || '').trim(),
            },
          }
        : {}),
    },
  }
  if (groupQrImage) {
    order.groupQrImage = groupQrImage
  }
  if (editGroupQrImage) {
    order.editGroupQrImage = editGroupQrImage
  }
  if (mode.hall === 'ice' || recruitModeId === 'edit_ice') {
    order.orderKind = 'recruitment_ice'
    order.hall = 'ice'
    order.fulfillmentLoop = 'closed'
    const isEditIce = recruitModeId === 'edit_ice'
    const url = isEditIce ? '' : resolveIceReferenceVideoUrl(form)
    const ts = mpId.split('-').pop() || String(nowMs)
    const slotN = Math.max(1, parseNonNegativeInt(String(form.recruitCount || '1'), 1))
    order.iceVideoSlots = Array.from({ length: slotN }, (_, i) => ({
      slotId: i === 0 ? `SLOT-${ts}` : `SLOT-${ts}-${i + 1}`,
      label: `成片${i + 1}`,
      downloadUrl: url,
      iceJobId: '',
    }))
  } else {
    order.hall = 'normal'
  }
  return order
}

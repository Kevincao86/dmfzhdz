const mpRecruitmentOrderId = require('./mpRecruitmentOrderId.js')

function defaultDeadlineText() {
  const d = new Date(Date.now() + 7 * 86400000)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function buildFormRelayOrder(input) {
  const nowMs = Date.now()
  const now = new Date(nowMs).toLocaleString('zh-CN', { hour12: false })
  const mpId = mpRecruitmentOrderId.buildMpRecruitmentOrderId('RO', nowMs)
  const sourceUrl = String((input && input.sourceUrl) || '').trim()
  const parsed = input && input.parsed && typeof input.parsed === 'object' ? input.parsed : null
  const title =
    String((input && input.title) || '').trim() ||
    String((parsed && parsed.titleHint) || '').trim() ||
    '转发代收招募'
  const prMeta = (input && input.prMeta) || {}
  const relay = {
    sourcePlatform: String((input && input.sourcePlatform) || 'other'),
    sourceUrl,
    createdAt: now,
    titleNote: String((input && input.titleNote) || '').trim(),
    scrapedTaskDetail: parsed && parsed.taskDetail ? String(parsed.taskDetail).trim() : '',
    scrapedRequirements: parsed && parsed.merchantRequirements ? String(parsed.merchantRequirements).trim() : '',
    scrapedCity: parsed && parsed.city ? String(parsed.city).trim() : '',
    scrapedRegion: parsed && (parsed.region || parsed.city) ? String(parsed.region || parsed.city).trim() : '',
    scrapedTitleHint: parsed && parsed.titleHint ? String(parsed.titleHint).trim() : '',
    scrapedAt: parsed ? now : '',
  }
  if (!relay.titleNote) delete relay.titleNote
  if (!relay.scrapedTaskDetail) delete relay.scrapedTaskDetail
  if (!relay.scrapedRequirements) delete relay.scrapedRequirements
  if (!relay.scrapedCity) delete relay.scrapedCity
  if (!relay.scrapedRegion) delete relay.scrapedRegion
  if (!relay.scrapedTitleHint) delete relay.scrapedTitleHint
  if (!relay.scrapedAt) delete relay.scrapedAt

  const relayHeader = [
    '【转发代收】达人通过灵祺星选报名，报名数据可在管理台导出后回填原表。',
    `原表平台：${relay.sourcePlatform}`,
    sourceUrl ? `原表链接：${sourceUrl}` : '',
    relay.titleNote ? `备注：${relay.titleNote}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const taskDetailBody = parsed && parsed.taskDetail ? String(parsed.taskDetail).trim() : ''
  const requirementsBody = parsed && parsed.merchantRequirements ? String(parsed.merchantRequirements).trim() : ''
  const recruitmentInfo = [
    relayHeader,
    requirementsBody ? `\n【招募要求】\n${requirementsBody}` : '',
    taskDetailBody ? `\n【任务详情】\n${taskDetailBody}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const region = (parsed && (parsed.region || parsed.city) ? String(parsed.region || parsed.city).trim() : '') || '全国'
  const storeName = (parsed && (parsed.city || parsed.region) ? String(parsed.city || parsed.region).trim() : '') || '转发代收'
  const budgetText = parsed && parsed.budgetHint ? String(parsed.budgetHint).trim() : '面议'

  return {
    id: mpId,
    sourceMerchantOrderId: mpRecruitmentOrderId.buildMpRecruitmentOrderId('USER', nowMs),
    customerName: title.slice(0, 24),
    storeName,
    merchantRequirements: requirementsBody || recruitmentInfo,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    applicants: [],
    title,
    recruitmentInfo,
    taskDetail: taskDetailBody || recruitmentInfo,
    platform: '抖音',
    fansRequirement: requirementsBody || '不限',
    urgent: false,
    deadline: defaultDeadlineText(),
    budgetText,
    recruitCount: 99,
    region,
    category: '探店',
    publisherIdentity: 'pr',
    publisherTemplateId: 'form-relay-v1',
    hall: 'normal',
    mpPublishMeta: {
      prParticipantKey: String(prMeta.prParticipantKey || '').trim(),
      prDisplayName: String(prMeta.prDisplayName || '').trim(),
      lingqiPrId: String(prMeta.lingqiPrId || '').trim(),
      registryPrId: String(prMeta.registryPrId || '').trim(),
      prWxNickName: String(prMeta.prWxNickName || '').trim(),
      prWxAvatarUrl: String(prMeta.prWxAvatarUrl || '').trim(),
      recruitTarget: 'talent',
      recruitMode: 'normal',
      deliveryWindow: 'normal',
      externalFormRelay: relay,
    },
  }
}

module.exports = {
  buildFormRelayOrder,
}

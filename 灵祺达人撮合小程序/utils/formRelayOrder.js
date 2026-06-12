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
  const title = String((input && input.title) || '').trim() || '转发代收招募'
  const prMeta = (input && input.prMeta) || {}
  const relay = {
    sourcePlatform: String((input && input.sourcePlatform) || 'other'),
    sourceUrl,
    createdAt: now,
    titleNote: String((input && input.titleNote) || '').trim(),
  }
  const recruitmentInfo = [
    '【转发代收】达人通过灵祺星选报名，报名数据可在管理台导出后回填原表。',
    `原表平台：${relay.sourcePlatform}`,
    sourceUrl ? `原表链接：${sourceUrl}` : '',
    relay.titleNote ? `备注：${relay.titleNote}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: mpId,
    sourceMerchantOrderId: mpRecruitmentOrderId.buildMpRecruitmentOrderId('USER', nowMs),
    customerName: title.slice(0, 24),
    storeName: '转发代收',
    merchantRequirements: recruitmentInfo,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    applicants: [],
    title,
    recruitmentInfo,
    taskDetail: recruitmentInfo,
    platform: '抖音',
    fansRequirement: '不限',
    urgent: false,
    deadline: defaultDeadlineText(),
    budgetText: '面议',
    recruitCount: 99,
    region: '全国',
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

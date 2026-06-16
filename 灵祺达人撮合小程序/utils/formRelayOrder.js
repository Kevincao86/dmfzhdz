const mpRecruitmentOrderId = require('./mpRecruitmentOrderId.js')
const formRelayPlatforms = require('./formRelayPlatforms.js')
const formRelaySourceMpLink = require('./formRelaySourceMpLink.js')

function defaultDeadlineText() {
  const d = new Date(Date.now() + 7 * 86400000)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function buildFormRelayOrder(input) {
  const nowMs = Date.now()
  const now = new Date(nowMs).toLocaleString('zh-CN', { hour12: false })
  const mpId = mpRecruitmentOrderId.buildMpRecruitmentOrderId('RO', nowMs)
  const sourceUrl = String((input && input.sourceUrl) || '').trim()
  const relayMode =
    (input && input.relayMode === 'group_qr') || (input && input.sourcePlatform === 'group_qr')
      ? 'group_qr'
      : 'link'
  const groupQrImage = String((input && input.groupQrImage) || '').trim()
  const parsed = input && input.parsed && typeof input.parsed === 'object' ? input.parsed : null
  const title =
    String((input && input.title) || '').trim() ||
    String((parsed && parsed.titleHint) || '').trim() ||
    '转发代收招募'
  const prMeta = (input && input.prMeta) || {}
  const detectedPlatform = formRelayPlatforms.detectFormRelayPlatform(sourceUrl)
  const effectiveSourcePlatform =
    relayMode === 'group_qr'
      ? 'group_qr'
      : detectedPlatform !== 'other'
        ? detectedPlatform
        : String((input && input.sourcePlatform) || 'other')
  const relay = {
    sourcePlatform: effectiveSourcePlatform,
    sourceUrl,
    relayMode,
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

  const mpLink = formRelaySourceMpLink.resolveFormRelaySourceMpLink(
    sourceUrl,
    effectiveSourcePlatform,
    parsed && parsed.sourceMpAppId && parsed.sourceMpPath
      ? {
          sourceMpDisplayLink: parsed.sourceMpDisplayLink,
          sourceMpAppId: parsed.sourceMpAppId,
          sourceMpPath: parsed.sourceMpPath,
        }
      : undefined,
  )
  if (mpLink.displayLink && mpLink.openKind === 'miniProgram' && mpLink.appId && mpLink.path) {
    relay.sourceMpDisplayLink = mpLink.displayLink
    relay.sourceMpAppId = mpLink.appId
    relay.sourceMpPath = mpLink.path
  } else if (parsed && parsed.sourceMpAppId && parsed.sourceMpPath) {
    relay.sourceMpDisplayLink =
      String(parsed.sourceMpDisplayLink || mpLink.displayLink || '').trim() || undefined
    relay.sourceMpAppId = parsed.sourceMpAppId
    relay.sourceMpPath = parsed.sourceMpPath
  }

  const relayHeader =
    relayMode === 'group_qr' || formRelayPlatforms.isFormRelayGroupQrRelay(relay)
      ? [
          '【转发代收·二维码加群】达人点击「前往原表报名」查看群二维码，长按识别进群。',
          `原表平台：${formRelayPlatforms.resolveFormRelayPlatformLabel(relay)}`,
          groupQrImage ? '群二维码：创建时已上传' : '群二维码：请在发布前上传',
          relay.titleNote ? `备注：${relay.titleNote}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          '【转发代收】达人通过灵祺星选报名，报名数据可在管理台导出后回填原表。',
          `原表平台：${formRelayPlatforms.resolveFormRelayPlatformLabel(relay)}`,
          sourceUrl ? `原表链接：${mpLink.displayLink || sourceUrl}` : '',
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
  const recruitPlatform = parsed && parsed.recruitPlatform ? String(parsed.recruitPlatform).trim() : '抖音'

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
    platform: recruitPlatform,
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
    ...(groupQrImage ? { groupQrImage } : {}),
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
      ...(groupQrImage ? { groupQrImage } : {}),
      externalFormRelay: relay,
    },
  }
}

function applyFormRelayPublishPreviewEdits(order, preview) {
  if (!order || typeof order !== 'object') return order
  const p = preview && typeof preview === 'object' ? preview : {}
  const meta = Object.assign({}, order.mpPublishMeta || {})
  const relay = Object.assign({}, meta.externalFormRelay || {})
  const title = String(p.title || '').trim() || String(order.title || '')
  const platform = String(p.platform || '').trim() || '抖音'
  const region = String(p.region || '').trim() || '全国'
  const budgetText = String(p.budgetText || '').trim() || '面议'
  const info = String(p.recruitmentInfo || '').trim()
  const titleNote = String(p.titleNote || '').trim()
  const deadline = String(p.deadline || '').trim()

  if (titleNote) relay.titleNote = titleNote
  else delete relay.titleNote
  meta.externalFormRelay = relay

  const next = Object.assign({}, order, {
    title,
    customerName: title.slice(0, 24),
    platform,
    region,
    storeName: region && region !== '全国' ? region : '转发代收',
    budgetText,
    mpPublishMeta: meta,
  })
  if (deadline) next.deadline = deadline
  if (info) {
    next.recruitmentInfo = info
    next.taskDetail = info
    next.merchantRequirements = info
  }
  const groupQrImage = String(p.groupQrImage || '').trim()
  if (groupQrImage) {
    next.groupQrImage = groupQrImage
    next.mpPublishMeta = Object.assign({}, meta, { groupQrImage })
  }
  return next
}

module.exports = {
  buildFormRelayOrder,
  applyFormRelayPublishPreviewEdits,
}

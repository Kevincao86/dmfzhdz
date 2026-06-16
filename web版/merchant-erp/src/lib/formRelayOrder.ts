import { buildMpRecruitmentOrderId } from './mpRecruitmentOrderId'
import type { ExternalFormRelay, FormRelayPlatformId, FormRelayRelayMode } from './formRelayPlatforms'
import {
  detectFormRelayPlatform,
  isFormRelayGroupQrRelay,
  resolveFormRelayPlatformLabel,
} from './formRelayPlatforms.js'
import { resolveFormRelaySourceMpLink } from './formRelaySourceMpLink.js'

export type FormRelayPrMeta = {
  prParticipantKey?: string
  prDisplayName?: string
  lingqiPrId?: string
  registryPrId?: string
  prWxNickName?: string
  prWxAvatarUrl?: string
}

export type FormRelayParsedFields = {
  taskDetail?: string
  merchantRequirements?: string
  city?: string
  region?: string
  titleHint?: string
  budgetHint?: string
  recruitPlatform?: string
  sourceMpAppId?: string
  sourceMpPath?: string
  sourceMpDisplayLink?: string
}

export type BuildFormRelayOrderInput = {
  sourceUrl: string
  sourcePlatform: FormRelayPlatformId
  title: string
  titleNote?: string
  prMeta: FormRelayPrMeta
  parsed?: FormRelayParsedFields | null
  relayMode?: FormRelayRelayMode
  groupQrImage?: string
}

/** 发布预览阶段可编辑字段（确认发布前写回订单） */
export type FormRelayPublishPreview = {
  title: string
  platform: string
  region: string
  budgetText: string
  recruitmentInfo: string
  titleNote?: string
  deadline?: string
  groupQrImage?: string
}

export function applyFormRelayPublishPreviewEdits(
  order: Record<string, unknown>,
  preview: FormRelayPublishPreview,
): Record<string, unknown> {
  const meta = { ...(order.mpPublishMeta as Record<string, unknown>) }
  const relay = { ...(meta.externalFormRelay as Record<string, unknown>) }
  const title = String(preview.title || '').trim() || String(order.title || '')
  const platform = String(preview.platform || '').trim() || '抖音'
  const region = String(preview.region || '').trim() || '全国'
  const budgetText = String(preview.budgetText || '').trim() || '面议'
  const info = String(preview.recruitmentInfo || '').trim()
  const titleNote = String(preview.titleNote || '').trim()
  const deadline = String(preview.deadline || '').trim()

  if (titleNote) relay.titleNote = titleNote
  else delete relay.titleNote
  meta.externalFormRelay = relay

  const next: Record<string, unknown> = {
    ...order,
    title,
    customerName: title.slice(0, 24),
    platform,
    region,
    storeName: region && region !== '全国' ? region : '转发代收',
    budgetText,
    mpPublishMeta: meta,
  }
  if (deadline) next.deadline = deadline
  if (info) {
    next.recruitmentInfo = info
    next.taskDetail = info
    next.merchantRequirements = info
  }
  const groupQrImage = String(preview.groupQrImage || '').trim()
  if (groupQrImage) {
    next.groupQrImage = groupQrImage
    next.mpPublishMeta = { ...meta, groupQrImage }
  }
  return next
}

/** append 前剥离内联群码（减小 POST 体积；群码改走 patch 写入 side map） */
export function stripInlineGroupQrFromOrder(order: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...order }
  delete next.groupQrImage
  const metaRaw = next.mpPublishMeta
  if (metaRaw && typeof metaRaw === 'object') {
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    next.mpPublishMeta = meta
  }
  return next
}

function defaultDeadlineText(): string {
  const d = new Date(Date.now() + 7 * 86400000)
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 由外部表单链接生成灵祺代收招募单（方案 A：我们侧收单，再导出回填客户表） */
export function buildFormRelayOrder(input: BuildFormRelayOrderInput): Record<string, unknown> {
  const nowMs = Date.now()
  const now = new Date(nowMs).toLocaleString('zh-CN', { hour12: false })
  const mpId = buildMpRecruitmentOrderId('RO', nowMs)
  const sourceUrl = String(input.sourceUrl || '').trim()
  const relayMode: FormRelayRelayMode =
    input.relayMode === 'group_qr' || input.sourcePlatform === 'group_qr' ? 'group_qr' : 'link'
  const groupQrImage = String(input.groupQrImage || '').trim()
  const parsed = input.parsed && typeof input.parsed === 'object' ? input.parsed : null
  const title =
    String(input.title || '').trim() ||
    String(parsed?.titleHint || '').trim() ||
    '转发代收招募'
  const detectedPlatform = detectFormRelayPlatform(sourceUrl)
  const effectiveSourcePlatform =
    relayMode === 'group_qr'
      ? 'group_qr'
      : detectedPlatform !== 'other'
        ? detectedPlatform
        : input.sourcePlatform
  const relay: ExternalFormRelay = {
    sourcePlatform: effectiveSourcePlatform,
    sourceUrl,
    relayMode,
    createdAt: now,
    titleNote: String(input.titleNote || '').trim() || undefined,
    scrapedTaskDetail: String(parsed?.taskDetail || '').trim() || undefined,
    scrapedRequirements: String(parsed?.merchantRequirements || '').trim() || undefined,
    scrapedCity: String(parsed?.city || '').trim() || undefined,
    scrapedRegion: String(parsed?.region || parsed?.city || '').trim() || undefined,
    scrapedTitleHint: String(parsed?.titleHint || '').trim() || undefined,
    scrapedAt: parsed ? now : undefined,
  }
  const mpLink = resolveFormRelaySourceMpLink(
    sourceUrl,
    effectiveSourcePlatform,
    parsed?.sourceMpAppId && parsed?.sourceMpPath
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
  } else if (parsed?.sourceMpAppId && parsed?.sourceMpPath) {
    relay.sourceMpDisplayLink = String(parsed.sourceMpDisplayLink || mpLink.displayLink || '').trim() || undefined
    relay.sourceMpAppId = parsed.sourceMpAppId
    relay.sourceMpPath = parsed.sourceMpPath
  }
  const relayHeader =
    relayMode === 'group_qr' || isFormRelayGroupQrRelay(relay)
      ? [
          '【转发代收·二维码加群】达人点击「前往原表报名」查看群二维码，长按识别进群。',
          `原表平台：${resolveFormRelayPlatformLabel(relay)}`,
          groupQrImage ? '群二维码：创建时已上传' : '群二维码：请在发布前上传',
          relay.titleNote ? `备注：${relay.titleNote}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          '【转发代收】达人通过灵祺星选报名，报名数据可在管理台导出后回填原表。',
          `原表平台：${resolveFormRelayPlatformLabel(relay)}`,
          sourceUrl ? `原表链接：${mpLink.displayLink || sourceUrl}` : '',
          relay.titleNote ? `备注：${relay.titleNote}` : '',
        ]
          .filter(Boolean)
          .join('\n')

  const taskDetailBody = String(parsed?.taskDetail || '').trim()
  const requirementsBody = String(parsed?.merchantRequirements || '').trim()
  const recruitmentInfo = [
    relayHeader,
    requirementsBody ? `\n【招募要求】\n${requirementsBody}` : '',
    taskDetailBody ? `\n【任务详情】\n${taskDetailBody}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const region = String(parsed?.region || parsed?.city || '').trim() || '全国'
  const storeName = String(parsed?.city || parsed?.region || '').trim() || '转发代收'
  const budgetText = String(parsed?.budgetHint || '').trim() || '面议'
  const recruitPlatform = String(parsed?.recruitPlatform || '').trim() || '抖音'

  return {
    id: mpId,
    sourceMerchantOrderId: buildMpRecruitmentOrderId('USER', nowMs),
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
      prParticipantKey: String(input.prMeta.prParticipantKey || '').trim(),
      prDisplayName: String(input.prMeta.prDisplayName || '').trim(),
      lingqiPrId: String(input.prMeta.lingqiPrId || '').trim(),
      registryPrId: String(input.prMeta.registryPrId || '').trim(),
      prWxNickName: String(input.prMeta.prWxNickName || '').trim(),
      prWxAvatarUrl: String(input.prMeta.prWxAvatarUrl || '').trim(),
      recruitTarget: 'talent',
      recruitMode: 'normal',
      deliveryWindow: 'normal',
      ...(groupQrImage ? { groupQrImage } : {}),
      externalFormRelay: relay,
    },
  }
}

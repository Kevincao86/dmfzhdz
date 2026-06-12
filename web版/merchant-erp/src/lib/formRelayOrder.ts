import { buildMpRecruitmentOrderId } from './mpRecruitmentOrderId'
import type { ExternalFormRelay, FormRelayPlatformId } from './formRelayPlatforms'
import { formRelayPlatformLabel } from './formRelayPlatforms.js'

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
}

export type BuildFormRelayOrderInput = {
  sourceUrl: string
  sourcePlatform: FormRelayPlatformId
  title: string
  titleNote?: string
  prMeta: FormRelayPrMeta
  parsed?: FormRelayParsedFields | null
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
  const parsed = input.parsed && typeof input.parsed === 'object' ? input.parsed : null
  const title =
    String(input.title || '').trim() ||
    String(parsed?.titleHint || '').trim() ||
    '转发代收招募'
  const relay: ExternalFormRelay = {
    sourcePlatform: input.sourcePlatform,
    sourceUrl,
    createdAt: now,
    titleNote: String(input.titleNote || '').trim() || undefined,
    scrapedTaskDetail: String(parsed?.taskDetail || '').trim() || undefined,
    scrapedRequirements: String(parsed?.merchantRequirements || '').trim() || undefined,
    scrapedCity: String(parsed?.city || '').trim() || undefined,
    scrapedRegion: String(parsed?.region || parsed?.city || '').trim() || undefined,
    scrapedTitleHint: String(parsed?.titleHint || '').trim() || undefined,
    scrapedAt: parsed ? now : undefined,
  }
  const relayHeader = [
    '【转发代收】达人通过灵祺星选报名，报名数据可在管理台导出后回填原表。',
    `原表平台：${formRelayPlatformLabel(relay.sourcePlatform)}`,
    sourceUrl ? `原表链接：${sourceUrl}` : '',
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
      externalFormRelay: relay,
    },
  }
}

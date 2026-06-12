import { buildMpRecruitmentOrderId } from './mpRecruitmentOrderId'
import type { ExternalFormRelay, FormRelayPlatformId } from './formRelayPlatforms'

export type FormRelayPrMeta = {
  prParticipantKey?: string
  prDisplayName?: string
  lingqiPrId?: string
  registryPrId?: string
  prWxNickName?: string
  prWxAvatarUrl?: string
}

export type BuildFormRelayOrderInput = {
  sourceUrl: string
  sourcePlatform: FormRelayPlatformId
  title: string
  titleNote?: string
  prMeta: FormRelayPrMeta
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
  const title = String(input.title || '').trim() || '转发代收招募'
  const relay: ExternalFormRelay = {
    sourcePlatform: input.sourcePlatform,
    sourceUrl,
    createdAt: now,
    titleNote: String(input.titleNote || '').trim() || undefined,
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
    sourceMerchantOrderId: buildMpRecruitmentOrderId('USER', nowMs),
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

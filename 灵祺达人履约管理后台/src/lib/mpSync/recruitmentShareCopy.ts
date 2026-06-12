import { copyTextToClipboard } from '../copyTextToClipboard'
import { readPrProfile, prDisplayName } from './userProfile'
import { resolveOrderPublisherDisplayName } from './prRecruitQr'
import { recruitTargetLabel } from '../mpRecruitment/recruitTargetLabel'

const GUIDE_DIVIDER = '—— 报名指引 ——'
const OPEN_HINT =
  '请打开「灵祺星选」小程序或网址（https://dr.mofangdianai.com/），在招募大厅找到本单或联系发布者获取详情页报名。'
const MP_SHARE_APP_NAME = String(import.meta.env.VITE_MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'

export function shareCopyHeader(
  order?: Record<string, unknown> | null,
  prProfile?: ReturnType<typeof readPrProfile> | null,
): string {
  const fromOrder = resolveOrderPublisherDisplayName(order)
  if (fromOrder) return `【${fromOrder}】`
  const pr = prProfile ?? null
  if (pr) {
    const name = prDisplayName(pr) || String(pr.wxNickName || '').trim()
    if (name) return `【${name}】`
  }
  return '【灵祺星选】'
}

export function buildRecruitmentMpPath(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  return `/pages/detail/detail?id=${encodeURIComponent(id)}`
}

/** 报名链接：微信群可点击 #小程序:// 直达商单详情；VITE_MP_SHARE_APPLY_BASE_URL 仍优先 */
export function buildRecruitmentApplyLink(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  const custom = String(import.meta.env.VITE_MP_SHARE_APPLY_BASE_URL || '').trim().replace(/\/$/, '')
  if (custom) {
    if (custom.includes('{mpId}')) return custom.replace(/\{mpId\}/g, encodeURIComponent(id))
    const sep = custom.includes('?') ? '&' : '?'
    return `${custom}${sep}mpId=${encodeURIComponent(id)}`
  }
  const pagePath = `pages/detail/detail?id=${encodeURIComponent(id)}`
  return `#小程序://${MP_SHARE_APP_NAME}/${pagePath}`
}

export function formatShareRecruitmentInfo(info: string): string {
  const lines = String(info || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.length) return ''

  let feeMode = ''
  for (const line of lines) {
    const m = line.match(/^费用模式[:：]\s*(.+)$/)
    if (m) feeMode = m[1].trim()
  }

  const out: string[] = []
  for (const line of lines) {
    if (/^酬劳摘要[:：]/.test(line)) continue
    if (/^佣金CPS[:：]\s*未设置/.test(line)) continue
    if (/^酬劳[:：]/.test(line)) {
      if (feeMode === '纯置换' && /纯置换/.test(line)) continue
      if (feeMode === '一口价' && /一口价|¥/.test(line)) continue
    }
    const targetMatch = line.match(/^招募对象[:：]\s*(.+)$/)
    if (targetMatch) {
      out.push(`招募对象：${recruitTargetLabel(targetMatch[1])}`)
      continue
    }
    const detailMatch = line.match(/^招募详情[:：]\s*(.*)$/)
    if (detailMatch) {
      out.push('招募详情：')
      const body = String(detailMatch[1] || '').trim()
      if (body) out.push(body)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function buildShareGuideBlock(orderId: string, applyLink?: string): string {
  const link = applyLink || buildRecruitmentApplyLink(orderId)
  const parts = [GUIDE_DIVIDER, '']
  if (link) parts.push(`报名地址：${link}`, OPEN_HINT)
  else parts.push(OPEN_HINT)
  parts.push(`招募单号：${orderId}`)
  return parts.join('\n')
}

export function resolveCachedApplyLink(order: Record<string, unknown> | null | undefined): string {
  if (!order || typeof order !== 'object') return ''
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  return String(meta.applyShortLink || order.applyShortLink || '').trim()
}

export function buildGroupCopyText(
  order: {
    id: string
    title?: string
    region?: string
    recruitmentInfo?: string
    taskDetail?: string
    merchantRequirements?: string
    mpPublishMeta?: Record<string, unknown>
    applyShortLink?: string
  },
  prProfile?: ReturnType<typeof readPrProfile> | null,
  applyLink?: string,
): string {
  const raw = order.recruitmentInfo || order.taskDetail || order.merchantRequirements || ''
  const info = formatShareRecruitmentInfo(raw)
  const link = applyLink || resolveCachedApplyLink(order as Record<string, unknown>)
  const guide = buildShareGuideBlock(order.id, link)
  const parts = [shareCopyHeader(order as Record<string, unknown>, prProfile), '']
  if (info) parts.push(info, '')
  parts.push(guide)
  return parts.join('\n')
}

export async function buildGroupCopyTextAsync(
  order: Parameters<typeof buildGroupCopyText>[0],
  prProfile?: ReturnType<typeof readPrProfile> | null,
): Promise<string> {
  let applyLink = resolveCachedApplyLink(order as Record<string, unknown>)
  if (!applyLink) {
    const { fetchMpApplyShortLink } = await import('../mpApi')
    try {
      const out = await fetchMpApplyShortLink(order.id, order.title)
      applyLink = out.link
    } catch {
      applyLink = buildRecruitmentApplyLink(order.id)
    }
  }
  return buildGroupCopyText(order, prProfile, applyLink)
}

export function buildShareTitle(order: { title?: string; region?: string }): string {
  return `${order.title || '招募'} · ${order.region || '全国'}招募`
}

function orderToShareInput(order: Record<string, unknown>) {
  const id = String(order.id || '').trim()
  if (!id) throw new Error('订单数据缺失')
  return {
    id,
    title: String(order.title || ''),
    region: String(order.region || '全国'),
    customerName: String(order.customerName || ''),
    recruitmentInfo: String(order.recruitmentInfo || ''),
    taskDetail: String(order.taskDetail || ''),
    merchantRequirements: String(order.merchantRequirements || ''),
    mpPublishMeta:
      order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
        ? (order.mpPublishMeta as Record<string, unknown>)
        : undefined,
  }
}

/** 生成分享文案（含异步短链）；配合 RecruitmentShareSheet，避免异步后直接写剪贴板 */
export async function prepareRecruitmentSharePayload(
  order: Record<string, unknown>,
  prProfile?: ReturnType<typeof readPrProfile> | null,
): Promise<{ text: string; title: string; order: Record<string, unknown> }> {
  const input = orderToShareInput(order)
  const text = await buildGroupCopyTextAsync(input, prProfile)
  return { text, title: buildShareTitle(input), order }
}

export async function copyRecruitmentShareForTalent(order: Record<string, unknown>) {
  const { text } = await prepareRecruitmentSharePayload(order, null)
  await copyTextToClipboard(text)
  return text
}

export async function copyRecruitmentShare(order: Record<string, unknown>, prProfile?: ReturnType<typeof readPrProfile> | null) {
  const { text } = await prepareRecruitmentSharePayload(order, prProfile)
  await copyTextToClipboard(text)
  return text
}

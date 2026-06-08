import { readPrProfile, prDisplayName } from './userProfile'

const GUIDE_DIVIDER = '—— 报名指引 ——'

export function shareCopyHeader(prProfile?: ReturnType<typeof readPrProfile> | null): string {
  const pr = prProfile ?? readPrProfile()
  if (pr) {
    const name = prDisplayName(pr) || String(pr.wxNickName || '').trim()
    if (name) return `【${name}】`
  }
  return '【灵祺星选平台】'
}

export function buildRecruitmentMpPath(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  return `/pages/detail/detail?id=${encodeURIComponent(id)}`
}

/** 报名地址：小程序商单详情路径；自定义 VITE_MP_SHARE_APPLY_BASE_URL 仍优先 */
export function buildRecruitmentApplyLink(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  const custom = String(import.meta.env.VITE_MP_SHARE_APPLY_BASE_URL || '').trim().replace(/\/$/, '')
  if (custom) {
    if (custom.includes('{mpId}')) return custom.replace(/\{mpId\}/g, encodeURIComponent(id))
    const sep = custom.includes('?') ? '&' : '?'
    return `${custom}${sep}mpId=${encodeURIComponent(id)}`
  }
  return buildRecruitmentMpPath(id)
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

function buildShareGuideBlock(orderId: string): string {
  const applyLink = buildRecruitmentApplyLink(orderId)
  const openHint = '请打开灵祺星选平台 小程序或网址（https://dr.mofangdianai.com/）'
  const parts = [GUIDE_DIVIDER, '']
  if (applyLink) parts.push(`报名地址：${applyLink}`, openHint)
  else parts.push(openHint)
  parts.push(`招募单号：${orderId}`)
  return parts.join('\n')
}

export function buildGroupCopyText(
  order: {
    id: string
    title?: string
    region?: string
    recruitmentInfo?: string
    taskDetail?: string
    merchantRequirements?: string
  },
  prProfile?: ReturnType<typeof readPrProfile> | null,
): string {
  const raw = order.recruitmentInfo || order.taskDetail || order.merchantRequirements || ''
  const info = formatShareRecruitmentInfo(raw)
  const guide = buildShareGuideBlock(order.id)
  const parts = [shareCopyHeader(prProfile), '']
  if (info) parts.push(info, '')
  parts.push(guide)
  return parts.join('\n')
}

export function buildShareTitle(order: { title?: string; region?: string }): string {
  return `${order.title || '招募'} · ${order.region || '全国'}招募`
}

/** 达人分享招募单（无 PR 机构抬头） */
export async function copyRecruitmentShareForTalent(order: Record<string, unknown>) {
  const id = String(order.id || '').trim()
  if (!id) throw new Error('订单数据缺失')
  const text = buildGroupCopyText(
    {
      id,
      title: String(order.title || ''),
      region: String(order.region || '全国'),
      recruitmentInfo: String(order.recruitmentInfo || ''),
      taskDetail: String(order.taskDetail || ''),
      merchantRequirements: String(order.merchantRequirements || ''),
    },
    null,
  )
  await navigator.clipboard.writeText(text)
  return text
}

export async function copyRecruitmentShare(order: Record<string, unknown>, prProfile?: ReturnType<typeof readPrProfile> | null) {
  const id = String(order.id || '').trim()
  if (!id) throw new Error('订单数据缺失')
  const text = buildGroupCopyText(
    {
      id,
      title: String(order.title || ''),
      region: String(order.region || '全国'),
      recruitmentInfo: String(order.recruitmentInfo || ''),
      taskDetail: String(order.taskDetail || ''),
      merchantRequirements: String(order.merchantRequirements || ''),
    },
    prProfile,
  )
  await navigator.clipboard.writeText(text)
  return text
}

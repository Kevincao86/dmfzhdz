import { ERP_AGENT_USAGE_KIND } from './erpPointsEconomics'
import { MP_POINTS_USAGE_KIND_LABELS } from './mpPointsEconomics'

const USAGE_LABELS: Record<string, string> = {
  ...MP_POINTS_USAGE_KIND_LABELS,
  [ERP_AGENT_USAGE_KIND]: 'AI 智能体对话',
}

const IDEMP_SUFFIX_RE = /\s*\[idemp:[^\]]+\]\s*$/i

function stripIdempotencySuffix(text: string): string {
  return text.replace(IDEMP_SUFFIX_RE, '').trim()
}

function formatMaterialAnalyzeDetail(tail: string): string | undefined {
  const m = tail.match(/^(\d+)\s*素材$/)
  if (m) return `分析 ${m[1]} 条素材`
  if (tail) return tail
  return undefined
}

function formatDurationDetail(tail: string): string | undefined {
  const sec = Number(tail)
  if (Number.isFinite(sec) && sec > 0) return `约 ${Math.ceil(sec)} 秒`
  if (tail && !/^[a-f0-9-]{8,}$/i.test(tail)) return tail
  return undefined
}

function formatNoteDetail(kind: string, noteBody: string): string | undefined {
  const tail = noteBody.trim()
  if (!tail) return undefined
  if (kind === 'mix_material_analyze') return formatMaterialAnalyzeDetail(tail)
  if (
    kind === 'cloud_edit_smart' ||
    kind === 'cloud_edit' ||
    kind === 'shortvideo' ||
    kind === 'digital_human' ||
    kind === 'video'
  ) {
    return formatDurationDetail(tail)
  }
  if (kind === 'brief' || kind === 'article') {
    if (/^订单\s/.test(tail) || tail.includes('订单')) return tail
    if (tail && !/^[a-f0-9-]{8,}$/i.test(tail)) return `订单 ${tail}`
    return undefined
  }
  if (tail && !/^[a-z0-9:_-]{12,}$/i.test(tail)) return tail
  return undefined
}

function formatFromPrefixedNote(raw: string): string | null {
  const text = stripIdempotencySuffix(raw)
  const colon = text.indexOf(':')
  if (colon <= 0) return null
  const prefix = text.slice(0, colon).trim()
  const tail = text.slice(colon + 1).trim()
  const label = USAGE_LABELS[prefix]
  if (!label) return null
  const detail = formatNoteDetail(prefix, tail)
  return detail ? `${label} · ${detail}` : label
}

/** 积分明细「说明」列：隐藏幂等键与技术代号，展示用户可读中文 */
export function formatTenantPointsLedgerReason(
  reason: string,
  usageKind?: string | null,
): string {
  const raw = String(reason || '').trim()
  if (!raw) return '积分变动'

  const kind = String(usageKind || '').trim()
  if (kind && USAGE_LABELS[kind]) {
    const body = stripIdempotencySuffix(raw)
    const label = USAGE_LABELS[kind]!
    if (body === label || body.startsWith(`${label} `) || body.startsWith(`${label}扣费`)) {
      return label
    }
    const colonHit = body.includes(':') ? formatFromPrefixedNote(body) : null
    if (colonHit) return colonHit
    const detail = formatNoteDetail(kind, body.replace(new RegExp(`^${label}\\s*`), ''))
    return detail ? `${label} · ${detail}` : label
  }

  const prefixed = formatFromPrefixedNote(raw)
  if (prefixed) return prefixed

  const cleaned = stripIdempotencySuffix(raw)
  if (/^会员月赠积分/.test(cleaned)) return cleaned
  if (/^积分充值/.test(cleaned)) return cleaned
  if (/^在线充值/.test(cleaned)) return cleaned
  if (/^余额支付/.test(cleaned)) return cleaned
  if (cleaned === 'AI 智能体对话' || cleaned.startsWith('AI 智能体对话')) return 'AI 智能体对话'

  for (const label of Object.values(USAGE_LABELS)) {
    if (cleaned === label || cleaned.startsWith(`${label} `)) return label
  }

  if (/^[a-z0-9:_-]+$/i.test(cleaned) && cleaned.length >= 12) {
    return 'AI 功能使用'
  }

  return cleaned
}

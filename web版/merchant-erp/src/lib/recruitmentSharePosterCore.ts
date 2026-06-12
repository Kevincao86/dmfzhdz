/**
 * 招募单分享海报：字段抽取 + 默认模版（AI 设计 tokens 可覆盖）
 */

function resolveOrderPublisherDisplayName(mp: Record<string, unknown> | null | undefined): string {
  if (!mp || typeof mp !== 'object') return ''
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? (meta.prProfileSnapshot as Record<string, unknown>)
      : {}
  const display = String(meta.prDisplayName || '').trim()
  if (display) return display
  if (snap.accountType === 'personal') {
    return String(snap.personalName || snap.contactName || '').trim()
  }
  return String(snap.companyName || snap.contactName || mp.customerName || '').trim()
}

export type PosterDesignTokens = {
  templateId: string
  accentColor: string
  accentLight: string
  heroTitle: string
  heroSubtitle: string
  inviterSuffix: string
}

export type PosterFieldRow = { label: string; value: string }

export type PosterInput = {
  orderId: string
  title: string
  inviterName: string
  inviterAvatarUrl?: string
  platform: string
  feeTypeText: string
  levelText: string
  fansText: string
  cityText: string
  rows: PosterFieldRow[]
  qrUrl: string
}

const PLATFORM_ACCENTS: Record<string, string> = {
  小红书: '#FE2C55',
  抖音: '#111827',
  快手: '#FF4906',
  视频号: '#07C160',
  B站: '#FB7299',
  微博: '#E6162D',
}

function pickLineValue(text: string, label: string): string {
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    const m = String(line || '').trim().match(new RegExp(`^${label}[:：]\\s*(.+)$`))
    if (m) return m[1].trim()
  }
  return ''
}

function normalizePlatform(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return '不限'
  if (/小红书|xhs/i.test(s)) return '小红书'
  if (/抖音|douyin/i.test(s)) return '抖音'
  if (/快手|kuaishou/i.test(s)) return '快手'
  if (/视频号|微信/i.test(s)) return '视频号'
  if (/b站|bilibili/i.test(s)) return 'B站'
  if (/微博|weibo/i.test(s)) return '微博'
  return s.slice(0, 8)
}

function parseFeeTypeText(info: string, budgetText: string): string {
  const budget = String(budgetText || '').trim()
  if (budget && budget !== '面议') return budget.startsWith('¥') ? budget : `¥${budget.replace(/^¥/, '')}`
  const feeMode = pickLineValue(info, '费用模式')
  const fixed = pickLineValue(info, '一口价')
  if (fixed) return fixed.startsWith('¥') ? fixed : `¥${fixed}`
  const quote = pickLineValue(info, '可接受报价区间')
  if (quote) {
    const parts = quote.split('-').map((p) => p.trim())
    if (parts.length >= 2) {
      const min = parts[0].replace(/[^\d.]/g, '') || parts[0]
      const max = parts[1].replace(/[^\d.]/g, '') || parts[1]
      if (min && max) return `¥${min} - ¥${max}`
    }
    return quote
  }
  const tiers: number[] = []
  for (const line of String(info || '').split(/\r?\n/)) {
    const m = String(line || '').match(/阶梯\d+[:：].*?¥\s*([\d,.]+)/)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n)) tiers.push(n)
    }
  }
  if (tiers.length) {
    const lo = Math.min(...tiers)
    const hi = Math.max(...tiers)
    return lo === hi ? `¥${lo}` : `¥${lo} - ¥${hi}`
  }
  if (/纯置换/.test(info)) return '纯置换'
  if (feeMode) return feeMode
  return budget || '面议'
}

function parseLevelText(info: string, platform: string): string {
  const level = pickLineValue(info, '带货等级')
  if (level) return level
  if (platform === '抖音' || platform === '视频号') return '不限'
  return '—'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function lightenHex(hex: string, mix = 0.9): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#FEF2F2'
  const t = Math.min(1, Math.max(0, mix))
  const r = Math.round(rgb.r + (255 - rgb.r) * t)
  const g = Math.round(rgb.g + (255 - rgb.g) * t)
  const b = Math.round(rgb.b + (255 - rgb.b) * t)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function platformAccent(platform: string): string {
  return PLATFORM_ACCENTS[platform] || '#E63946'
}

export function extractPosterFieldsFromOrder(order: Record<string, unknown>): Omit<PosterInput, 'qrUrl' | 'inviterAvatarUrl'> {
  const info = String(order.recruitmentInfo || order.taskDetail || order.merchantRequirements || '')
  const platform = normalizePlatform(
    String(order.platform || '') || pickLineValue(info, '招募平台') || pickLineValue(info, '直播平台'),
  )
  const fansText =
    String(order.fansRequirement || '').trim() || pickLineValue(info, '粉丝要求') || '不限'
  const cityText = String(order.region || '').trim() || pickLineValue(info, '招募城市') || '全国'
  const feeTypeText = parseFeeTypeText(info, String(order.budgetText || ''))
  const levelText = parseLevelText(info, platform)
  const inviterName =
    resolveOrderPublisherDisplayName(order) ||
    String(order.customerName || '').trim() ||
    '灵祺星选'
  const title = String(order.title || '').trim() || `${inviterName}·达人招募`
  const rows: PosterFieldRow[] = [
    { label: '招募平台', value: platform },
    { label: '费用类型', value: feeTypeText },
    { label: '等级要求', value: levelText },
    { label: '粉丝要求', value: fansText },
    { label: '需求城市', value: cityText },
  ]
  return {
    orderId: String(order.id || '').trim(),
    title,
    inviterName,
    platform,
    feeTypeText,
    levelText,
    fansText,
    cityText,
    rows,
  }
}

export function defaultPosterDesign(
  order: Record<string, unknown>,
  fields: Pick<PosterInput, 'platform' | 'title'>,
): PosterDesignTokens {
  const platform = fields.platform || '不限'
  const accent = platformAccent(platform)
  return {
    templateId: 'default-v1',
    accentColor: accent,
    accentLight: lightenHex(accent, 0.92),
    heroTitle: platform === '不限' ? '达人招募' : `${platform}\n达人招募`,
    heroSubtitle: '',
    inviterSuffix: '邀请你报名通告!',
  }
}

export function mergePosterDesign(
  ai: Partial<PosterDesignTokens> | null | undefined,
  fallback: PosterDesignTokens,
): PosterDesignTokens {
  if (!ai || typeof ai !== 'object') return fallback
  const pick = (k: keyof PosterDesignTokens) => {
    const v = ai[k]
    return typeof v === 'string' && v.trim() ? v.trim() : fallback[k]
  }
  return {
    templateId: pick('templateId'),
    accentColor: /^#[0-9a-f]{6}$/i.test(pick('accentColor')) ? pick('accentColor') : fallback.accentColor,
    accentLight: /^#[0-9a-f]{6}$/i.test(pick('accentLight')) ? pick('accentLight') : fallback.accentLight,
    heroTitle: pick('heroTitle'),
    heroSubtitle: pick('heroSubtitle'),
    inviterSuffix: pick('inviterSuffix'),
  }
}

export function buildPosterInput(
  order: Record<string, unknown>,
  qrUrl: string,
): PosterInput {
  const base = extractPosterFieldsFromOrder(order)
  return { ...base, qrUrl: String(qrUrl || '').trim() }
}

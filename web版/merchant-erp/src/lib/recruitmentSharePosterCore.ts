/**
 * 招募单分享海报：字段抽取 + 固定模版
 */
import {
  getPosterTemplateByIndex,
  normalizePosterStyleIndex,
  type PosterTemplate,
} from './recruitmentSharePosterTemplates.js'

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

export type PosterFooterPanel = {
  slogan: string
  highlights: string[]
}

export type PosterDesignTokens = {
  templateId: string
  template: PosterTemplate
  styleIndex: number
  styleLabel: string
  accentColor: string
  accentLight: string
  heroTitle: string
  heroSubtitle: string
  inviterSuffix: string
  tags: PosterTags
  footerPanel: PosterFooterPanel
}

export type PosterTags = {
  platformLabel: string
  categoryTags: string[]
  orderTypeLabel: string
  chipLabels: string[]
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
  detailText: string
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
  const detailText = extractRecruitDetailText(order, info)
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
    detailText,
    rows,
  }
}

function recruitTargetFromOrder(order: Record<string, unknown>): string {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const t = String(meta.recruitTarget || order.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

function recruitTargetLabel(target: string): string {
  if (target === 'shoot') return '拍摄'
  if (target === 'edit') return '剪辑'
  return '达人'
}

function extractCategoryTags(order: Record<string, unknown>): string[] {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const fromMeta = Array.isArray(meta.talentTags)
    ? (meta.talentTags as unknown[]).map((t) => String(t || '').trim()).filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.slice(0, 3)
  const info = String(order.recruitmentInfo || order.taskDetail || order.merchantRequirements || '')
  const m = info.match(/需求(?:品类|达人)标签[:：]\s*([^\n；;]+)/)
  if (m?.[1]) {
    return m[1]
      .split(/[、,，/\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  const cat = String(order.category || '').trim()
  if (cat && cat !== '本地生活' && cat !== '—') return [cat]
  return []
}

function isIceOrder(order: Record<string, unknown>): boolean {
  if (order.hall === 'ice' || order.orderKind === 'recruitment_ice' || order.orderKind === 'ice') return true
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const mode = String(meta.recruitMode || '').trim()
  return mode === 'ice' || mode === 'edit_ice'
}

export function extractPosterTagsFromOrder(order: Record<string, unknown>): PosterTags {
  const fields = extractPosterFieldsFromOrder(order)
  const platformNorm = normalizePlatform(fields.platform)
  const categoryTags = extractCategoryTags(order)
  const orderTypeLabel = isIceOrder(order) ? 'AI云剪' : recruitTargetLabel(recruitTargetFromOrder(order))
  return {
    platformLabel: platformNorm,
    categoryTags,
    orderTypeLabel,
    chipLabels: [orderTypeLabel, ...categoryTags].filter(Boolean).slice(0, 4),
  }
}

function buildHeroTitle(fields: Pick<PosterInput, 'platform'>, tags: PosterTags): string {
  const platform = fields.platform && fields.platform !== '不限' ? fields.platform : ''
  const typeLabel = tags.orderTypeLabel || '达人'
  if (platform) return `${platform}\n${typeLabel}招募`
  return `${typeLabel}招募`
}

export function buildDefaultFooterPanel(
  fields: Pick<PosterInput, 'platform' | 'feeTypeText' | 'fansText' | 'cityText'>,
  tags: PosterTags,
): PosterFooterPanel {
  const highlights: string[] = []
  const fee = String(fields.feeTypeText || '').trim()
  if (fee && fee !== '—' && fee !== '面议') {
    if (/一口价|¥/.test(fee)) highlights.push('费用清晰')
    else if (/置换/.test(fee)) highlights.push('置换合作')
    else highlights.push('灵活报价')
  } else {
    highlights.push('诚意合作')
  }
  const fans = String(fields.fansText || '').trim()
  if (!fans || fans === '不限' || fans === '—') highlights.push('粉丝不限')
  else highlights.push(`粉丝${fans.replace(/^≥/, '')}`)
  const city = String(fields.cityText || '').trim()
  if (city && city !== '全国' && city !== '—' && city !== '不限') {
    highlights.push(`${city.replace(/市$/, '')}优先`)
  }
  const category = tags.categoryTags?.[0]
  if (category && highlights.length < 3) highlights.push(category)

  const platform = fields.platform && fields.platform !== '不限' ? fields.platform : ''
  const typeLabel = tags.orderTypeLabel || '达人'
  const slogan = category
    ? `${category}·${typeLabel}招募中`
    : platform
      ? `${platform}${typeLabel} · 速来报名`
      : `${typeLabel}招募 · 速来报名`

  return {
    slogan: slogan.slice(0, 16),
    highlights: [...new Set(highlights)].filter(Boolean).slice(0, 3),
  }
}

function normalizeFooterPanel(raw: unknown, fallback: PosterFooterPanel): PosterFooterPanel {
  if (!raw || typeof raw !== 'object') return fallback
  const row = raw as Record<string, unknown>
  const sloganRaw = typeof row.slogan === 'string' ? row.slogan.trim().slice(0, 18) : ''
  const highlightsRaw = Array.isArray(row.highlights)
    ? row.highlights.map((h) => String(h || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return {
    slogan: sloganRaw || fallback.slogan,
    highlights: highlightsRaw.length ? highlightsRaw : fallback.highlights,
  }
}

function extractRecruitDetailText(order: Record<string, unknown>, info: string): string {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const fromMeta = String(meta.recruitDetail || '').trim()
  if (fromMeta) return fromMeta.replace(/\s+/g, ' ').slice(0, 160)
  const fromLine = pickLineValue(info, '招募详情')
  if (fromLine) return fromLine.replace(/\s+/g, ' ').slice(0, 160)
  const skip = new Set([
    '招募平台',
    '费用模式',
    '一口价',
    '可接受报价区间',
    '带货等级',
    '粉丝要求',
    '招募城市',
    '需求品类',
    '需求达人',
    '招募详情',
  ])
  const body = String(info || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter((line) => {
      if (!line) return false
      return !Array.from(skip).some((label) => new RegExp(`^${label}[:：]`).test(line))
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body.slice(0, 160)
}

export function resolvePosterThemeColor(design: PosterDesignTokens): string {
  return design.template?.qrRingColor || design.accentColor || '#7C3AED'
}

export function resolvePosterDesign(order: Record<string, unknown>, styleIndex = 0): PosterDesignTokens {
  const fields = extractPosterFieldsFromOrder(order)
  const tags = extractPosterTagsFromOrder(order)
  const styleIdx = normalizePosterStyleIndex(styleIndex)
  const template = getPosterTemplateByIndex(styleIdx)
  const accent = template.qrRingColor || platformAccent(fields.platform)
  return {
    templateId: template.id,
    template,
    styleIndex: styleIdx,
    styleLabel: template.label,
    accentColor: accent,
    accentLight: template.outerBg || lightenHex(accent, 0.92),
    heroTitle: buildHeroTitle(fields, tags),
    heroSubtitle: '',
    inviterSuffix: '邀请你报名通告!',
    tags,
    footerPanel: buildDefaultFooterPanel(fields, tags),
  }
}

export function defaultPosterDesign(
  order: Record<string, unknown>,
  _fields?: Pick<PosterInput, 'platform' | 'title'>,
): PosterDesignTokens {
  return resolvePosterDesign(order, 0)
}

export function mergePosterDesign(
  ai: Partial<PosterDesignTokens> | null | undefined,
  fallback: PosterDesignTokens,
): PosterDesignTokens {
  if (!ai || typeof ai !== 'object') return fallback
  const pickStr = (k: 'templateId' | 'accentColor' | 'accentLight' | 'heroTitle' | 'heroSubtitle' | 'inviterSuffix') => {
    const v = ai[k]
    return typeof v === 'string' && v.trim() ? v.trim() : fallback[k]
  }
  return {
    ...fallback,
    templateId: pickStr('templateId'),
    accentColor: /^#[0-9a-f]{6}$/i.test(pickStr('accentColor')) ? pickStr('accentColor') : fallback.accentColor,
    accentLight: /^#[0-9a-f]{6}$/i.test(pickStr('accentLight')) ? pickStr('accentLight') : fallback.accentLight,
    heroTitle: pickStr('heroTitle'),
    heroSubtitle: pickStr('heroSubtitle'),
    inviterSuffix: pickStr('inviterSuffix'),
    footerPanel: normalizeFooterPanel(ai.footerPanel, fallback.footerPanel),
  }
}

export function buildPosterInput(
  order: Record<string, unknown>,
  qrUrl: string,
): PosterInput {
  const base = extractPosterFieldsFromOrder(order)
  return { ...base, qrUrl: String(qrUrl || '').trim() }
}

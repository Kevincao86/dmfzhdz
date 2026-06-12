/** 招募单分享海报：字段抽取 + 固定模版（与 Web 版 recruitmentSharePosterCore 对齐） */
const prRecruitQr = require('./prRecruitQr.js')
const posterTemplates = require('./recruitmentSharePosterTemplates.js')
const hallFilters = require('./recruitmentHallFilters.js')
const recruitTarget = require('./recruitTarget.js')
const hallOrderIcon = require('./hallOrderIcon.js')

const PLATFORM_ACCENTS = {
  小红书: '#FE2C55',
  抖音: '#111827',
  快手: '#FF4906',
  视频号: '#07C160',
  B站: '#FB7299',
  微博: '#E6162D',
}

function pickLineValue(text, label) {
  const lines = String(text || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const m = String(lines[i] || '').trim().match(new RegExp(`^${label}[:：]\\s*(.+)$`))
    if (m) return m[1].trim()
  }
  return ''
}

function normalizePlatform(raw) {
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

function parseFeeTypeText(info, budgetText) {
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
  const tiers = []
  String(info || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const m = String(line || '').match(/阶梯\d+[:：].*?¥\s*([\d,.]+)/)
      if (m) {
        const n = Number(m[1].replace(/,/g, ''))
        if (Number.isFinite(n)) tiers.push(n)
      }
    })
  if (tiers.length) {
    const lo = Math.min.apply(null, tiers)
    const hi = Math.max.apply(null, tiers)
    return lo === hi ? `¥${lo}` : `¥${lo} - ¥${hi}`
  }
  if (/纯置换/.test(info)) return '纯置换'
  if (feeMode) return feeMode
  return budget || '面议'
}

function parseLevelText(info, platform) {
  const level = pickLineValue(info, '带货等级')
  if (level) return level
  if (platform === '抖音' || platform === '视频号') return '不限'
  return '—'
}

function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function lightenHex(hex, mix) {
  const t = Math.min(1, Math.max(0, mix == null ? 0.9 : mix))
  const rgb = hexToRgb(hex)
  if (!rgb) return '#FEF2F2'
  const r = Math.round(rgb.r + (255 - rgb.r) * t)
  const g = Math.round(rgb.g + (255 - rgb.g) * t)
  const b = Math.round(rgb.b + (255 - rgb.b) * t)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function platformAccent(platform) {
  return PLATFORM_ACCENTS[platform] || '#E63946'
}

function extractPosterFieldsFromOrder(order) {
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
    prRecruitQr.resolveOrderPublisherDisplayName(order) ||
    String(order.customerName || '').trim() ||
    '灵祺星选'
  const title = String(order.title || '').trim() || `${inviterName}·达人招募`
  return {
    orderId: String(order.id || '').trim(),
    title,
    inviterName,
    platform,
    feeTypeText,
    levelText,
    fansText,
    cityText,
    rows: [
      { label: '招募平台', value: platform },
      { label: '费用类型', value: feeTypeText },
      { label: '等级要求', value: levelText },
      { label: '粉丝要求', value: fansText },
      { label: '需求城市', value: cityText },
    ],
  }
}

function extractCategoryTags(order) {
  const meta = order && order.mpPublishMeta && typeof order.mpPublishMeta === 'object' ? order.mpPublishMeta : {}
  const fromMeta = Array.isArray(meta.talentTags)
    ? meta.talentTags.map((t) => String(t || '').trim()).filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.slice(0, 3)
  const info = String(order.recruitmentInfo || order.taskDetail || order.merchantRequirements || '')
  const m = info.match(/需求(?:品类|达人)标签[:：]\s*([^\n；;]+)/)
  if (m && m[1]) {
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

function extractOrderTypeLabel(order) {
  if (hallOrderIcon.isIceMpOrder(order)) return 'AI云剪'
  const target = recruitTarget.recruitTargetFromMp(order)
  const badgeKey = hallOrderIcon.resolveHallBadgeKey(order)
  if (badgeKey && hallOrderIcon.HALL_BADGE_ICONS[badgeKey]) {
    const base = recruitTarget.recruitTargetLabel(target)
    const sub = hallOrderIcon.HALL_BADGE_ICONS[badgeKey].text
    if (base === '拍摄' || base === '剪辑') return `${base}·${sub}`
  }
  return recruitTarget.recruitTargetLabel(target)
}

function extractPosterTagsFromOrder(order) {
  const fields = extractPosterFieldsFromOrder(order)
  const platformNorm = hallFilters.normalizeHallPlatform(fields.platform)
  const categoryTags = extractCategoryTags(order)
  const orderTypeLabel = extractOrderTypeLabel(order)
  return {
    platformIcon: hallFilters.platformIcon(platformNorm),
    platformLabel: platformNorm,
    categoryTags,
    orderTypeLabel,
    chipLabels: [orderTypeLabel].concat(categoryTags).filter(Boolean).slice(0, 4),
  }
}

function buildHeroTitle(fields, tags) {
  const platform = fields.platform && fields.platform !== '不限' ? fields.platform : ''
  const typeLabel = (tags && tags.orderTypeLabel) || '达人'
  if (platform) return `${platform}\n${typeLabel}招募`
  return `${typeLabel}招募`
}

function buildDefaultFooterPanel(fields, tags) {
  const highlights = []
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
  const category = tags && tags.categoryTags && tags.categoryTags[0]
  if (category && highlights.length < 3) highlights.push(category)

  const platform = fields.platform && fields.platform !== '不限' ? fields.platform : ''
  const typeLabel = (tags && tags.orderTypeLabel) || '达人'
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

function normalizeFooterPanel(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback
  const sloganRaw = typeof raw.slogan === 'string' ? raw.slogan.trim().slice(0, 18) : ''
  const highlightsRaw = Array.isArray(raw.highlights)
    ? raw.highlights.map((h) => String(h || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return {
    slogan: sloganRaw || fallback.slogan,
    highlights: highlightsRaw.length ? highlightsRaw : fallback.highlights,
  }
}

function resolvePosterDesign(order, styleIndex) {
  const fields = extractPosterFieldsFromOrder(order)
  const tags = extractPosterTagsFromOrder(order)
  const styleIdx = posterTemplates.normalizePosterStyleIndex(styleIndex)
  const template = posterTemplates.getPosterTemplateByIndex(styleIdx)
  const accent = platformAccent(fields.platform)
  return {
    templateId: template.id,
    template,
    styleIndex: styleIdx,
    styleLabel: template.label,
    accentColor: accent,
    accentLight: lightenHex(accent, 0.92),
    heroTitle: buildHeroTitle(fields, tags),
    heroSubtitle: '',
    inviterSuffix: '邀请你报名通告!',
    tags,
    footerPanel: buildDefaultFooterPanel(fields, tags),
  }
}

function defaultPosterDesign(order, fields) {
  return resolvePosterDesign(order, 0)
}

function mergePosterDesign(ai, fallback) {
  if (!ai || typeof ai !== 'object') return fallback
  function pick(k) {
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
    footerPanel: normalizeFooterPanel(ai.footerPanel, fallback.footerPanel),
  }
}

function buildPosterInput(order, qrUrl) {
  return Object.assign({}, extractPosterFieldsFromOrder(order), { qrUrl: String(qrUrl || '').trim() })
}

module.exports = {
  extractPosterFieldsFromOrder,
  extractPosterTagsFromOrder,
  resolvePosterDesign,
  defaultPosterDesign,
  buildDefaultFooterPanel,
  mergePosterDesign,
  buildPosterInput,
  platformAccent,
  lightenHex,
}

/** 招募单分享海报：字段抽取 + 默认模版（与 Web 版 recruitmentSharePosterCore 对齐） */
const prRecruitQr = require('./prRecruitQr.js')

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

function defaultPosterDesign(order, fields) {
  const platform = (fields && fields.platform) || '不限'
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
  }
}

function buildPosterInput(order, qrUrl) {
  return Object.assign({}, extractPosterFieldsFromOrder(order), { qrUrl: String(qrUrl || '').trim() })
}

module.exports = {
  extractPosterFieldsFromOrder,
  defaultPosterDesign,
  mergePosterDesign,
  buildPosterInput,
  platformAccent,
  lightenHex,
}

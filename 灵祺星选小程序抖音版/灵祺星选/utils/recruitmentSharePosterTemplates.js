/**
 * 招募分享海报固定模版（AI 设计风格预置，运行时本地渲染，不逐张调 AI）
 * 大图背景走 CDN/OSS：bash scripts/ecs-sync-mp-recruit-covers-static.sh + upload-mp-recruit-poster-bg-oss.js
 */
const posterAssets = require('./recruitPosterAssets.js')

/** @typedef {{ id: string, label: string, backgroundFile: string, qrFrameFile: string, bgGradient: string[], decor: string, qrRingColor: string, qrCenterColor: string, qrFgColor: string, qrBgColor: string, outerBg: string }} PosterTemplateDef */

/** @type {PosterTemplateDef[]} */
const POSTER_TEMPLATE_DEFS = [
  {
    id: 'sunset-v1',
    label: '暮光橙·本地美食·AI',
    backgroundFile: 'style-sunset-v1.png',
    qrFrameFile: 'qr-frame-sunset-v1.png',
    bgGradient: ['#F97316', '#FB7185', '#FDA4AF'],
    decor: 'streak',
    qrRingColor: '#EA580C',
    qrCenterColor: '#F97316',
    qrFgColor: '#431407',
    qrBgColor: '#FFF7ED',
    outerBg: '#FFF7ED',
  },
  {
    id: 'aurora-v1',
    label: '极光紫·本地生活·AI',
    backgroundFile: 'style-aurora-v1.png',
    qrFrameFile: 'qr-frame-aurora-v1.png',
    bgGradient: ['#6366F1', '#8B5CF6', '#C084FC'],
    decor: 'blobs',
    qrRingColor: '#6366F1',
    qrCenterColor: '#7C3AED',
    qrFgColor: '#312E81',
    qrBgColor: '#EEF2FF',
    outerBg: '#EEF2FF',
  },
  {
    id: 'mint-v1',
    label: '清新绿·探店拍摄·AI',
    backgroundFile: 'style-mint-v1.png',
    qrFrameFile: 'qr-frame-mint-v1.png',
    bgGradient: ['#059669', '#14B8A6', '#22D3EE'],
    decor: 'dots',
    qrRingColor: '#0D9488',
    qrCenterColor: '#14B8A6',
    qrFgColor: '#064E3B',
    qrBgColor: '#ECFDF5',
    outerBg: '#ECFDF5',
  },
  {
    id: 'night-v1',
    label: '星空蓝·云剪辑·AI',
    backgroundFile: 'style-night-v1.png',
    qrFrameFile: 'qr-frame-night-v1.png',
    bgGradient: ['#0F172A', '#1E3A8A', '#4338CA'],
    decor: 'stars',
    qrRingColor: '#6366F1',
    qrCenterColor: '#818CF8',
    qrFgColor: '#1E1B4B',
    qrBgColor: '#E0E7FF',
    outerBg: '#E2E8F0',
  },
  {
    id: 'rose-v1',
    label: '绯红韵·本地达人·AI',
    backgroundFile: 'style-rose-v1.png',
    qrFrameFile: 'qr-frame-rose-v1.png',
    bgGradient: ['#FE2C55', '#FB7185', '#FECDD3'],
    decor: 'blobs',
    qrRingColor: '#E11D48',
    qrCenterColor: '#FE2C55',
    qrFgColor: '#881337',
    qrBgColor: '#FFF1F2',
    outerBg: '#FFF1F2',
  },
  {
    id: 'gold-v1',
    label: '金辉宴·美食探店·AI',
    backgroundFile: 'style-gold-v1.png',
    qrFrameFile: 'qr-frame-gold-v1.png',
    bgGradient: ['#D97706', '#F59E0B', '#FDE68A'],
    decor: 'streak',
    qrRingColor: '#B45309',
    qrCenterColor: '#D97706',
    qrFgColor: '#78350F',
    qrBgColor: '#FFFBEB',
    outerBg: '#FFFBEB',
  },
]

function resolveTemplateUrls(def) {
  if (!def) return def
  return {
    ...def,
    backgroundUrl: posterAssets.posterAssetUrl(def.backgroundFile),
    qrFrameUrl: posterAssets.posterAssetUrl(def.qrFrameFile),
  }
}

function getPosterTemplateCount() {
  return POSTER_TEMPLATE_DEFS.length
}

function normalizePosterStyleIndex(index) {
  const n = POSTER_TEMPLATE_DEFS.length
  if (!n) return 0
  if (!Number.isFinite(index)) return 0
  return ((Math.floor(index) % n) + n) % n
}

function getPosterTemplateByIndex(index) {
  return resolveTemplateUrls(
    POSTER_TEMPLATE_DEFS[normalizePosterStyleIndex(index)] || POSTER_TEMPLATE_DEFS[0],
  )
}

function getPosterTemplateById(id) {
  const key = String(id || '').trim()
  const hit = POSTER_TEMPLATE_DEFS.find((t) => t.id === key) || POSTER_TEMPLATE_DEFS[0]
  return resolveTemplateUrls(hit)
}

module.exports = {
  POSTER_TEMPLATES: POSTER_TEMPLATE_DEFS.map(resolveTemplateUrls),
  getPosterTemplateCount,
  normalizePosterStyleIndex,
  getPosterTemplateByIndex,
  getPosterTemplateById,
}

/**
 * 招募分享海报固定模版（AI 设计风格预置，运行时本地渲染，不逐张调 AI）
 * 大图背景走 OSS：bash scripts/upload-mp-recruit-poster-bg-oss.js
 */
const recruitCoverOssBase = require('./recruitCoverOssBase.js')

const POSTER_OSS_BASE = `${String(recruitCoverOssBase || '').replace(/\/$/, '')}/posters`

/** @typedef {{ id: string, label: string, backgroundUrl: string, bgGradient: string[], decor: string, qrRingColor: string, qrCenterColor: string, outerBg: string }} PosterTemplate */

/** @type {PosterTemplate[]} */
const POSTER_TEMPLATES = [
  {
    id: 'aurora-v1',
    label: '极光紫',
    backgroundUrl: `${POSTER_OSS_BASE}/style-aurora-v1.webp`,
    bgGradient: ['#6366F1', '#8B5CF6', '#C084FC'],
    decor: 'blobs',
    qrRingColor: '#6366F1',
    qrCenterColor: '#7C3AED',
    outerBg: '#EEF2FF',
  },
  {
    id: 'sunset-v1',
    label: '暮光橙',
    backgroundUrl: `${POSTER_OSS_BASE}/style-sunset-v1.webp`,
    bgGradient: ['#F97316', '#FB7185', '#FDA4AF'],
    decor: 'streak',
    qrRingColor: '#EA580C',
    qrCenterColor: '#F97316',
    outerBg: '#FFF7ED',
  },
  {
    id: 'mint-v1',
    label: '清新绿',
    backgroundUrl: `${POSTER_OSS_BASE}/style-mint-v1.webp`,
    bgGradient: ['#059669', '#14B8A6', '#22D3EE'],
    decor: 'dots',
    qrRingColor: '#0D9488',
    qrCenterColor: '#14B8A6',
    outerBg: '#ECFDF5',
  },
  {
    id: 'night-v1',
    label: '星空蓝',
    backgroundUrl: `${POSTER_OSS_BASE}/style-night-v1.webp`,
    bgGradient: ['#0F172A', '#1E3A8A', '#4338CA'],
    decor: 'stars',
    qrRingColor: '#6366F1',
    qrCenterColor: '#818CF8',
    outerBg: '#E2E8F0',
  },
]

function getPosterTemplateCount() {
  return POSTER_TEMPLATES.length
}

function normalizePosterStyleIndex(index) {
  const n = POSTER_TEMPLATES.length
  if (!n) return 0
  const i = Number(index)
  if (!Number.isFinite(i)) return 0
  return ((Math.floor(i) % n) + n) % n
}

function getPosterTemplateByIndex(index) {
  return POSTER_TEMPLATES[normalizePosterStyleIndex(index)] || POSTER_TEMPLATES[0]
}

function getPosterTemplateById(id) {
  const key = String(id || '').trim()
  return POSTER_TEMPLATES.find((t) => t.id === key) || POSTER_TEMPLATES[0]
}

module.exports = {
  POSTER_TEMPLATES,
  POSTER_OSS_BASE,
  getPosterTemplateCount,
  normalizePosterStyleIndex,
  getPosterTemplateByIndex,
  getPosterTemplateById,
}

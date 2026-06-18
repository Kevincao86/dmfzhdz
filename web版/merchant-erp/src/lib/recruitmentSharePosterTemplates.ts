/**
 * 招募分享海报固定模版（AI 设计风格预置，运行时本地渲染）
 * OSS 背景：mp-recruit-covers/posters/
 */
const POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'

export type PosterTemplate = {
  id: string
  label: string
  backgroundUrl: string
  qrFrameUrl: string
  bgGradient: [string, string, string]
  decor: 'blobs' | 'streak' | 'dots' | 'stars'
  qrRingColor: string
  qrCenterColor: string
  qrFgColor: string
  qrBgColor: string
  outerBg: string
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'sunset-v1',
    label: '暮光橙·本地美食·AI',
    backgroundUrl: `${POSTER_OSS_BASE}/style-sunset-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-sunset-v1.png`,
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
    backgroundUrl: `${POSTER_OSS_BASE}/style-aurora-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-aurora-v1.png`,
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
    backgroundUrl: `${POSTER_OSS_BASE}/style-mint-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-mint-v1.png`,
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
    backgroundUrl: `${POSTER_OSS_BASE}/style-night-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-night-v1.png`,
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
    backgroundUrl: `${POSTER_OSS_BASE}/style-rose-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-rose-v1.png`,
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
    backgroundUrl: `${POSTER_OSS_BASE}/style-gold-v1.png`,
    qrFrameUrl: `${POSTER_OSS_BASE}/qr-frame-gold-v1.png`,
    bgGradient: ['#D97706', '#F59E0B', '#FDE68A'],
    decor: 'streak',
    qrRingColor: '#B45309',
    qrCenterColor: '#D97706',
    qrFgColor: '#78350F',
    qrBgColor: '#FFFBEB',
    outerBg: '#FFFBEB',
  },
]

export function getPosterTemplateCount(): number {
  return POSTER_TEMPLATES.length
}

export function normalizePosterStyleIndex(index: number): number {
  const n = POSTER_TEMPLATES.length
  if (!n) return 0
  if (!Number.isFinite(index)) return 0
  return ((Math.floor(index) % n) + n) % n
}

export function getPosterTemplateByIndex(index: number): PosterTemplate {
  return POSTER_TEMPLATES[normalizePosterStyleIndex(index)] || POSTER_TEMPLATES[0]
}

export function getPosterTemplateById(id: string): PosterTemplate {
  const key = String(id || '').trim()
  return POSTER_TEMPLATES.find((t) => t.id === key) || POSTER_TEMPLATES[0]
}

/**
 * 招募分享海报固定模版（与小程序 recruitmentSharePosterTemplates 对齐）
 */
export type PosterTemplate = {
  id: string
  label: string
  backgroundUrl: string
  bgGradient: [string, string, string]
  decor: 'blobs' | 'streak' | 'dots' | 'stars'
  qrRingColor: string
  qrCenterColor: string
  outerBg: string
}

const POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'

export const POSTER_TEMPLATES: PosterTemplate[] = [
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

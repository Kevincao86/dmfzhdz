#!/usr/bin/env node
/**
 * 从 generate-mp-recruit-poster-styles.ts 的 STYLES 定义同步三端模版文件。
 * 运行：node scripts/sync-mp-recruit-poster-templates.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'

const STYLES = [
  {
    id: 'sunset-v1',
    label: '暮光橙·美食达人',
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
    label: '极光紫·生活记录',
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
    label: '清新绿·探店拍摄',
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
    label: '星空蓝·云剪辑',
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
    label: '绯红韵·小红书达人',
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
    label: '金辉宴·美食探店',
    bgGradient: ['#D97706', '#F59E0B', '#FDE68A'],
    decor: 'streak',
    qrRingColor: '#B45309',
    qrCenterColor: '#D97706',
    qrFgColor: '#78350F',
    qrBgColor: '#FFFBEB',
    outerBg: '#FFFBEB',
  },
]

function tplEntry(s) {
  return `  {
    id: '${s.id}',
    label: '${s.label}',
    backgroundUrl: \`\${POSTER_OSS_BASE}/style-${s.id}.png\`,
    qrFrameUrl: \`\${POSTER_OSS_BASE}/qr-frame-${s.id}.png\`,
    bgGradient: ['${s.bgGradient.join("', '")}'],
    decor: '${s.decor}',
    qrRingColor: '${s.qrRingColor}',
    qrCenterColor: '${s.qrCenterColor}',
    qrFgColor: '${s.qrFgColor}',
    qrBgColor: '${s.qrBgColor}',
    outerBg: '${s.outerBg}',
  }`
}

function writeMpJs() {
  const body = STYLES.map(tplEntry).join(',\n')
  const content = `/**
 * 招募分享海报固定模版（AI 设计风格预置，运行时本地渲染，不逐张调 AI）
 * 大图背景走 OSS：bash scripts/upload-mp-recruit-poster-bg-oss.js
 */
const recruitCoverOssBase = require('./recruitCoverOssBase.js')

const POSTER_OSS_BASE = \`\${String(recruitCoverOssBase || '').replace(/\\/$/, '')}/posters\`

/** @typedef {{ id: string, label: string, backgroundUrl: string, qrFrameUrl: string, bgGradient: string[], decor: string, qrRingColor: string, qrCenterColor: string, qrFgColor: string, qrBgColor: string, outerBg: string }} PosterTemplate */

/** @type {PosterTemplate[]} */
const POSTER_TEMPLATES = [
${body},
]

function getPosterTemplateCount() {
  return POSTER_TEMPLATES.length
}

function normalizePosterStyleIndex(index) {
  const n = POSTER_TEMPLATES.length
  if (!n) return 0
  if (!Number.isFinite(index)) return 0
  return ((Math.floor(index) % n) + n) % n
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
  getPosterTemplateCount,
  normalizePosterStyleIndex,
  getPosterTemplateByIndex,
  getPosterTemplateById,
}
`
  fs.writeFileSync(
    path.join(ROOT, '灵祺达人撮合小程序/utils/recruitmentSharePosterTemplates.js'),
    content,
  )
}

function writeWebTs() {
  const body = STYLES.map(tplEntry).join(',\n')
  const content = `/**
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
${body},
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
`
  fs.writeFileSync(
    path.join(ROOT, 'web版/merchant-erp/src/lib/recruitmentSharePosterTemplates.ts'),
    content,
  )
  fs.writeFileSync(
    path.join(ROOT, '灵祺达人履约管理后台/src/lib/mpSync/recruitmentSharePosterTemplates.ts'),
    content.replace(
      "const POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'",
      "/**\n * 招募分享海报固定模版（与小程序 recruitmentSharePosterTemplates 对齐）\n */\nconst POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'",
    ).replace(
      'export type PosterTemplate',
      'export type PosterTemplate',
    ),
  )
}

writeMpJs()
writeWebTs()
console.log(`已同步 ${STYLES.length} 套海报模版 → 小程序 / Web / 履约后台`)

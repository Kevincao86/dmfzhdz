#!/usr/bin/env node
/** 从 mpMembershipCatalog.ts 同步小程序内置矩阵（只读展示） */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'web版/merchant-erp/src/lib/mpMembershipCatalog.ts')
const src = fs.readFileSync(catalogPath, 'utf8')

function extractMatrixBlock() {
  const start = src.indexOf('const MATRIX:')
  const end = src.indexOf('\nexport const MP_PERMISSION_DEFS')
  if (start < 0 || end < 0) throw new Error('MATRIX block not found')
  let block = src.slice(start, end).trim()
  block = block.replace(/^const MATRIX:[\s\S]*?=\s*/, 'const MATRIX = ')
  block = block.replace(/: TierCell/g, '')
  return block
}

function extractPermissionDefs() {
  const start = src.indexOf('export const MP_PERMISSION_DEFS')
  const end = src.indexOf('\nexport type MpFeatureAccessPatch')
  if (start < 0 || end < 0) throw new Error('MP_PERMISSION_DEFS block not found')
  let block = src.slice(start, end).trim()
  block = block.replace(/^export const MP_PERMISSION_DEFS[^=]+=/, 'const PERMISSION_DEFS =')
  return block
}

const matrixJs = extractMatrixBlock()
const defsJs = extractPermissionDefs()

const economicsHelpers = `const MP_POINTS_VIDEO_PER_MIN = 120
const MP_POINTS_ARTICLE_PER_USE = 2
const MP_POINT_INTERNAL_COST_YUAN = 0.01
const MP_POINT_PROFIT_MARGIN = 0.5
const MP_BASIC_GIFT_POINTS = 100

function roundGiftPointsCalculated(raw) {
  const n = Math.max(0, Math.floor(Number(raw) || 0))
  if (n <= 0) return MP_BASIC_GIFT_POINTS
  if (n < 500) return n
  return Math.round(n / 1000) * 1000
}

function computeGiftPointsForMonthlyPrice(priceYuan) {
  const price = Number(priceYuan)
  if (!Number.isFinite(price) || price <= 0) return MP_BASIC_GIFT_POINTS
  const budget = price * MP_POINT_PROFIT_MARGIN
  return Math.max(MP_BASIC_GIFT_POINTS, Math.floor(budget / MP_POINT_INTERNAL_COST_YUAN))
}

function computeGiftPointsForMonthlyPriceRounded(priceYuan) {
  return roundGiftPointsCalculated(computeGiftPointsForMonthlyPrice(priceYuan))
}

const GIFT_MONTHLY_PRICE = {
  pr: { basic: 0, pro: 59.9, flagship: 159, enterprise: 399 },
  talent: { basic: 0, pro: 19.9, flagship: 59.9, enterprise: 399 },
  shoot: { basic: 0, pro: 69, flagship: 199, enterprise: 249 },
  edit: { basic: 0, pro: 79, flagship: 229, enterprise: 279 },
}

function buildRoleGiftPoints(role) {
  const tiers = ['basic', 'pro', 'flagship', 'enterprise']
  const out = {}
  for (const tier of tiers) {
    out[tier] = computeGiftPointsForMonthlyPriceRounded(GIFT_MONTHLY_PRICE[role][tier])
  }
  return out
}

const MP_DEFAULT_GIFT_POINTS = {
  pr: buildRoleGiftPoints('pr'),
  talent: buildRoleGiftPoints('talent'),
  shoot: buildRoleGiftPoints('shoot'),
  edit: buildRoleGiftPoints('edit'),
}

function videoMinutesFromGiftPoints(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  if (p <= 0) return 0
  return Math.max(1, Math.floor(p / MP_POINTS_VIDEO_PER_MIN))
}

function articleUsesFromGiftPoints(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return Math.max(0, Math.floor(p / MP_POINTS_ARTICLE_PER_USE))
}

function matrixAiQuotas(role, tier) {
  const pts = MP_DEFAULT_GIFT_POINTS[role][tier]
  if (tier === 'basic') return { video: 1, copy: 1 }
  return {
    video: videoMinutesFromGiftPoints(pts),
    copy: articleUsesFromGiftPoints(pts),
  }
}
`

const matrixFile = `/** AUTO-GENERATED — 勿手改。运行: node scripts/sync-mp-membership-builtin-js.mjs */
function b(v) { return v }
function q(n) { return n }
function dash() { return '—' }

${economicsHelpers}

${matrixJs}

function mergePlanPermissions(role, planId, storedPermissions) {
  const tier = String(planId || 'basic').trim().toLowerCase()
  const normalized =
    tier === 'pro' || tier === 'professional'
      ? 'pro'
      : tier === 'flagship' || tier === 'ultimate'
        ? 'flagship'
        : tier === 'enterprise' || tier === 'corp'
          ? 'enterprise'
          : 'basic'
  const base = (MATRIX[role] && MATRIX[role][normalized]) || {}
  return { ...base, ...(storedPermissions || {}) }
}

module.exports = { MATRIX, mergePlanPermissions }
`

const featuresFile = `/** AUTO-GENERATED — 勿手改。运行: node scripts/sync-mp-membership-builtin-js.mjs */
const { mergePlanPermissions } = require('./mpMembershipMatrixBuiltin.js')

${defsJs}

function listPermissionDefs(role) {
  return PERMISSION_DEFS[role] || []
}

function formatQuotaLabel(def, cell) {
  if (cell === '—' || cell === '-' || cell == null) return '未开通'
  if (def.kind === 'boolean') return cell === true ? '已开通' : '未开通'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return '未开通'
    if (n >= 9999) return '不限'
    const unit =
      def.quotaUnit === 'minutes' ? ' 分钟/月' : def.quotaUnit === 'points' ? ' 积分/月' : ' 次/月'
    return n + unit
  }
  return String(cell)
}

module.exports = {
  PERMISSION_DEFS,
  listPermissionDefs,
  mergePlanPermissions,
  formatQuotaLabel,
}
`

const targets = [
  '灵祺达人撮合小程序/utils',
  '灵祺星选小程序抖音版/灵祺星选/utils',
]

for (const rel of targets) {
  const dir = path.join(root, rel)
  fs.writeFileSync(path.join(dir, 'mpMembershipMatrixBuiltin.js'), matrixFile)
  fs.writeFileSync(path.join(dir, 'mpMembershipFeaturesMp.js'), featuresFile)
  console.log('OK:', rel)
}

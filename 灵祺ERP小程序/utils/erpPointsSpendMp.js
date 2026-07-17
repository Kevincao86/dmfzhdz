/**
 * ERP 租户积分校验/扣减（与 web tenantBillingClient + mpAddonPointsSpendClient 同源 API）
 */
const billing = require('./tenantBillingApiMp.js')
const economics = require('./mpPointsEconomicsMp.js')

function readBalance(summaryOrResult) {
  const r = summaryOrResult || {}
  if (r.balance != null) return Math.max(0, Math.floor(Number(r.balance) || 0))
  if (r.totalPoints != null) return Math.max(0, Math.floor(Number(r.totalPoints) || 0))
  const pkg = Math.max(0, Math.floor(Number(r.packageBalance ?? r.packagePoints) || 0))
  const rec = Math.max(0, Math.floor(Number(r.rechargeBalance ?? r.rechargePoints) || 0))
  return pkg + rec
}

function checkAddonPointsAffordable(kind, durationSec, extra) {
  const flatKinds = new Set(['visual_studio_copy', 'visual_studio_image', 'mix_material_analyze'])
  const sec = flatKinds.has(kind) ? undefined : Math.max(1, Math.ceil(Number(durationSec) || 1))
  const count = extra && extra.count != null ? Number(extra.count) : 1
  const required = economics.mpPointsCostForUsage(kind, {
    durationSec: sec || 1,
    count,
  })
  const payload = { kind }
  if (sec != null) payload.durationSec = sec
  return billing
    .checkErpPointsAffordable(payload)
    .then((r) => {
      const balance = readBalance(r)
      if (balance < required) {
        return {
          ok: false,
          message: economics.insufficientMessage(kind, required, balance),
          balance,
          required,
        }
      }
      return { ok: true, balance, required }
    })
    .catch((e) => ({
      ok: false,
      message: e && e.message ? e.message : '积分校验失败',
    }))
}

function spendAddonPoints(opts) {
  const flatKinds = new Set(['visual_studio_copy', 'visual_studio_image', 'mix_material_analyze'])
  const kind = opts.kind
  const sec = flatKinds.has(kind)
    ? undefined
    : Math.max(1, Math.ceil(Number(opts.durationSec) || 1))
  const payload = {
    kind,
    idempotencyKey: opts.idempotencyKey,
    note: opts.note,
  }
  if (sec != null) payload.durationSec = sec
  return billing.spendErpPointsForUsage(payload).then((r) => ({
    pointsCharged: Math.max(0, Math.floor(Number(r.pointsCharged) || 0)),
    balance: readBalance(r),
    already: r.already === true,
  }))
}

async function assertVisualStudioCopyAffordable() {
  const r = await checkAddonPointsAffordable('visual_studio_copy')
  if (!r.ok) {
    const err = new Error(r.message || '积分不足')
    err.code = 'points_insufficient'
    throw err
  }
  return r
}

async function spendVisualStudioCopyPoints(opts) {
  return spendAddonPoints({
    kind: 'visual_studio_copy',
    idempotencyKey: opts && opts.idempotencyKey,
    note: (opts && opts.note) || '视觉工坊文案包',
  })
}

async function assertVisualStudioImageAffordable(count) {
  const r = await checkAddonPointsAffordable('visual_studio_image', 1, { count: count || 1 })
  if (!r.ok) {
    const err = new Error(r.message || '积分不足')
    err.code = 'points_insufficient'
    throw err
  }
  return r
}

async function spendVisualStudioImagePoints(opts) {
  return spendAddonPoints({
    kind: 'visual_studio_image',
    idempotencyKey: opts && opts.idempotencyKey,
    note: (opts && opts.note) || '视觉工坊生图',
  })
}

function affordActionFromError(e) {
  const msg = String((e && e.message) || e || '')
  if (/积分不足|points_insufficient|余额不足/i.test(msg) || (e && e.code === 'points_insufficient')) {
    return 'recharge'
  }
  return ''
}

function fetchPointsBalance() {
  return billing.fetchTenantBillingSummary().then((s) => readBalance(s))
}

module.exports = {
  checkAddonPointsAffordable,
  spendAddonPoints,
  fetchPointsBalance,
  assertVisualStudioCopyAffordable,
  spendVisualStudioCopyPoints,
  assertVisualStudioImageAffordable,
  spendVisualStudioImagePoints,
  affordActionFromError,
  VISUAL_STUDIO_COPY_POINTS: economics.MP_POINTS_VISUAL_STUDIO_COPY_PER_USE,
  VISUAL_STUDIO_IMAGE_POINTS: economics.MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE,
}

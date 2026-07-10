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

function checkAddonPointsAffordable(kind, durationSec) {
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const required = economics.mpPointsCostForUsage(kind, { durationSec: sec })
  return billing
    .checkErpPointsAffordable({ kind, durationSec: sec })
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
  const sec = Math.max(1, Math.ceil(Number(opts.durationSec) || 1))
  return billing
    .spendErpPointsForUsage({
      kind: opts.kind,
      durationSec: sec,
      idempotencyKey: opts.idempotencyKey,
      note: opts.note,
    })
    .then((r) => ({
      pointsCharged: Math.max(0, Math.floor(Number(r.pointsCharged) || 0)),
      balance: readBalance(r),
      already: r.already === true,
    }))
}

function fetchPointsBalance() {
  return billing.fetchTenantBillingSummary().then((s) => readBalance(s))
}

module.exports = {
  checkAddonPointsAffordable,
  spendAddonPoints,
  fetchPointsBalance,
}

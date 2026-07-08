/**
 * 与 web tenantBillingClient.ts 同源：POST {MERCHANT_API_BASE_URL}/erp-api/meoo-tenant-billing
 */
const config = require('./config.js')
const api = require('./api.js')
const fmt = require('./formatDisplayErrorMp.js')

function billingUrl() {
  const base = String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) {
    throw new Error('尚未配置商家后台 API 地址，请在 config.local.js 设置 MERCHANT_API_BASE_URL。')
  }
  return `${base}/erp-api/meoo-tenant-billing`
}

function billingFetchOnce(body) {
  const token = api.getAccessToken()
  if (!token) return Promise.reject(new Error('请先登录'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: billingUrl(),
      method: 'POST',
      timeout: 30000,
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: body,
      success(res) {
        const json = res.data && typeof res.data === 'object' ? res.data : {}
        if (res.statusCode >= 200 && res.statusCode < 300 && json.ok !== false) {
          resolve(json)
          return
        }
        const err = new Error(
          fmt.billingApiErrorMessage(json, res.statusText || '', res.statusCode || 0),
        )
        err.status = res.statusCode
        reject(err)
      },
      fail(err) {
        const em =
          err && typeof err.errMsg === 'string'
            ? err.errMsg
            : err && typeof err.message === 'string'
              ? err.message
              : '网络异常'
        reject(new Error(em))
      },
    })
  })
}

function billingFetch(body) {
  return billingFetchOnce(body).catch((e) => {
    const status = e && e.status ? Number(e.status) : 0
    if (status === 502 || status === 504) {
      return new Promise((r) => setTimeout(r, 800)).then(() => billingFetchOnce(body))
    }
    throw e
  })
}

function fetchTenantBillingSummary() {
  return billingFetch({ action: 'billing_summary' }).then((r) => r.summary)
}

function fetchTenantMyOrders() {
  return billingFetch({ action: 'my_orders' }).then((r) =>
    Array.isArray(r.orders) ? r.orders : [],
  )
}

function fetchTenantPointsLedger() {
  return billingFetch({ action: 'points_ledger' }).then((r) =>
    Array.isArray(r.ledger) ? r.ledger : [],
  )
}

function tenantPayPrepay(input) {
  const payload = {
    action: 'pay_prepay',
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    channel: input.channel,
  }
  if (input.clientNote) payload.clientNote = input.clientNote
  if (input.payMode) payload.payMode = input.payMode
  if (input.openid) payload.openid = input.openid
  if (input.code) payload.code = input.code
  if (input.stableDevOpenId) payload.stableDevOpenId = input.stableDevOpenId
  return billingFetch(payload)
}

function tenantWalletPay(input) {
  return billingFetch({
    action: 'wallet_pay',
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    clientNote: input.clientNote || undefined,
  })
}

function tenantPayPoll(outTradeNo) {
  return billingFetch({ action: 'pay_poll', outTradeNo: String(outTradeNo || '').trim() })
}

module.exports = {
  billingUrl,
  fetchTenantBillingSummary,
  fetchTenantMyOrders,
  fetchTenantPointsLedger,
  tenantPayPrepay,
  tenantWalletPay,
  tenantPayPoll,
}

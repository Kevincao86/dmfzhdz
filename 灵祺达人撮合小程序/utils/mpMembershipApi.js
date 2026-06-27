const ecs = require('./ecs.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')
const mpWechatOpenId = require('./mpWechatOpenId.js')

function authHeaders() {
  return auth.authHeaders()
}

async function postAuthAction(body) {
  const token = auth.readSessionToken()
  const data = await ecs.post(
    '/api/meoo-ops-mp-auth',
    {
      ...body,
      sessionToken: token,
      token,
    },
    authHeaders(),
  )
  if (!data || data.ok === false) {
    throw new Error(String((data && data.error) || 'request_failed'))
  }
  return data
}

async function fetchMembershipPlanVersions(role) {
  try {
    const data = await ecs.get(
      `/api/meoo-ops-mp-membership-plan-versions?role=${encodeURIComponent(role)}`,
      authHeaders(),
    )
    if (!data || data.ok === false) {
      throw new Error(String((data && data.error) || 'load_plans_failed'))
    }
    return Array.isArray(data.versions) ? data.versions : []
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '加载会员方案失败'))
  }
}

async function createWechatJsapiPrepay(body) {
  const accountMemberSync = require('./accountMemberSync.js')
  let openid = String((body && body.openid) || '').trim()
  if (!openid) openid = mpWechatOpenId.resolveOpenIdFromLocal()

  const prepayPayload = {
    action: 'membership_wechat_prepay',
    payMode: 'jsapi',
    workRole: body.workRole,
    planId: body.planId,
    billing: body.billing,
  }
  if (openid) {
    prepayPayload.openid = openid
  } else {
    const code = await new Promise((resolve, reject) => {
      wx.login({ success: (r) => resolve(r.code || ''), fail: reject })
    })
    if (!code) throw new Error('wx_login_failed')
    prepayPayload.code = code
    prepayPayload.stableDevOpenId = accountMemberSync.ensureStableDevOpenId()
  }
  try {
    const data = await postAuthAction(prepayPayload)
    const jsapiParams = data.jsapiParams
    const outTradeNo = String(data.outTradeNo || '').trim()
    if (!jsapiParams || !outTradeNo) throw new Error('wechat_prepay_invalid_response')
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      jsapiParams,
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '微信下单失败，请稍后重试'))
  }
}

async function pollMembershipWechatPay(outTradeNo) {
  try {
    const data = await postAuthAction({
      action: 'membership_wechat_poll',
      outTradeNo: String(outTradeNo || '').trim(),
    })
    return {
      status: data.status === 'paid' ? 'paid' : 'pending',
      requestId: data.requestId ? String(data.requestId) : '',
      message: String(
        data.message ||
          (data.status === 'paid'
            ? '支付成功，会员档位已开通，约 20 秒内与电脑端同步。'
            : '等待支付完成…'),
      ),
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '查询支付状态失败'))
  }
}

async function pollUntilPaid(outTradeNo, opts) {
  const maxTry = (opts && opts.maxTry) || 12
  const intervalMs = (opts && opts.intervalMs) || 2000
  for (let i = 0; i < maxTry; i += 1) {
    const r = await pollMembershipWechatPay(outTradeNo)
    if (r.status === 'paid') return r
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return pollMembershipWechatPay(outTradeNo)
}

async function fetchMyPaymentOrders() {
  try {
    const data = await postAuthAction({ action: 'my_payment_orders_list' })
    return {
      membershipOrders: Array.isArray(data.membershipOrders) ? data.membershipOrders : [],
      pointsOrders: Array.isArray(data.pointsOrders) ? data.pointsOrders : [],
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '加载订单失败'))
  }
}

function requestWxPayment(jsapiParams) {
  const p = jsapiParams || {}
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(p.timeStamp || ''),
      nonceStr: String(p.nonceStr || ''),
      package: String(p.package || ''),
      signType: String(p.signType || 'RSA'),
      paySign: String(p.paySign || ''),
      success: resolve,
      fail: reject,
    })
  })
}

module.exports = {
  fetchMembershipPlanVersions,
  createWechatJsapiPrepay,
  pollMembershipWechatPay,
  pollUntilPaid,
  fetchMyPaymentOrders,
  requestWxPayment,
}

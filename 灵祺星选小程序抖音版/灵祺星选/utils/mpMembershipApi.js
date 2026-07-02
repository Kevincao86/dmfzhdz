const ecs = require('./ecs.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')
const mpWechatOpenId = require('./mpWechatOpenId.js')
const mpRuntime = require('./mpRuntime.js')

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

function normalizeJsapiParams(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const pkg = String(p.package || p.packageVal || '').trim()
  const timeStamp = String(p.timeStamp || p.timestamp || '').trim()
  const nonceStr = String(p.nonceStr || p.noncestr || '').trim()
  const signType = String(p.signType || 'RSA').trim() || 'RSA'
  const paySign = String(p.paySign || p.pay_sign || '').trim()
  if (!timeStamp || !nonceStr || !pkg || !paySign) return null
  if (!/^prepay_id=/.test(pkg)) return null
  return { timeStamp, nonceStr, package: pkg, signType, paySign }
}

function isWechatPayDevtoolsQrMode() {
  return mpRuntime.isDevtoolsEnv()
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
    const payMode = String(data.payMode || '').trim()
    if (payMode && payMode !== 'wechat_jsapi') {
      throw new Error('wechat_prepay_not_jsapi')
    }
    if (data.codeUrl && !data.jsapiParams) {
      throw new Error('wechat_prepay_native_not_supported_in_mp')
    }
    const jsapiParams = normalizeJsapiParams(data.jsapiParams)
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

async function pollMembershipDouyinPay(outTradeNo) {
  try {
    const data = await postAuthAction({
      action: 'membership_douyin_poll',
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

async function launchDouyinPay(outTradeNo) {
  try {
    const data = await postAuthAction({
      action: 'membership_douyin_launch',
      outTradeNo: String(outTradeNo || '').trim(),
    })
    const orderData = String(data.data || '').trim()
    const byteAuthorization = String(data.byteAuthorization || '').trim()
    const tradeNo = String(data.outTradeNo || outTradeNo || '').trim()
    if (!orderData || !byteAuthorization || !tradeNo) {
      throw new Error('douyin_launch_invalid_response')
    }
    return {
      requestId: String(data.requestId || ''),
      outTradeNo: tradeNo,
      data: orderData,
      byteAuthorization,
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '抖音拉起支付失败，请稍后重试'))
  }
}

async function createDouyinPrepay(body) {
  try {
    const data = await postAuthAction({
      action: 'membership_douyin_prepay',
      workRole: body.workRole,
      planId: body.planId,
      billing: body.billing,
    })
    const orderData = String(data.data || '').trim()
    const byteAuthorization = String(data.byteAuthorization || '').trim()
    const outTradeNo = String(data.outTradeNo || '').trim()
    if (!orderData || !byteAuthorization || !outTradeNo) {
      throw new Error('douyin_prepay_invalid_response')
    }
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      data: orderData,
      byteAuthorization,
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '抖音下单失败，请稍后重试'))
  }
}

function requestDouyinPayment(prepay) {
  return new Promise((resolve, reject) => {
    if (typeof tt === 'undefined' || typeof tt.requestOrder !== 'function') {
      reject(new Error('douyin_pay_unavailable'))
      return
    }
    tt.requestOrder({
      data: prepay.data,
      byteAuthorization: prepay.byteAuthorization,
      success(res) {
        const orderId = String((res && (res.orderId || res.order_id)) || '').trim()
        if (!orderId || typeof tt.getOrderPayment !== 'function') {
          resolve(res || {})
          return
        }
        tt.getOrderPayment({
          orderId,
          success: resolve,
          fail: (err) => {
            const msg = String((err && err.errMsg) || 'getOrderPayment:fail')
            if (/cancel/i.test(msg)) reject(new Error('getOrderPayment:cancel'))
            else reject(new Error(msg))
          },
        })
      },
      fail(err) {
        const msg = String((err && err.errMsg) || 'requestOrder:fail')
        if (/cancel/i.test(msg)) reject(new Error('requestOrder:cancel'))
        else reject(new Error(msg))
      },
    })
  })
}

async function pollUntilDouyinPaid(outTradeNo, opts) {
  const maxTry = (opts && opts.maxTry) || 12
  const intervalMs = (opts && opts.intervalMs) || 2000
  for (let i = 0; i < maxTry; i += 1) {
    const r = await pollMembershipDouyinPay(outTradeNo)
    if (r.status === 'paid') return r
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return pollMembershipDouyinPay(outTradeNo)
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
      usage: data.usage && typeof data.usage === 'object' ? data.usage : null,
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '加载订单失败'))
  }
}

/** 小程序 JSAPI：调起 wx.requestPayment（真机本地支付；开发者工具会弹出扫码调试） */
function requestWxPayment(jsapiParams) {
  const p = normalizeJsapiParams(jsapiParams)
  if (!p) return Promise.reject(new Error('wechat_prepay_invalid_response'))
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: p.timeStamp,
      nonceStr: p.nonceStr,
      package: p.package,
      signType: p.signType,
      paySign: p.paySign,
      success: resolve,
      fail: (err) => {
        const msg = String((err && err.errMsg) || 'requestPayment:fail')
        if (/cancel/i.test(msg)) reject(new Error('requestPayment:cancel'))
        else if (/no permission/i.test(msg)) reject(new Error('requestPayment:no_permission'))
        else reject(new Error(msg))
      },
    })
  })
}

module.exports = {
  fetchMembershipPlanVersions,
  createWechatJsapiPrepay,
  createDouyinPrepay,
  launchDouyinPay,
  pollMembershipWechatPay,
  pollMembershipDouyinPay,
  pollUntilPaid,
  pollUntilDouyinPaid,
  fetchMyPaymentOrders,
  requestWxPayment,
  requestDouyinPayment,
  isWechatPayDevtoolsQrMode,
}

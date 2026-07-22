/**
 * 小程序在线支付（与达人撮合小程序一致）：
 * - 微信：wx.requestPayment JSAPI
 * - 支付宝/抖音：扫码轮询
 */
const billing = require('./tenantBillingApiMp.js')
const wxAccount = require('./wxAccountMp.js')
const tiersUtil = require('./meooPaymentTiers.js')
const fmt = require('./formatDisplayErrorMp.js')

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

function formatCountdown(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** 小程序 JSAPI：调起 wx.requestPayment（与达人 mpMembershipApi.requestWxPayment 同形态） */
function requestWxPayment(jsapiParams) {
  const p = normalizeJsapiParams(jsapiParams)
  if (!p) return Promise.reject(new Error('微信下单参数无效，请稍后重试'))
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: p.timeStamp,
      nonceStr: p.nonceStr,
      package: p.package,
      signType: p.signType,
      paySign: p.paySign,
      success: () => resolve({ ok: true }),
      fail: (err) => {
        const msg = String((err && err.errMsg) || 'requestPayment:fail')
        if (/cancel/i.test(msg)) {
          reject(new Error('您已取消支付'))
          return
        }
        if (/no permission/i.test(msg)) {
          reject(new Error('暂无微信支付权限，请使用真机调试或联系管理员'))
          return
        }
        reject(new Error(msg))
      },
    })
  })
}

function resolvePayQrImageUrl(prepay) {
  const fromServer = String((prepay && prepay.qrCode) || '').trim()
  if (/^data:image\//i.test(fromServer) || /^https?:\/\//i.test(fromServer)) {
    return fromServer
  }
  const codeUrl = String((prepay && (prepay.codeUrl || prepay.qrCode)) || '').trim()
  if (!codeUrl) return ''
  if (/^data:image\//i.test(codeUrl) || /^https?:\/\/.*\.(png|jpg|jpeg|gif|webp)/i.test(codeUrl)) {
    return codeUrl
  }
  return (
    'https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=' +
    encodeURIComponent(codeUrl)
  )
}

function pollPayUntilDone(outTradeNo, opts) {
  const intervalMs = (opts && opts.intervalMs) || 2500
  const maxMs = (opts && opts.maxMs) || tiersUtil.TENANT_ONLINE_PAY_TTL_MS
  const started = Date.now()
  let timer = null
  let stopped = false

  const stop = () => {
    stopped = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (stopped) return
      if (Date.now() - started > maxMs) {
        stop()
        reject(new Error('支付已超时，请重新发起'))
        return
      }
      billing
        .tenantPayPoll(outTradeNo)
        .then((r) => {
          if (stopped) return
          const status = String(r.status || 'pending')
          if (status === 'paid') {
            stop()
            resolve(r)
            return
          }
          if (status === 'expired' || status === 'cancelled') {
            stop()
            reject(new Error('支付已超时或已取消，请重新发起'))
          }
        })
        .catch(() => {})
    }
    tick()
    timer = setInterval(tick, intervalMs)
  })
}

function createPayCountdown(deadlineMs, onTick, onTimeout) {
  let timer = null
  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
    if (onTick) onTick(left, formatCountdown(left))
    if (left <= 0) {
      stop()
      if (onTimeout) onTimeout()
    }
  }
  tick()
  timer = setInterval(tick, 1000)
  return { stop, tick }
}

async function fetchWxPrepayPayload() {
  const login = await wxAccount.fetchWxLoginCode()
  return {
    payMode: 'jsapi',
    code: login.code,
    stableDevOpenId: login.stableDevOpenId,
  }
}

/**
 * 发起在线支付。
 * 微信：与达人一致，JSAPI requestPayment。
 * 支付宝/抖音：返回二维码 URL 供展示并轮询。
 */
async function startOnlinePay(input) {
  const channel = input.channel
  const prepayPayload = {
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    channel,
    clientNote: input.clientNote,
  }
  if (channel === 'wechat') {
    Object.assign(prepayPayload, await fetchWxPrepayPayload())
    prepayPayload.refreshCodeOnRetry = () => fetchWxPrepayPayload()
  }
  const prepay = await billing.tenantPayPrepay(prepayPayload)
  const outTradeNo = String(prepay.outTradeNo || '').trim()
  if (!outTradeNo) throw new Error('下单失败，缺少订单号')

  if (channel === 'wechat') {
    const payMode = String(prepay.payMode || '').trim()
    if (payMode && payMode !== 'wechat_jsapi') {
      throw new Error('支付通道异常，请稍后重试')
    }
    if (prepay.codeUrl && !prepay.jsapiParams) {
      throw new Error('小程序不支持扫码支付，请更新后台后重试')
    }
    const jsapiParams = normalizeJsapiParams(prepay.jsapiParams)
    if (!jsapiParams) throw new Error('微信下单参数无效，请稍后重试')
    await requestWxPayment(jsapiParams)
    await pollPayUntilDone(outTradeNo)
    return { outTradeNo, payMode: 'wechat_jsapi' }
  }

  const qrUrl = resolvePayQrImageUrl(prepay)
  if (!qrUrl) throw new Error('未获取到支付二维码，请稍后重试')
  return {
    outTradeNo,
    payMode: prepay.payMode || channel,
    qrUrl,
    payPageUrl: prepay.payPageUrl || null,
  }
}

function formatPayError(e) {
  return fmt.formatThrowableMessage(e, '操作失败，请稍后重试')
}

module.exports = {
  TENANT_ONLINE_PAY_TTL_MS: tiersUtil.TENANT_ONLINE_PAY_TTL_MS,
  TENANT_ONLINE_PAY_TTL_SEC: tiersUtil.TENANT_ONLINE_PAY_TTL_SEC,
  normalizeJsapiParams,
  formatCountdown,
  invokeWechatPay: requestWxPayment,
  requestWxPayment,
  pollPayUntilDone,
  createPayCountdown,
  startOnlinePay,
  formatPayError,
  resolvePayQrImageUrl,
}

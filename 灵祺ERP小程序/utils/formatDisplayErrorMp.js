/** 与 web formatDisplayError.ts 对齐，避免 [object Object] */

function formatThrowableMessage(value, fallback) {
  const fb = fallback || '操作失败，请稍后重试'
  if (value == null) return fb
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t || t === '[object Object]') return fb
    return t
  }
  if (value instanceof Error) {
    const m = value.message && value.message.trim()
    if (m && m !== '[object Object]') return m
  }
  if (typeof value === 'object') {
    const o = value
    const keys = ['message', 'detail', 'details', 'error', 'msg', 'reason', 'hint', 'code']
    for (let i = 0; i < keys.length; i++) {
      const nested = formatThrowableMessage(o[keys[i]], '')
      if (nested) return nested
    }
    try {
      const s = JSON.stringify(o)
      if (s && s !== '{}' && s !== '[object Object]') {
        return s.length > 280 ? `${s.slice(0, 277)}…` : s
      }
    } catch (_) {}
  }
  const s = String(value).trim()
  if (!s || s === '[object Object]') return fb
  return s
}

const TENANT_PAY_ERROR_ZH = {
  wechat_pay_not_configured: '微信支付未在服务器配置，请联系管理员',
  alipay_not_configured: '支付宝未在服务器配置，请联系管理员',
  douyinpay_not_configured: '抖音支付未在服务器配置，请联系管理员',
  douyin_pay_not_configured: '抖音支付未在服务器配置，请联系管理员',
  invalid_amount: '金额无效',
  invalid_payload: '请求参数无效',
  missing_out_trade_no: '缺少订单号',
  missing_openid: '无法获取微信 openid，请重新登录后再试',
  order_not_found: '订单不存在',
  unsupported_channel: '不支持的支付方式',
  create_order_failed: '创建支付订单失败',
  billing_failed: '账单服务异常，请稍后重试',
  ecs_internal_api_error: '支付服务内部错误，请稍后重试',
  supabase_not_configured: '数据库服务未配置',
  db_migration_required: '数据库尚未升级积分/在线支付字段，请联系管理员执行迁移后重试',
  postgrest_schema_cache_stale:
    '支付接口 schema 缓存未刷新，请联系管理员重启 PostgREST 后重试',
  invalid_session: '登录已失效，请重新登录',
  not_a_tenant_member: '当前账号未关联商户租户',
  insufficient_wallet_balance: '余额不足，请先充值账户余额',
}

function formatHttpGatewayError(status, statusText) {
  if (status === 502 || status === 504) {
    return '支付网关暂时不可用（502），请稍后重试；若持续出现请联系管理员检查轻量 auth-api'
  }
  if (status === 503) return '支付服务维护中（503），请稍后重试'
  const t = String(statusText || '').trim()
  if (t && t !== 'Bad Gateway' && t !== 'Gateway Timeout') return t
  if (status >= 500) return `支付服务异常（HTTP ${status}），请稍后重试`
  return ''
}

function tenantPayErrorMessage(code, missing) {
  const key = String(code || '').trim()
  let msg = TENANT_PAY_ERROR_ZH[key] || key || '支付失败，请稍后重试'
  if (missing && missing.length) {
    msg += `（缺少：${missing.slice(0, 6).join('、')}）`
  }
  return msg
}

function friendlyWxCodeError(text) {
  const t = String(text || '')
  if (/code been used|invalid code|40163|40029|wx_code_used|wx_code2session/i.test(t)) {
    return '微信授权已失效，请重新点击微信支付'
  }
  return ''
}

function billingApiErrorMessage(json, statusText, status) {
  const j = json && typeof json === 'object' ? json : {}
  const gateway = formatHttpGatewayError(status, statusText)
  if (gateway && (!j || Object.keys(j).length === 0 || j.ok === undefined)) {
    return gateway
  }
  const message = formatThrowableMessage(j.message, '')
  const wxMsg = friendlyWxCodeError(message)
  if (wxMsg) return wxMsg
  if (message) return message
  const detail = formatThrowableMessage(j.detail, '')
  const wxDetail = friendlyWxCodeError(detail)
  if (wxDetail) return wxDetail
  if (detail) return detail
  const errRaw = formatThrowableMessage(j.error, '')
  const wxErr = friendlyWxCodeError(errRaw)
  if (wxErr) return wxErr
  if (errRaw) {
    const missing = Array.isArray(j.missing)
      ? j.missing.filter((x) => typeof x === 'string')
      : undefined
    const mapped = tenantPayErrorMessage(errRaw, missing)
    return mapped !== errRaw ? mapped : errRaw
  }
  const gatewayFallback = formatHttpGatewayError(status, statusText)
  if (gatewayFallback) return gatewayFallback
  return statusText || '请求失败'
}

module.exports = {
  formatThrowableMessage,
  formatHttpGatewayError,
  tenantPayErrorMessage,
  billingApiErrorMessage,
}

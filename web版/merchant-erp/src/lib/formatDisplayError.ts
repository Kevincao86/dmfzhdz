/** 将 unknown 错误转为可展示字符串（避免 [object Object]） */
export function formatThrowableMessage(value: unknown, fallback = '操作失败，请稍后重试'): string {
  if (value == null) return fallback
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t || t === '[object Object]') return fallback
    return t
  }
  if (value instanceof Error) {
    const m = value.message?.trim()
    if (m && m !== '[object Object]') return m
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const k of ['message', 'detail', 'details', 'error', 'msg', 'reason', 'hint', 'code']) {
      const nested = formatThrowableMessage(o[k], '')
      if (nested) return nested
    }
    try {
      const s = JSON.stringify(o)
      if (s && s !== '{}' && s !== '[object Object]') {
        return s.length > 280 ? `${s.slice(0, 277)}…` : s
      }
    } catch {
      /* ignore */
    }
  }
  const s = String(value).trim()
  if (!s || s === '[object Object]') return fallback
  return s
}

const TENANT_PAY_ERROR_ZH: Record<string, string> = {
  wechat_pay_not_configured: '微信支付未在服务器配置，请联系管理员',
  alipay_not_configured: '支付宝未在服务器配置，请联系管理员',
  douyinpay_not_configured: '抖音支付未在服务器配置，请联系管理员',
  douyin_pay_not_configured: '抖音支付未在服务器配置，请联系管理员',
  invalid_amount: '金额无效',
  invalid_payload: '请求参数无效',
  missing_out_trade_no: '缺少订单号',
  order_not_found: '订单不存在',
  unsupported_channel: '不支持的支付方式',
  create_order_failed: '创建支付订单失败',
  billing_failed: '账单服务异常，请稍后重试',
  ecs_internal_api_error: '支付服务内部错误，请稍后重试',
  supabase_not_configured: '数据库服务未配置',
  db_migration_required: '数据库尚未升级积分/在线支付字段，请联系管理员执行迁移后重试',
  invalid_session: '登录已失效，请重新登录',
  not_a_tenant_member: '当前账号未关联商户租户',
}

export function tenantPayErrorMessage(code: string, missing?: string[]): string {
  const key = String(code || '').trim()
  let msg = TENANT_PAY_ERROR_ZH[key] || key || '支付失败，请稍后重试'
  if (missing?.length) {
    msg += `（缺少：${missing.slice(0, 6).join('、')}）`
  }
  return msg
}

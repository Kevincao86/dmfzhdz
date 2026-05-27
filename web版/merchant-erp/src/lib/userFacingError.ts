/**
 * 将接口/网关返回的英文或技术错误转为商家可理解的中文提示
 */
export function toUserFacingError(raw: unknown, action = '操作'): string {
  const s =
    typeof raw === 'string'
      ? raw.trim()
      : raw instanceof Error
        ? raw.message.trim()
        : String(raw ?? '').trim()

  if (!s) return `${action}失败，请稍后重试。`

  const lower = s.toLowerCase()

  if (
    /not_found|page could not be found|404\b|cannot find|route not found/.test(lower) ||
    /\bNOT_FOUND\b/.test(s)
  ) {
    return '相关功能接口暂未开通或正在部署中，请稍后再试；若持续出现，请联系灵祺客服协助检查线上环境。'
  }

  if (/502|503|504|bad gateway|service unavailable|gateway timeout/.test(lower)) {
    return '服务暂时繁忙，请稍后再试。'
  }

  if (/401|403|unauthorized|forbidden|access.?token|token.*invalid|鉴权|未授权|权限/.test(lower)) {
    return '本地推授权已失效或权限不足，请前往系统设置重新绑定并确认开放平台已开通线索权限。'
  }

  if (/network|fetch failed|failed to fetch|econnreset|econnrefused|socket|dns/.test(lower)) {
    return '网络连接失败，请检查网络后重试。'
  }

  if (/timeout|timed out|超时|abort/.test(lower)) {
    return '请求超时，请稍后重试。'
  }

  if (/<!doctype|<html[\s>]/i.test(s)) {
    return '服务返回异常，请稍后重试或联系客服。'
  }

  if (/openapi|open_api|\/v\d+\.\d+\//i.test(s) && !/[\u4e00-\u9fff]/.test(s)) {
    return `${action}失败，请确认本地推账号与授权有效，或稍后在系统设置中重新绑定。`
  }

  if (!/[\u4e00-\u9fff]/.test(s)) {
    return `${action}失败，请稍后重试；若问题持续，请联系灵祺客服。`
  }

  return s
    .replace(/\bNOT_FOUND\b[\s\S]*$/i, '')
    .replace(/\bhnd\d+:[\w-]+\b/gi, '')
    .trim()
}

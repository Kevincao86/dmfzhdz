/** 将接口 error 码转为用户可读中文 */
const ZH: Record<string, string> = {
  sms_code_invalid: '验证码错误或已过期',
  invalid_sms_code: '请输入 6 位验证码',
  sms_not_configured: '短信服务未配置，请联系管理员',
  aliyun_sms_send_failed: '验证码发送失败，请稍后重试',
  login_name_taken: '该手机号已被注册',
  phone_exists: '该手机号已注册，请直接登录',
  invalid_phone: '请输入有效大陆手机号',
  invalid_password: '密码至少 6 位',
  password_mismatch: '两次输入的密码不一致',
  invalid_credentials: '账号或密码错误',
  account_no_password: '该账号未设置密码，请先用微信登录并在资料页设置密码',
  invalid_login_name: '登录名格式不正确',
  invalid_session: '登录已过期，请重新登录',
  account_not_found: '账号不存在',
  not_found: '接口不可用，请稍后重试或联系运维',
  unknown_action: '接口动作无效',
  wx_not_configured: '微信登录未配置',
  wx_already_registered: '该微信已注册',
  auth_unreachable: '注册服务暂时不可用，请稍后重试',
  forbidden: '无权访问验证服务',
  sms_verify_failed: '验证码校验失败，请重试',
  method_not_allowed: '请求方式错误',
  dev_only: '仅开发环境可用',
}

export function formatMpApiErr(e: unknown, fallback = '操作失败，请稍后重试'): string {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  const msg = raw.trim()
  if (!msg) return fallback
  if (/Unexpected end of JSON input/i.test(msg)) {
    return '接口无有效响应，请检查 VITE_MP_API_BASE 或联系运维'
  }
  const code = msg.split(/[（(]/)[0]?.trim() || msg
  if (ZH[code]) return ZH[code]
  if (ZH[msg]) return ZH[msg]
  if (/sms_code_invalid/i.test(msg)) return ZH.sms_code_invalid
  if (/login_name_taken/i.test(msg)) return ZH.login_name_taken
  if (/not_found/i.test(msg)) return ZH.not_found
  if (/413|Request Entity Too Large|request_entity_too_large/i.test(msg)) {
    return '提交内容过大（多为封面图）。请换更小图片、选图库封面，或联系运维执行 ecs-hotfix-nginx-body-size.sh'
  }
  if (/meoo_ops_sync_registry_failed|meoo_ops_mp_hall_registry_failed|registry_snapshot_fetch_timeout|registry_failed/i.test(msg)) {
    return '招募数据加载失败，请刷新重试；若持续失败请联系运维检查 ECS 注册表服务'
  }
  if (/招募大厅加载超时/i.test(msg)) return msg
  if (/[\u4e00-\u9fa5]/.test(msg)) return msg
  return fallback
}

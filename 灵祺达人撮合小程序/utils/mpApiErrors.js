/** 将接口 error 码转为用户可读中文 */
const ZH = {
  sms_code_invalid: '验证码错误或已过期',
  invalid_sms_code: '请输入 6 位验证码',
  sms_not_configured: '短信服务未配置，请联系管理员',
  aliyun_sms_send_failed: '验证码发送失败，请稍后重试',
  login_name_taken: '该手机号已被注册',
  phone_exists: '该手机号已注册，请直接登录',
  invalid_phone: '请输入有效大陆手机号',
  invalid_password: '密码至少 6 位',
  invalid_credentials: '账号或密码错误',
  account_no_password: '该账号未设置密码，请先用微信登录并在资料页设置密码',
  invalid_session: '登录已过期，请重新登录',
  login_required: '请先完成微信登录后再保存资料',
  contact_required: '请填写联系电话与微信号',
  invalid_member: '资料不完整，请填写昵称',
  not_found: '接口不可用，请稍后重试',
  invalid_apply: '请完整填写报名信息',
  invalid_json: '提交数据异常，请重试',
  invalid_upload: '视频数据无效，请重新选择',
  invalid_submit: '提交失败，请重新报名后再试',
  file_too_large: '视频过大，请压缩后重试',
  oss_upload_failed: '视频存储失败，请稍后重试',
  upload_plan_failed: '上传服务暂不可用，请稍后重试',
  video_upload_body_failed: '视频上传失败，请稍后重试',
  cloud_proxy_fail: '网络代理失败，请检查网络后重试',
  supabase_admin_not_configured: '后台未就绪，请稍后重试',
  auth_unreachable: '注册服务暂时不可用，请稍后重试',
  profile_parse_failed: '未能从主页解析资料，请复制完整分享口令或手动填写',
  profile_parse_error: '主页解析失败，请稍后重试或手动填写',
}

function formatMpApiErr(e, fallback) {
  const fb = fallback || '操作失败，请稍后重试'
  const msg = e && e.message ? String(e.message).trim() : String(e || '').trim()
  if (!msg) return fb
  const code = msg.split(/[（(]/)[0]?.trim() || msg
  if (ZH[code]) return ZH[code]
  if (ZH[msg]) return ZH[msg]
  if (/sms_code_invalid/i.test(msg)) return ZH.sms_code_invalid
  if (/login_name_taken/i.test(msg)) return ZH.login_name_taken
  if (/not_found/i.test(msg)) return ZH.not_found
  if (/[\u4e00-\u9fa5]/.test(msg)) return msg
  return fb
}

module.exports = { formatMpApiErr, ZH }

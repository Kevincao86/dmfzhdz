const api = require('./api.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')

const PATH = '/api/meoo-ops-mp-wechat-oa-bind'

async function call(body) {
  if (!api.hasApi()) throw new Error('网络未配置')
  if (!auth.isLoggedIn()) throw new Error('请先登录后再绑定服务号')
  const res = await api.post(PATH, body, auth.authHeaders())
  if (!res || res.ok === false) {
    const code = String((res && res.error) || '').trim()
    if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
      throw new Error('登录已过期，请重新登录')
    }
    if (code === 'member_not_found') {
      throw new Error('未找到达人资料，请先在「我的信息」完善并保存')
    }
    if (code === 'wx_oa_not_configured') {
      throw new Error('服务号通知暂未开通，请联系管理员')
    }
    if (code === 'wx_oa_ip_not_whitelisted') {
      throw new Error(
        (res && res.message) ||
          '微信服务号未配置服务器 IP 白名单，请联系管理员在公众平台添加 139.196.42.5',
      )
    }
    if (/wx_oa_qrcode|invalid credential|access_token/i.test(code)) {
      throw new Error('服务号二维码获取失败，请稍后重试')
    }
    const detail = String((res && (res.message || res.detail || res.hint || res.error)) || '').trim()
    throw new Error(mpApiErrors.formatMpApiErr(new Error(code), detail))
  }
  return res
}

function getStatus(talentMemberId) {
  return call({ action: 'status', talentMemberId })
}

function createTicket(talentMemberId) {
  return call({ action: 'create_ticket', talentMemberId })
}

module.exports = {
  getStatus,
  createTicket,
}

/**
 * 探店文稿 AI 违规检核（PR 审核 / 达人自检）
 */
const ecs = require('./ecs.js')
const auth = require('./auth.js')
const { formatScriptComplianceInline } = require('./complianceInlineStatusFormat.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

const API_PATHS = ['/api/meoo-mp-recruitment-script-compliance']

function authHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

async function checkScriptCompliance(payload) {
  if (!ecs.hasBase()) {
    throw new Error('未配置后台地址，无法 AI 检核')
  }
  const token = auth.readSessionToken()
  const body = {
    ...(payload || {}),
    ...(token ? { sessionToken: token, token } : {}),
    ...mpBillingRoleHint.billingRolePayload(),
  }
  let lastErr
  for (const path of API_PATHS) {
    try {
      const res = await ecs.post(path, body, authHeaders())
      if (!res || res.ok === false) {
        throw new Error((res && res.message) || 'AI 检核失败')
      }
      return res
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('AI 检核失败')
}

function getCheckingInlineStatus() {
  return { text: 'AI检核中', tone: 'checking' }
}

function formatInlineStatus(res) {
  return formatScriptComplianceInline(res)
}

module.exports = {
  checkScriptCompliance,
  getCheckingInlineStatus,
  formatInlineStatus,
}

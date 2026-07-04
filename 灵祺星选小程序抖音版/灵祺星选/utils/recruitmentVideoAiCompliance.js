/**
 * 探店成片抖音生活服务违规 AI 检核（PR 审核 / 达人自检）
 */
const api = require('./api.js')
const { formatVideoComplianceInline } = require('./complianceInlineStatusFormat.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

const API_PATHS = ['/api/meoo-mp-recruitment-video-compliance']

async function checkVideoCompliance(payload) {
  if (!api.hasApi()) {
    throw new Error('未配置后台地址，无法 AI 检核')
  }
  const res = await api.tryPaths('POST', API_PATHS, {
    ...(payload || {}),
    ...mpBillingRoleHint.billingRolePayload(),
  })
  if (!res || res.ok === false) {
    throw new Error((res && res.message) || 'AI 检核失败')
  }
  return res
}

function getCheckingInlineStatus() {
  return { text: 'AI检核中', tone: 'checking' }
}

function formatInlineStatus(res) {
  return formatVideoComplianceInline(res)
}

module.exports = {
  checkVideoCompliance,
  getCheckingInlineStatus,
  formatInlineStatus,
}

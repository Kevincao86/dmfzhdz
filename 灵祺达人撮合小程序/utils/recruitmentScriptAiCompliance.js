/**
 * 探店文稿 AI 违规检核（PR 审核 / 达人自检）
 */
const api = require('./api.js')
const { formatScriptComplianceInline } = require('./complianceInlineStatusFormat.js')

const API_PATHS = ['/api/meoo-mp-recruitment-script-compliance']

async function checkScriptCompliance(payload) {
  if (!api.hasApi()) {
    throw new Error('未配置后台地址，无法 AI 检核')
  }
  const res = await api.tryPaths('POST', API_PATHS, payload)
  if (!res || res.ok === false) {
    throw new Error((res && res.message) || 'AI 检核失败')
  }
  return res
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

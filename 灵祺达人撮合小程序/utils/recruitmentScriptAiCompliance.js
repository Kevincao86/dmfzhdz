/**
 * 探店文稿 AI 违规检核（PR 审核 / 达人自检）
 */
const api = require('./api.js')

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
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  const msg = String(res.message || '')
  if (hits.length) {
    const words = hits.slice(0, 2).join('、')
    return { text: `AI检测到（${words}）请注意修改`, tone: 'warn' }
  }
  if (msg && /[\u4e00-\u9fa5]/.test(msg)) {
    return { text: msg.slice(0, 48), tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

module.exports = {
  checkScriptCompliance,
  getCheckingInlineStatus,
  formatInlineStatus,
}

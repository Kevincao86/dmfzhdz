/**
 * 探店成片抖音生活服务违规 AI 检核（PR 审核 / 达人自检）
 */
const api = require('./api.js')

const API_PATHS = ['/api/meoo-mp-recruitment-video-compliance']

async function checkVideoCompliance(payload) {
  if (!api.hasApi()) {
    throw new Error('未配置后台地址，无法 AI 检核')
  }
  const res = await api.tryPaths('POST', API_PATHS, payload)
  if (!res || res.ok === false) {
    throw new Error((res && res.message) || 'AI 检核失败')
  }
  return res
}

function showComplianceResult(res) {
  const title = res.verdict === 'suspect' ? 'AI 检核 · 注意' : 'AI 检核 · 正常'
  const hits = Array.isArray(res.hits) && res.hits.length ? `\n\n命中：${res.hits.join('、')}` : ''
  wx.showModal({
    title,
    content: String(res.message || (res.verdict === 'normal' ? '视频正常' : '可能违规请注意审核')) + hits,
    showCancel: false,
  })
}

module.exports = {
  checkVideoCompliance,
  showComplianceResult,
}

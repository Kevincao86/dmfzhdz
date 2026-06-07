const api = require('./api.js')

async function parseProfileLink(link, platform) {
  const body = { link: String(link || '').trim(), platform: platform || '抖音' }
  if (!body.link) throw new Error('请先粘贴主页链接')
  const res = await api.post('/api/meoo-ops-mp-profile-link-parse', body)
  if (!res || res.ok === false) {
    throw new Error((res && (res.message || res.detail || res.error)) || '解析失败')
  }
  return res
}

module.exports = { parseProfileLink }

const api = require('./api.js')

async function parseFormRelaySource(url, platform) {
  const body = { url: String(url || '').trim() }
  if (platform) body.platform = String(platform)
  const res = await api.post('/api/meoo-ops-mp-form-relay-source-parse', body)
  if (!res || res.ok === false) {
    throw new Error(String((res && (res.message || res.detail || res.error)) || '解析失败'))
  }
  return res
}

module.exports = {
  parseFormRelaySource,
}

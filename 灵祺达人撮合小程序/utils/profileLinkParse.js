const api = require('./api.js')

async function parseProfileLink(link, platform) {
  const body = { link: String(link || '').trim(), platform: platform || '抖音' }
  if (!body.link) throw new Error('请先粘贴主页链接')
  try {
    const res = await api.post('/api/meoo-ops-mp-profile-link-parse', body)
    if (!res || res.ok === false) {
      const msg = (res && (res.message || res.detail)) || ''
      if (msg && /[\u4e00-\u9fa5]/.test(msg)) throw new Error(msg)
      throw new Error('未能解析主页资料，请复制完整分享口令或手动填写')
    }
    return res
  } catch (e) {
    const mpApiErrors = require('./mpApiErrors.js')
    throw new Error(mpApiErrors.formatMpApiErr(e, '未能解析主页资料，请稍后重试或手动填写'))
  }
}

module.exports = { parseProfileLink }

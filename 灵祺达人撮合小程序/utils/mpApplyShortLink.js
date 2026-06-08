const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const shareCopy = require('./recruitmentShareCopy.js')

function authHeaders() {
  const token = sessionStore.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

/**
 * 向 ECS 请求微信 genwxashortlink；返回群聊可点的 #小程序:// 链接。
 * @param {string} mpOrderId
 * @param {string} [title]
 * @returns {Promise<{ link: string, source?: string }>}
 */
async function fetchApplyShortLink(mpOrderId, title) {
  const id = String(mpOrderId || '').trim()
  if (!id) return { link: shareCopy.buildRecruitmentApplyLink(id) }
  try {
    const data = await ecs.post(
      '/api/meoo-ops-mp-auth',
      {
        action: 'mp_apply_shortlink_get',
        mpOrderId: id,
        title: String(title || '').trim(),
      },
      authHeaders(),
    )
    const link = data && data.link ? String(data.link).trim() : ''
    if (link) return { link, source: data.source ? String(data.source) : 'wechat_api' }
  } catch (e) {
    console.warn('[mp] mp_apply_shortlink_get', String(e && e.message ? e.message : e).slice(0, 120))
  }
  return { link: shareCopy.buildRecruitmentApplyLink(id), source: 'local_fallback' }
}

module.exports = {
  fetchApplyShortLink,
}

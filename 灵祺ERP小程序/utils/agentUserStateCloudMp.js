/**
 * 智能体习惯 / 对话线程云端同步 — 与 Web 共用 /api/meoo-agent-user-state。
 */
const config = require('./config.js')
const api = require('./api.js')
const devAuth = require('./devAuth.js')

/** @type {number} */
let lastPullAt = 0
/** @type {Promise<unknown> | null} */
let inflightPull = null
/** @type {ReturnType<typeof setTimeout> | null} */
let pushTimer = null

function apiBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function authHeaders() {
  const token = api.getBearerToken()
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token && token !== devAuth.DEV_TOKEN) h.Authorization = `Bearer ${token}`
  return h
}

function request(method, body) {
  const base = apiBase()
  if (!base || !api.isRealAuthed()) return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.request({
      url: `${base}/api/meoo-agent-user-state`,
      method,
      header: authHeaders(),
      data: body || undefined,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok !== false) {
          resolve(res.data)
          return
        }
        resolve(null)
      },
      fail() {
        resolve(null)
      },
    })
  })
}

async function pullAgentUserState() {
  if (!api.isRealAuthed()) return null
  const now = Date.now()
  if (now - lastPullAt < 8000 && inflightPull) return inflightPull
  inflightPull = request('GET').then((data) => {
    lastPullAt = Date.now()
    inflightPull = null
    return data
  })
  return inflightPull
}

function schedulePushAgentUserState(patch) {
  if (!api.isRealAuthed()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void request('POST', patch)
  }, 600)
}

function pushAgentUserStateNow(patch) {
  if (!api.isRealAuthed()) return Promise.resolve(null)
  return request('POST', patch)
}

module.exports = {
  pullAgentUserState,
  schedulePushAgentUserState,
  pushAgentUserStateNow,
}

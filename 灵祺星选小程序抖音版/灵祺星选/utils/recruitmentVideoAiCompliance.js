/**
 * 探店成片抖音生活服务违规 AI 检核（PR 审核 / 达人自检）
 * 成片检核含 ASR+多帧视觉，单独加长超时，避免 request:fail interrupted。
 */
const api = require('./api.js')
const auth = require('./auth.js')
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')
const { formatVideoComplianceInline } = require('./complianceInlineStatusFormat.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

const API_PATHS = ['/api/meoo-mp-recruitment-video-compliance']
const VIDEO_COMPLIANCE_TIMEOUT_MS = 180000

function authHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function resolveApiUrl(path) {
  mpRuntime.applyRuntimeConfig(config)
  const base = String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
  if (!base) return ''
  let p = String(path || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (/\/erp-api\/?$/i.test(base)) return `${base}/${p.replace(/^\/api\//, '')}`
  return `${base}${p}`
}

function postVideoComplianceDirect(path, body) {
  const fullUrl = resolveApiUrl(path)
  if (!fullUrl) return Promise.reject(new Error('未配置后台地址，无法 AI 检核'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method: 'POST',
      timeout: VIDEO_COMPLIANCE_TIMEOUT_MS,
      enableHttp2: false,
      enableQuic: false,
      dataType: 'json',
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      data: body,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const raw = res.data
          if (raw && typeof raw === 'object') {
            resolve(raw)
            return
          }
          try {
            resolve(JSON.parse(String(raw || '{}')))
          } catch {
            resolve({ ok: false, message: String(raw || '空响应') })
          }
          return
        }
        const d = res.data && typeof res.data === 'object' ? res.data : {}
        reject(new Error(String(d.message || d.detail || `http_${res.statusCode}`)))
      },
      fail(e) {
        const msg = String((e && e.errMsg) || 'request:fail')
        if (/interrupted|timeout|超时/i.test(msg)) {
          reject(new Error('AI 检核超时，请在 Wi‑Fi 下重试；成片较长时请稍候再检'))
          return
        }
        reject(new Error(`${msg} → ${fullUrl}`))
      },
    })
  })
}

async function checkVideoCompliance(payload) {
  if (!api.hasApi()) {
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
      let res
      try {
        res = await postVideoComplianceDirect(path, body)
      } catch (directErr) {
        // 直连失败再回退 tryPaths（兼容旧鉴权头等）
        const msg = String(directErr && directErr.message ? directErr.message : directErr)
        if (/超时|interrupted/i.test(msg)) throw directErr
        res = await api.tryPaths('POST', [path], body)
      }
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
  return formatVideoComplianceInline(res)
}

module.exports = {
  checkVideoCompliance,
  getCheckingInlineStatus,
  formatInlineStatus,
}

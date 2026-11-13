/**
 * 探店成片抖音生活服务违规 AI 检核（PR 审核 / 达人自检）
 * 成片检核含 ASR+多帧视觉，单独加长超时，避免 request:fail interrupted。
 * 逻辑：先取时长 → 预估积分 vs 双桶余额 → 不足禁止 → 再调服务端检核并扣减。
 */
const ecs = require('./ecs.js')
const auth = require('./auth.js')
const config = require('./config.js')
const mpRuntime = require('./mpRuntime.js')
const cloudEcs = require('./cloudEcs.js')
const { formatVideoComplianceInline } = require('./complianceInlineStatusFormat.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')
const mpPointsSpend = require('./mpPointsSpendApi.js')

const API_PATHS = ['/api/meoo-mp-recruitment-video-compliance']
/** 微信侧长耗时接口；上限给足，避免加密抽帧视觉被中断 */
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

function resolveVideoDurationSec(payload) {
  const raw =
    payload && (payload.durationSec != null ? payload.durationSec : payload.videoDurationSec)
  if (raw != null && Number(raw) > 0) {
    return Promise.resolve(Math.max(1, Math.ceil(Number(raw))))
  }
  const filePath = payload && (payload.filePath || payload.tempFilePath)
  if (!filePath) return Promise.resolve(null)
  return new Promise((resolve) => {
    if (typeof wx.getVideoInfo !== 'function') {
      resolve(null)
      return
    }
    wx.getVideoInfo({
      src: filePath,
      success(r) {
        const sec = Number(r && r.duration)
        resolve(Number.isFinite(sec) && sec > 0 ? Math.max(1, Math.ceil(sec)) : null)
      },
      fail() {
        resolve(null)
      },
    })
  })
}

function postVideoComplianceDirect(path, body, headers) {
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
        ...headers,
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
  if (!ecs.hasBase()) {
    throw new Error('未配置后台地址，无法 AI 检核')
  }
  const token = auth.readSessionToken()
  const durationSec = await resolveVideoDurationSec(payload || {})
  if (durationSec != null) {
    // 先预估消耗 vs 双桶余额；不足禁止发请求
    await mpPointsSpend.assertVideoComplianceAffordable(durationSec)
  } else if (!(payload && payload.videoUrl)) {
    throw new Error('无法获取视频时长，请重新选择视频后再检核')
  }
  // 仅有远程 URL、无本地时长时：由服务端探测后按双桶门禁（禁止跳过）

  const body = {
    ...(payload || {}),
    ...(durationSec != null ? { durationSec } : {}),
    ...(token ? { sessionToken: token, token } : {}),
    ...mpBillingRoleHint.billingRolePayload(),
  }
  let lastErr
  for (const path of API_PATHS) {
    try {
      const useDirect =
        mpRuntime.shouldForceDirect(config) ||
        !mpRuntime.shouldUseCloudProxy(config) ||
        !cloudEcs.cloudReady()
      const res = useDirect
        ? await postVideoComplianceDirect(path, body, authHeaders())
        : await ecs.post(path, body, authHeaders())
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
  resolveVideoDurationSec,
}

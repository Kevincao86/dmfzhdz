/**
 * 写死：所有图片 / 视频 / 文件上传仅经 HTTPS erp-api → 服务端写 OSS。
 * 禁止云函数 callFunction、禁止 HTTP IP、禁止客户端直 PUT OSS 域名。
 */
const HARD_ERP_API = 'https://mofangdianai.com/erp-api'

const OSS_UPLOAD_PATH_RE =
  /upload-body|upload-init|ice-multipart|ice-upload|group-qr-upload|script-upload|video-upload|recruitment-video/i

const UPLOAD_TIMEOUT_MS = 180000

function isOssUploadRequest(path, body) {
  const p = String(path || '')
  if (OSS_UPLOAD_PATH_RE.test(p)) return true
  if (!body || typeof body !== 'object') return false
  if (body.contentBase64 || body.content_base64) return true
  if (body.step === 'part' && body.contentBase64) return true
  return false
}

function erpApiUrl(apiPath) {
  let p = String(apiPath || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  const rel = p.replace(/^\/api\//, '')
  return `${HARD_ERP_API}/${rel}`
}

function parseJson(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return { message: String(raw) }
  }
}

function formatErr(status, data) {
  const d = parseJson(data)
  const detail = String(d.message || d.detail || d.hint || '').trim()
  if (detail && /[\u4e00-\u9fa5]/.test(detail)) return detail
  const code = String(d.error || `http_${status}`).trim()
  try {
    const mpApiErrors = require('./mpApiErrors.js')
    return mpApiErrors.formatMpApiErr(new Error(code), detail || '上传失败，请稍后重试')
  } catch {
    return detail || code || '上传失败，请稍后重试'
  }
}

function postOssUpload(apiPath, body, headers) {
  const fullUrl = erpApiUrl(apiPath)
  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method: 'POST',
      timeout: UPLOAD_TIMEOUT_MS,
      enableHttp2: false,
      enableQuic: false,
      dataType: 'json',
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(headers && typeof headers === 'object' ? headers : {}),
      },
      data: body,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parseJson(res.data))
          return
        }
        reject(new Error(formatErr(res.statusCode, res.data)))
      },
      fail(e) {
        const msg = String((e && e.errMsg) || 'request:fail')
        if (/domain|url not in|合法域名/i.test(msg)) {
          reject(
            new Error(
              '上传失败：请在小程序后台 request 合法域名添加 https://mofangdianai.com',
            ),
          )
          return
        }
        reject(new Error(`${msg} → ${fullUrl}`))
      },
    })
  })
}

async function postOssUploadPaths(paths, body, headers) {
  const list = Array.isArray(paths) ? paths : [paths]
  let lastErr
  for (const p of list) {
    try {
      const data = await postOssUpload(p, body, headers)
      if (data && data.ok === false) {
        const msg = formatErr(400, data)
        lastErr = new Error(msg)
        if (!/404|not_found/i.test(msg)) throw lastErr
        continue
      }
      return data
    } catch (e) {
      lastErr = e
      const msg = String((e && e.message) || e)
      if (!/404|not_found/i.test(msg)) throw e instanceof Error ? e : new Error(msg)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('上传接口不可用')
}

module.exports = {
  HARD_ERP_API,
  UPLOAD_TIMEOUT_MS,
  isOssUploadRequest,
  erpApiUrl,
  postOssUpload,
  postOssUploadPaths,
}

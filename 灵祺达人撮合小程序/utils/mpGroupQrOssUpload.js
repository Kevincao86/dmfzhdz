/**
 * 群二维码：小程序 tempFile → erp-api base64 上传 → 返回 https imageUrl
 * （禁止 wx.request 直 PUT OSS，否则 request:fail url not in domain list）
 */
const api = require('./api.js')
const ecs = require('./ecs.js')

const UPLOAD_BODY_PATHS = [
  '/api/meoo-ops-mp-group-qr-upload-body',
  '/api/ops-sync/mp-group-qr-upload-body',
]

function isHttpsUrl(s) {
  return /^https:\/\//i.test(String(s || '').trim())
}

function isDomainListError(msg) {
  return /domain|url not in|合法域名/i.test(String(msg || ''))
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data || '')),
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

async function postUploadBody(body) {
  let lastErr
  if (ecs.postHttpsBypassCloud) {
    for (const path of UPLOAD_BODY_PATHS) {
      try {
        const res = await ecs.postHttpsBypassCloud(path, body)
        if (res && res.ok !== false && res.imageUrl) return res
        throw new Error(String((res && res.error) || 'upload_body_failed'))
      } catch (e) {
        lastErr = e
        if (!/404|not_found/i.test(String((e && e.message) || e))) break
      }
    }
  }
  for (const path of UPLOAD_BODY_PATHS) {
    try {
      const res = await api.post(path, body)
      if (res && res.ok !== false && res.imageUrl) return res
      throw new Error(String((res && res.error) || 'upload_body_failed'))
    } catch (e) {
      lastErr = e
      if (!/404|not_found/i.test(String((e && e.message) || e))) break
    }
  }
  throw lastErr || new Error('群二维码上传失败')
}

async function uploadGroupQrFileToOss(mpOrderId, tempFilePath) {
  const id = String(mpOrderId || '').trim()
  const filePath = String(tempFilePath || '').trim()
  if (!id) throw new Error('参数无效')
  if (!filePath) throw new Error('未选择图片')
  if (isHttpsUrl(filePath)) return filePath

  const contentType = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
  const contentBase64 = await readFileBase64(filePath)
  if (!contentBase64) throw new Error('图片文件为空')

  try {
    const res = await postUploadBody({
      mpOrderId: id,
      fileName: 'group-qr.jpg',
      contentType,
      contentBase64,
    })
    const imageUrl = String(res.imageUrl || '').trim()
    if (!imageUrl) throw new Error('上传凭证无效')
    return imageUrl
  } catch (e) {
    const msg = String((e && e.message) || e || '群二维码上传失败')
    if (isDomainListError(msg)) {
      throw new Error('群二维码上传失败：请确认小程序 request 合法域名已含 mofangdianai.com')
    }
    if (/group_qr_too_large|过大/i.test(msg)) throw new Error('二维码图片过大，请换一张截图重试')
    if (/oss_not/i.test(msg)) throw new Error('服务器 OSS 未配置，请联系管理员')
    throw new Error(msg.length > 48 ? `${msg.slice(0, 46)}…` : msg)
  }
}

module.exports = {
  isHttpsUrl,
  uploadGroupQrFileToOss,
}

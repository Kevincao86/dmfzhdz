/**
 * 通用图片 → erp-api → OSS https（封面 / 头像）
 * 复用已部署的 meoo-ops-content-image-upload，禁止 dataURL 落注册表。
 */
const ossTransport = require('./mpOssUploadTransport.js')

const UPLOAD_BODY_PATHS = ['/api/meoo-ops-content-image-upload']

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

function compressImage(filePath, quality, compressedWidth) {
  return new Promise((resolve) => {
    if (typeof wx.compressImage !== 'function') {
      resolve(filePath)
      return
    }
    wx.compressImage({
      src: filePath,
      quality: quality || 72,
      compressedWidth: compressedWidth || 750,
      success: (c) => resolve(c.tempFilePath || filePath),
      fail: () => resolve(filePath),
    })
  })
}

/**
 * @param {string} tempFilePath
 * @param {{ purpose?: 'cover'|'avatar', fileName?: string }} [opts]
 * @returns {Promise<string>} https imageUrl
 */
async function uploadImageFileToOss(tempFilePath, opts) {
  const filePath0 = String(tempFilePath || '').trim()
  if (!filePath0) throw new Error('未选择图片')
  if (isHttpsUrl(filePath0)) return filePath0

  const purpose = String((opts && opts.purpose) || 'image').trim() || 'image'
  const width = purpose === 'avatar' ? 480 : 750
  const quality = purpose === 'avatar' ? 78 : 72
  const filePath = await compressImage(filePath0, quality, width)

  const contentType = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
  const contentBase64 = await readFileBase64(filePath)
  if (!contentBase64) throw new Error('图片文件为空')

  const approxBytes = Math.ceil((contentBase64.length * 3) / 4)
  const maxBytes = purpose === 'avatar' ? 2 * 1024 * 1024 : 5 * 1024 * 1024
  if (approxBytes > maxBytes) {
    throw new Error(purpose === 'avatar' ? '头像过大，请换一张更清晰的小图' : '封面图过大，请换一张更小的图片')
  }

  const ext = contentType === 'image/png' ? 'png' : 'jpg'
  const fileName =
    String((opts && opts.fileName) || '').trim() ||
    `mp-${purpose}-${Date.now()}.${ext}`

  try {
    const res = await ossTransport.postOssUploadPaths(UPLOAD_BODY_PATHS, {
      fileName,
      contentType,
      contentBase64,
    })
    const imageUrl = String((res && res.imageUrl) || '').trim()
    if (!imageUrl || !isHttpsUrl(imageUrl)) throw new Error('上传凭证无效')
    return imageUrl
  } catch (e) {
    const msg = String((e && e.message) || e || '图片上传失败')
    if (isDomainListError(msg)) {
      throw new Error('图片上传失败：请确认小程序 request 合法域名已含 mofangdianai.com')
    }
    if (/oss_not|upload_failed/i.test(msg)) throw new Error('服务器图片存储未就绪，请稍后重试')
    throw new Error(msg.length > 48 ? `${msg.slice(0, 46)}…` : msg)
  }
}

module.exports = {
  isHttpsUrl,
  uploadImageFileToOss,
}

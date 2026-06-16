/**
 * 群二维码：小程序 tempFile → OSS PUT → 返回 https imageUrl
 */
const api = require('./api.js')
const ecs = require('./ecs.js')

const INIT_PATH = '/api/meoo-ops-mp-group-qr-upload-init'

function isHttpsUrl(s) {
  return /^https:\/\//i.test(String(s || '').trim())
}

function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: (r) => resolve(Number(r.size) || 0),
      fail: () => reject(new Error('无法读取图片大小')),
    })
  })
}

function postInit(body) {
  if (ecs.postHttpsBypassCloud) {
    return ecs.postHttpsBypassCloud(INIT_PATH, body).catch(() => api.post(INIT_PATH, body))
  }
  return api.post(INIT_PATH, body)
}

function putFileToOss(uploadUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          header: { 'Content-Type': contentType || 'image/jpeg' },
          data: res.data,
          timeout: 60000,
          success(r) {
            if (r.statusCode >= 200 && r.statusCode < 300) {
              resolve()
              return
            }
            reject(new Error(`上传 OSS 失败(${r.statusCode})`))
          },
          fail(err) {
            reject(new Error(String((err && err.errMsg) || '上传 OSS 失败')))
          },
        })
      },
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

async function uploadGroupQrFileToOss(mpOrderId, tempFilePath) {
  const id = String(mpOrderId || '').trim()
  const filePath = String(tempFilePath || '').trim()
  if (!id) throw new Error('参数无效')
  if (!filePath) throw new Error('未选择图片')
  if (isHttpsUrl(filePath)) return filePath

  const sizeBytes = await getFileSize(filePath)
  if (!sizeBytes) throw new Error('图片文件为空')

  const contentType = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
  const plan = await postInit({
    mpOrderId: id,
    fileName: 'group-qr.jpg',
    contentType,
    sizeBytes,
  })
  if (!plan || plan.ok === false) {
    throw new Error(String((plan && plan.error) || '获取上传凭证失败'))
  }
  const uploadUrl = String(plan.uploadUrl || '').trim()
  const imageUrl = String(plan.imageUrl || '').trim()
  if (!uploadUrl || !imageUrl) throw new Error('上传凭证无效')

  await putFileToOss(uploadUrl, filePath, plan.contentType || contentType)
  return imageUrl
}

module.exports = {
  isHttpsUrl,
  uploadGroupQrFileToOss,
}

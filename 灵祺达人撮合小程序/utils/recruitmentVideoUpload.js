const api = require('./api.js')

function videoStatusLabel(status) {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回'
  if (status === 'pending') return '待审核'
  return ''
}

async function postPaths(paths, body) {
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, body)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('接口不可用')
}

function initUpload(fileName, contentType, sizeBytes) {
  return postPaths(['/api/meoo-ops-mp-recruitment-video-upload-init'], {
    fileName: fileName || 'recruit-video.mp4',
    contentType: contentType || 'video/mp4',
    sizeBytes,
  })
}

function submitVideo(mpOrderId, applicantId, videoUrl) {
  return postPaths(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl },
  )
}

function putFileToOss(uploadUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      success(res) {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          header: { 'Content-Type': contentType || 'video/mp4' },
          data: res.data,
          success(r) {
            if (r.statusCode >= 200 && r.statusCode < 300) resolve()
            else reject(new Error(`上传失败 ${r.statusCode}`))
          },
          fail(err) {
            reject(err || new Error('上传失败'))
          },
        })
      },
      fail(err) {
        reject(err || new Error('读取视频失败'))
      },
    })
  })
}

function chooseAndUploadVideo(mpOrderId, applicantId) {
  return new Promise((resolve, reject) => {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 300,
      success(chooseRes) {
        const tempPath = chooseRes.tempFilePath
        const sizeBytes = chooseRes.size || 0
        const fileName = (tempPath.split('/').pop() || 'recruit-video.mp4').split('?')[0]
        wx.showLoading({ title: '上传中…', mask: true })
        initUpload(fileName, 'video/mp4', sizeBytes)
          .then((plan) => {
            const uploadUrl = String(plan.uploadUrl || '').trim()
            const mediaUrl = String(plan.mediaUrl || '').trim()
            const contentType = plan.contentType || 'video/mp4'
            if (!uploadUrl || !mediaUrl) throw new Error('上传凭证无效')
            return putFileToOss(uploadUrl, tempPath, contentType).then(() => mediaUrl)
          })
          .then((mediaUrl) => submitVideo(mpOrderId, applicantId, mediaUrl))
          .then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已提交审核', icon: 'success' })
            resolve()
          })
          .catch((e) => {
            wx.hideLoading()
            const msg = String(e && e.message ? e.message : e || '上传失败')
            wx.showToast({ title: msg.slice(0, 24), icon: 'none' })
            reject(e)
          })
      },
      fail(err) {
        if (err && err.errMsg && /cancel/.test(err.errMsg)) return
        reject(err || new Error('未选择视频'))
      },
    })
  })
}

module.exports = {
  videoStatusLabel,
  chooseAndUploadVideo,
  submitVideo,
}

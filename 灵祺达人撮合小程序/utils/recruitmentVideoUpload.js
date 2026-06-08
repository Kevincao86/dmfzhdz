const api = require('./api.js')

const MAX_BASE64_MB = 32

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

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(String(res.data || ''))
      },
      fail(err) {
        reject(err || new Error('读取视频失败'))
      },
    })
  })
}

function uploadVideoBody(mpOrderId, applicantId, filePath, fileName, sizeBytes) {
  const maxBytes = MAX_BASE64_MB * 1024 * 1024
  if (sizeBytes > maxBytes) {
    return Promise.reject(new Error(`视频超过 ${MAX_BASE64_MB}MB，请压缩后重试`))
  }
  return readFileBase64(filePath).then((contentBase64) =>
    postPaths(
      [
        '/api/meoo-ops-mp-recruitment-video-upload-body',
        '/api/ops-sync/mp-recruitment-orders/video-upload-body',
      ],
      {
        mpOrderId,
        applicantId,
        fileName: fileName || 'recruit-video.mp4',
        contentType: 'video/mp4',
        contentBase64,
      },
    ),
  )
}

function chooseAndUploadVideo(mpOrderId, applicantId) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) {
    return Promise.reject(new Error('缺少报名信息'))
  }
  return new Promise((resolve, reject) => {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 300,
      success(chooseRes) {
        const tempPath = chooseRes.tempFilePath
        const sizeBytes = Number(chooseRes.size) || 0
        const fileName = (String(tempPath).split('/').pop() || 'recruit-video.mp4').split('?')[0]
        wx.showLoading({ title: '上传中…', mask: true })
        uploadVideoBody(orderId, aid, tempPath, fileName, sizeBytes)
          .then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已提交审核', icon: 'success' })
            resolve()
          })
          .catch((e) => {
            wx.hideLoading()
            const msg = String((e && e.message) || e || '上传失败')
            wx.showModal({
              title: '上传失败',
              content: msg.slice(0, 200),
              showCancel: false,
            })
            reject(e)
          })
      },
      fail(err) {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/.test(msg)) {
          resolve()
          return
        }
        reject(err || new Error('未选择视频'))
      },
    })
  })
}

module.exports = {
  videoStatusLabel,
  chooseAndUploadVideo,
}

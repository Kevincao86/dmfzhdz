const api = require('./api.js')

const MAX_BODY_MB = 3

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
  const maxBytes = MAX_BODY_MB * 1024 * 1024
  if (!sizeBytes || sizeBytes > maxBytes) {
    return Promise.reject(new Error(`视频超过 ${MAX_BODY_MB}MB，请压缩后重试`))
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

function putFileToOss(uploadUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          header: { 'Content-Type': contentType || 'video/mp4' },
          data: res.data,
          timeout: 180000,
          success(r) {
            if (r.statusCode >= 200 && r.statusCode < 300) {
              resolve()
              return
            }
            let host = ''
            try {
              host = new URL(uploadUrl).hostname
            } catch (_) {}
            reject(
              new Error(
                host
                  ? `上传 OSS 失败(${r.statusCode})，请确认小程序已配置 request 合法域名：${host}`
                  : `上传失败 ${r.statusCode}`,
              ),
            )
          },
          fail(err) {
            const msg = String((err && err.errMsg) || '上传失败')
            let host = ''
            try {
              host = new URL(uploadUrl).hostname
            } catch (_) {}
            if (/domain|url not in|合法域名/i.test(msg) && host) {
              reject(new Error(`请在小程序后台添加 request 合法域名：${host}`))
              return
            }
            reject(new Error(msg))
          },
        })
      },
      fail(err) {
        reject(err || new Error('读取视频失败'))
      },
    })
  })
}

function uploadViaOss(mpOrderId, applicantId, tempPath, sizeBytes, fileName) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!sizeBytes) return Promise.reject(new Error('无法获取视频大小，请换一段视频重试'))
  return initUpload(fileName, 'video/mp4', sizeBytes).then((plan) => {
    const uploadUrl = String(plan.uploadUrl || '').trim()
    const mediaUrl = String(plan.mediaUrl || '').trim()
    const contentType = plan.contentType || 'video/mp4'
    if (!uploadUrl || !mediaUrl) throw new Error('上传凭证无效')
    return putFileToOss(uploadUrl, tempPath, contentType).then(() => submitVideo(orderId, aid, mediaUrl))
  })
}

function chooseVideoFile() {
  return new Promise((resolve, reject) => {
    const onPick = (tempPath, sizeBytes) => {
      const fileName = (String(tempPath).split('/').pop() || 'recruit-video.mp4').split('?')[0]
      resolve({ tempPath, sizeBytes: Number(sizeBytes) || 0, fileName })
    }
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        maxDuration: 300,
        success(res) {
          const f = res.tempFiles && res.tempFiles[0]
          if (!f || !f.tempFilePath) {
            reject(new Error('未选择视频'))
            return
          }
          onPick(f.tempFilePath, f.size)
        },
        fail(err) {
          const msg = String((err && err.errMsg) || '')
          if (/cancel/.test(msg)) {
            resolve(null)
            return
          }
          reject(err || new Error('未选择视频'))
        },
      })
      return
    }
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      maxDuration: 300,
      success(chooseRes) {
        onPick(chooseRes.tempFilePath, chooseRes.size)
      },
      fail(err) {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/.test(msg)) {
          resolve(null)
          return
        }
        reject(err || new Error('未选择视频'))
      },
    })
  })
}

function chooseAndUploadVideo(mpOrderId, applicantId) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) {
    return Promise.reject(new Error('缺少报名信息'))
  }
  return chooseVideoFile().then((picked) => {
    if (!picked) return
    const { tempPath, sizeBytes, fileName } = picked
    wx.showLoading({ title: '上传中…', mask: true })
    const tryOss = () => uploadViaOss(orderId, aid, tempPath, sizeBytes, fileName)
    const tryBody =
      sizeBytes > 0 && sizeBytes <= MAX_BODY_MB * 1024 * 1024
        ? () => uploadVideoBody(orderId, aid, tempPath, fileName, sizeBytes)
        : null
    return tryOss()
      .catch((ossErr) => {
        if (!tryBody) throw ossErr
        return tryBody()
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已提交审核', icon: 'success' })
      })
      .catch((e) => {
        wx.hideLoading()
        const msg = String((e && e.message) || e || '上传失败')
        wx.showModal({
          title: '上传失败',
          content: msg.slice(0, 240),
          showCancel: false,
        })
        throw e
      })
  })
}

module.exports = {
  videoStatusLabel,
  chooseAndUploadVideo,
  submitVideo,
}

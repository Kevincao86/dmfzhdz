const api = require('./api.js')
const ecs = require('./ecs.js')
const mpApiErrors = require('./mpApiErrors.js')

/** 探店成片最长 3 分钟（与 merchant-erp recruitmentVideoLimits 同步） */
const MAX_VIDEO_DURATION_SEC = 180
const MAX_DIRECT_BODY_MB = 38
const MAX_OSS_BODY_MB = 200
/** 云函数 callFunction 单次 payload 上限，小文件可走 body 直传 */
const CLOUD_BODY_MB = 2
/** 分片原始字节（base64 后约 1MB，低于云函数 5MB 限制） */
const CHUNK_BYTES = Math.floor(768 * 1024)

const VIDEO_UPLOAD_BODY_PATHS = [
  '/api/meoo-ops-mp-recruitment-video-upload-body',
  '/api/ops-sync/mp-recruitment-orders/video-upload-body',
]
const VIDEO_MULTIPART_PATHS = ['/api/meoo-merchant-ai-video-ice-multipart']

const VIDEO_UPLOAD_BODY_RE = /video-upload-body|ice-multipart|ice-upload/i

function hasHttpsUploadChannel() {
  return ecs.canDirectUpload() || !!(ecs.httpsApiBase && ecs.httpsApiBase())
}

function isHeavyVideoPayload(path, body) {
  const p = String(path || '')
  if (VIDEO_UPLOAD_BODY_RE.test(p)) return true
  if (!body || typeof body !== 'object') return false
  if (body.contentBase64 || body.content_base64) return true
  if (body.step === 'part' && body.contentBase64) return true
  return false
}

function rejectCloudHeavyUpload() {
  return Promise.reject(
    new Error(
      '视频过大，不能经云函数上传。请确认体验版已更新，且 request 合法域名含 https://mofangdianai.com',
    ),
  )
}

async function postHttpsHeavy(path, body) {
  if (!ecs.postHttpsBypassCloud || !ecs.httpsApiBase()) return null
  const res = await ecs.postHttpsBypassCloud(path, body)
  if (res && res.ok === false) {
    throw new Error(formatErrorMessage(res, '上传失败'))
  }
  return res
}

async function postOnce(path, body) {
  const heavy = isHeavyVideoPayload(path, body)
  if (heavy && !hasHttpsUploadChannel() && !ecs.useCloudProxy()) {
    return rejectCloudHeavyUpload()
  }
  if (heavy) {
    try {
      const viaHttps = await postHttpsHeavy(path, body)
      if (viaHttps) return viaHttps
    } catch (e) {
      const msg = String((e && e.message) || e)
      if (!/404|not_found/i.test(msg)) throw e instanceof Error ? e : new Error(msg)
    }
    if (ecs.useCloudProxy()) return rejectCloudHeavyUpload()
  }
  if (ecs.canDirectUpload()) {
    return ecs.postDirect(path, body).catch((directErr) => {
      if (heavy) throw directErr
      const msg = String((directErr && directErr.message) || '')
      if (/domain|url not in|合法域名|cronet|reset|errcode:-101/i.test(msg)) {
        return api.post(path, body)
      }
      throw directErr
    })
  }
  if (heavy) return rejectCloudHeavyUpload()
  if (ecs.hasBase() || api.hasApi()) {
    return api.post(path, body)
  }
  return api.post(path, body)
}

function formatErrorMessage(err, fallback) {
  const fb = fallback || '上传失败，请稍后重试'
  if (!err) return fb
  if (typeof err === 'string') return err.trim() || fb
  if (err instanceof Error) {
    const msg = String(err.message || '').trim()
    return msg || fb
  }
  if (typeof err === 'object') {
    const msg = String(
      err.message || err.detail || err.hint || err.errMsg || err.error || '',
    ).trim()
    if (msg) {
      if (/data exceed max size|exceed max size/i.test(msg)) {
        return '视频过大，不能经云函数上传。请重新上传体验版（构建号 mp-20260615-publish-link）并确认已配置合法域名'
      }
      if (/[\u4e00-\u9fa5]/.test(msg)) return msg
      return mpApiErrors.formatMpApiErr(new Error(msg), fb)
    }
    try {
      const raw = JSON.stringify(err)
      if (raw && raw !== '{}' && raw.length < 120) return raw
    } catch (_) {}
  }
  return fb
}

function videoStatusLabel(status) {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新上传'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '待达人提交'
  return ''
}

function isApplicantVideoVisibleOnPrReview(a, isIce) {
  if (!a) return false
  const status = String(a.videoStatus || '').trim()
  if (status === 'draft') return false
  if (status === 'rejected') return true
  const url = isIce
    ? String(a.videoUrl || a.douyinPublishUrl || '').trim()
    : String(a.videoUrl || '').trim()
  return !!url
}

async function postPaths(paths, body) {
  let lastErr
  for (const path of paths) {
    try {
      const data = await postOnce(path, body)
      if (data && data.ok === false) {
        const msg = formatErrorMessage(data, '提交失败')
        if (!/404|not_found/i.test(msg)) throw new Error(msg)
        lastErr = new Error(msg)
        continue
      }
      return data
    } catch (e) {
      lastErr = e
      const msg = formatErrorMessage(e, '')
      if (!/404|not_found/i.test(msg)) throw new Error(msg || formatErrorMessage(e, '接口不可用'))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(formatErrorMessage(lastErr, '接口不可用'))
}

function initUpload(fileName, contentType, sizeBytes) {
  return postPaths(['/api/meoo-ops-mp-recruitment-video-upload-init'], {
    fileName: fileName || 'recruit-video.mp4',
    contentType: contentType || 'video/mp4',
    sizeBytes,
  })
}

function saveVideoDraft(mpOrderId, applicantId, videoUrl) {
  return postPaths(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl, draft: true },
  ).then((data) => {
    try {
      const registryCache = require('./registryCache.js')
      registryCache.bust()
    } catch (_) {}
    return data
  })
}

function submitVideo(mpOrderId, applicantId, videoUrl) {
  return postPaths(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl },
  )
}

function submitVideoForReview(mpOrderId, applicantId, videoUrl) {
  return submitVideo(mpOrderId, applicantId, videoUrl).then((data) => {
    try {
      const registryCache = require('./registryCache.js')
      registryCache.bust()
    } catch (_) {}
    return data
  })
}

function reviewVideo(mpOrderId, applicantId, action, rejectReason) {
  return postPaths(
    ['/api/meoo-ops-mp-recruitment-video-review', '/api/ops-sync/mp-recruitment-orders/video-review'],
    {
      mpOrderId,
      applicantId,
      action,
      rejectReason: action === 'reject' ? String(rejectReason || '').trim() : undefined,
    },
  ).then((data) => {
    try {
      const registryCache = require('./registryCache.js')
      registryCache.bust()
    } catch (_) {}
    return data
  })
}

function submitCountLabel(count) {
  const n = Math.max(1, Number(count || 0) || 1)
  return `第 ${n} 次提交`
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

function resolveFileSize(tempPath, reported) {
  const n = Number(reported) || 0
  if (n > 0) return Promise.resolve(n)
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath: tempPath,
      success(res) {
        resolve(Number(res.size) || 0)
      },
      fail() {
        resolve(0)
      },
    })
  })
}

function readFileChunkBase64(filePath, position, length) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      position,
      length,
      success(res) {
        try {
          const buf = res.data
          if (buf && typeof wx.arrayBufferToBase64 === 'function') {
            resolve(wx.arrayBufferToBase64(buf))
            return
          }
        } catch (_) {}
        reject(new Error('读取视频分片失败'))
      },
      fail(err) {
        reject(err || new Error('读取视频分片失败'))
      },
    })
  })
}

async function postUploadBody(body) {
  let lastErr
  if (ecs.postHttpsBypassCloud && ecs.httpsApiBase()) {
    for (const path of VIDEO_UPLOAD_BODY_PATHS) {
      try {
        const res = await ecs.postHttpsBypassCloud(path, body)
        if (res && res.ok !== false && (res.mediaUrl || res.videoUrl)) return res
        throw new Error(formatErrorMessage(res, '上传失败'))
      } catch (e) {
        lastErr = e
        if (!/404|not_found/i.test(String((e && e.message) || e))) break
      }
    }
  }
  return postPaths(VIDEO_UPLOAD_BODY_PATHS, body)
}

async function uploadViaMultipart(filePath, sizeBytes, fileName, onPart) {
  const init = await postPaths(VIDEO_MULTIPART_PATHS, {
    step: 'init',
    fileName: fileName || 'recruit-video.mp4',
    contentType: 'video/mp4',
    sizeBytes,
  })
  const uploadId = String(init.uploadId || '').trim()
  const objectKey = String(init.objectKey || '').trim()
  const partSize = Number(init.partSize) || CHUNK_BYTES
  const partCount = Number(init.partCount) || Math.max(1, Math.ceil(sizeBytes / partSize))
  if (!uploadId || !objectKey) throw new Error('分片上传初始化失败')
  const parts = []
  for (let i = 0; i < partCount; i += 1) {
    const partNumber = i + 1
    const pos = i * partSize
    const len = Math.min(partSize, sizeBytes - pos)
    if (len <= 0) break
    const contentBase64 = await readFileChunkBase64(filePath, pos, len)
    if (onPart) onPart(partNumber, partCount)
    const part = await postPaths(VIDEO_MULTIPART_PATHS, {
      step: 'part',
      objectKey,
      uploadId,
      partNumber,
      contentBase64,
    })
    parts.push({ partNumber, etag: String(part.etag || '').trim() })
  }
  const done = await postPaths(VIDEO_MULTIPART_PATHS, {
    step: 'complete',
    objectKey,
    uploadId,
    fileName: fileName || 'recruit-video.mp4',
    parts,
  })
  const mediaUrl = String(done.mediaUrl || '').trim()
  if (!mediaUrl) throw new Error('分片上传未完成')
  return mediaUrl
}

function bodyUploadMaxBytes() {
  if (hasHttpsUploadChannel()) return MAX_DIRECT_BODY_MB * 1024 * 1024
  if (ecs.useCloudProxy()) return CLOUD_BODY_MB * 1024 * 1024
  return MAX_DIRECT_BODY_MB * 1024 * 1024
}

async function uploadAndSubmit(orderId, aid, tempPath, sizeBytes, fileName) {
  if (!sizeBytes) throw new Error('无法获取视频大小，请换一段视频重试')
  if (!ecs.hasBase() && !api.hasApi()) {
    throw new Error('上传通道不可用，请稍后重试')
  }
  if (sizeBytes > MAX_OSS_BODY_MB * 1024 * 1024) {
    throw new Error(`视频超过 ${MAX_OSS_BODY_MB}MB，请压缩后重试`)
  }
  // 经 erp-api 写入 OSS（服务端 putIceSourceObject），禁止云函数承载大二进制
  if (sizeBytes <= bodyUploadMaxBytes()) {
    await uploadVideoBody(orderId, aid, tempPath, fileName, sizeBytes)
    return
  }
  const mediaUrl = await uploadViaMultipart(tempPath, sizeBytes, fileName)
  await saveVideoDraft(orderId, aid, mediaUrl)
}

function uploadVideoBody(mpOrderId, applicantId, filePath, fileName, sizeBytes) {
  const maxBytes = bodyUploadMaxBytes()
  const maxMb = Math.floor(maxBytes / (1024 * 1024))
  if (!sizeBytes || sizeBytes > maxBytes) {
    return Promise.reject(new Error(`视频超过 ${maxMb}MB，请压缩后重试`))
  }
  return readFileBase64(filePath).then((contentBase64) =>
    postUploadBody({
      mpOrderId,
      applicantId,
      fileName: fileName || 'recruit-video.mp4',
      contentType: 'video/mp4',
      contentBase64,
    }),
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
    return putFileToOss(uploadUrl, tempPath, contentType).then(() => saveVideoDraft(orderId, aid, mediaUrl))
  })
}

function ensurePrivacyAuthorizeForMedia() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve()
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/i.test(msg)) {
          reject(new Error('cancel'))
          return
        }
        reject(new Error('需要同意《隐私保护指引》后才能选择视频'))
      },
    })
  })
}

function ensureAlbumPermission() {
  return new Promise((resolve) => {
    if (typeof wx.getSetting !== 'function') {
      resolve(true)
      return
    }
    wx.getSetting({
      success(setting) {
        const album = setting.authSetting && setting.authSetting['scope.album']
        if (album === true) {
          resolve(true)
          return
        }
        if (album === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册，以便选择探店视频',
            confirmText: '去设置',
            success(modal) {
              if (modal.confirm && typeof wx.openSetting === 'function') {
                wx.openSetting({ complete: () => resolve(false) })
              } else {
                resolve(false)
              }
            },
            fail: () => resolve(false),
          })
          return
        }
        if (typeof wx.authorize === 'function') {
          wx.authorize({
            scope: 'scope.album',
            success: () => resolve(true),
            fail: () => resolve(true),
          })
          return
        }
        resolve(true)
      },
      fail: () => resolve(true),
    })
  })
}

function mapPickMediaError(err) {
  const msg = String((err && err.errMsg) || err || '')
  if (/cancel/.test(msg)) return { cancel: true, message: msg }
  if (/chooseMedia:fail|chooseVideo:fail/i.test(msg)) {
    return {
      cancel: false,
      message: '无法打开相册，请检查微信相册权限后重试；也可尝试从「文件」中选择视频',
    }
  }
  if (/privacy|隐私/.test(msg)) {
    return {
      cancel: false,
      message: '需要同意《隐私保护指引》后才能选择视频，请重新点击上传按钮',
    }
  }
  if (/auth|deny|authorize/i.test(msg)) {
    return { cancel: false, message: '需要相册权限，请在设置中允许后重试' }
  }
  return { cancel: false, message: msg || '未选择视频' }
}

function getVideoDurationSec(tempPath) {
  return new Promise((resolve) => {
    if (typeof wx.getVideoInfo !== 'function') {
      resolve(0)
      return
    }
    wx.getVideoInfo({
      src: tempPath,
      success(res) {
        resolve(Number(res.duration) || 0)
      },
      fail() {
        resolve(0)
      },
    })
  })
}

function assertVideoDuration(durationSec) {
  const d = Number(durationSec) || 0
  if (d > 0 && d > MAX_VIDEO_DURATION_SEC) {
    throw new Error(`视频时长超过 ${MAX_VIDEO_DURATION_SEC} 秒（3 分钟），请剪辑后重试`)
  }
}

function assertVideoSize(sizeBytes) {
  const n = Number(sizeBytes) || 0
  if (!n) throw new Error('无法获取视频大小，请换一段视频重试')
  if (n > MAX_OSS_BODY_MB * 1024 * 1024) {
    throw new Error(`视频超过 ${MAX_OSS_BODY_MB}MB，请压缩后重试`)
  }
}

function pickVideoWithChooseMedia() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success(res) {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) {
          reject(new Error('未选择视频'))
          return
        }
        resolve({
          tempPath: f.tempFilePath,
          thumbTempFilePath: String(f.thumbTempFilePath || '').trim(),
          sizeBytes: Number(f.size) || 0,
          durationSec: Number(f.duration) || 0,
        })
      },
      fail(err) {
        const mapped = mapPickMediaError(err)
        if (mapped.cancel) {
          resolve(null)
          return
        }
        reject(new Error(mapped.message))
      },
    })
  })
}

function pickVideoWithChooseVideo() {
  return new Promise((resolve, reject) => {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: false,
      maxDuration: 60,
      success(chooseRes) {
        resolve({
          tempPath: chooseRes.tempFilePath,
          sizeBytes: Number(chooseRes.size) || 0,
          durationSec: Number(chooseRes.duration) || 0,
        })
      },
      fail(err) {
        const mapped = mapPickMediaError(err)
        if (mapped.cancel) {
          resolve(null)
          return
        }
        reject(new Error(mapped.message))
      },
    })
  })
}

function chooseVideoFile() {
  return ensurePrivacyAuthorizeForMedia()
    .then(() => ensureAlbumPermission())
    .then((ok) => {
      if (!ok) return Promise.reject(new Error('需要相册权限才能选择视频'))
      return pickVideoWithChooseMedia()
        .then((picked) => {
          if (picked === null) return null
          if (picked) return picked
          return pickVideoWithChooseVideo()
        })
        .catch((firstErr) =>
          pickVideoWithChooseVideo().catch((secondErr) => {
            throw secondErr instanceof Error ? secondErr : firstErr instanceof Error ? firstErr : new Error('未选择视频')
          }),
        )
        .then((picked) => {
          if (!picked) return null
          const fileName = (String(picked.tempPath).split('/').pop() || 'recruit-video.mp4').split('?')[0]
          return {
            tempPath: picked.tempPath,
            thumbTempFilePath: String(picked.thumbTempFilePath || '').trim(),
            sizeBytes: Number(picked.sizeBytes) || 0,
            durationSec: Number(picked.durationSec) || 0,
            fileName,
          }
        })
    })
}

function chooseAndUploadVideo(mpOrderId, applicantId, opts) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) {
    return Promise.reject(new Error('缺少报名信息'))
  }
  const onUploadStart = opts && typeof opts.onUploadStart === 'function' ? opts.onUploadStart : null
  return chooseVideoFile().then((picked) => {
    if (!picked) return false
    const { tempPath, sizeBytes: reportedSize, fileName } = picked
    return resolveFileSize(tempPath, reportedSize).then((sizeBytes) => {
      assertVideoSize(sizeBytes)
      return getVideoDurationSec(tempPath).then((durationSec) => {
        const pickedDuration = Number(picked.durationSec) || 0
        assertVideoDuration(pickedDuration > 0 ? pickedDuration : durationSec)
        if (onUploadStart) {
          try {
            onUploadStart()
          } catch (_) {}
        }
        wx.showLoading({ title: '上传中…', mask: true })
        return uploadAndSubmit(orderId, aid, tempPath, sizeBytes, fileName)
          .then(() => {
            wx.hideLoading()
            wx.showToast({ title: '上传成功', icon: 'success' })
            return true
          })
          .catch((e) => {
            wx.hideLoading()
            const msg = formatErrorMessage(e, '上传失败')
            if (!/cancel|未选择/.test(msg)) {
              wx.showModal({
                title: '上传失败',
                content: msg.slice(0, 240),
                showCancel: false,
              })
            }
            const wrapped = new Error(msg)
            wrapped._uploadErrorShown = true
            throw wrapped
          })
      })
    })
  })
}

function previewUploadedVideo(videoUrl) {
  const url = String(videoUrl || '').trim()
  if (!url) {
    wx.showToast({ title: '暂无成片', icon: 'none' })
    return
  }
  if (typeof wx.previewMedia === 'function') {
    wx.previewMedia({
      sources: [{ url, type: 'video' }],
      fail() {
        wx.showModal({
          title: '无法预览',
          content: '小程序内暂无法播放该视频，是否复制链接？',
          confirmText: '复制链接',
          success(res) {
            if (res.confirm) {
              wx.setClipboardData({
                data: url,
                success() {
                  wx.showToast({ title: '已复制视频链接', icon: 'none' })
                },
              })
            }
          },
        })
      },
    })
    return
  }
  wx.setClipboardData({
    data: url,
    success() {
      wx.showToast({ title: '已复制视频链接', icon: 'none' })
    },
  })
}

module.exports = {
  videoStatusLabel,
  isApplicantVideoVisibleOnPrReview,
  submitCountLabel,
  chooseVideoFile,
  chooseAndUploadVideo,
  saveVideoDraft,
  submitVideo,
  submitVideoForReview,
  reviewVideo,
  formatErrorMessage,
  previewUploadedVideo,
}

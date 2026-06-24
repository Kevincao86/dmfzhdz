const api = require('./api.js')
const ecs = require('./ecs.js')
const mpApiErrors = require('./mpApiErrors.js')

const MAX_DIRECT_BODY_MB = 38
const MAX_OSS_BODY_MB = 10
const CLOUD_BODY_MB = 2

const SCRIPT_SUBMIT_PATHS = ['/api/meoo-ops-mp-recruitment-script-submit']
const SCRIPT_REVIEW_PATHS = ['/api/meoo-ops-mp-recruitment-script-review']
const UPLOAD_INIT_PATHS = ['/api/meoo-ops-mp-recruitment-video-upload-init']

function formatErrorMessage(err, fallback) {
  const fb = fallback || '提交失败，请稍后重试'
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
      if (/[\u4e00-\u9fa5]/.test(msg)) return msg
      return mpApiErrors.formatMpApiErr(new Error(msg), fb)
    }
  }
  return fb
}

function scriptStatusLabel(status) {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新提交'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '待达人提交'
  return ''
}

function isApplicantScriptVisibleOnPrReview(a) {
  if (!a) return false
  const status = String(a.scriptStatus || '').trim()
  if (status === 'draft') return false
  if (status === 'rejected') return true
  const url = String(a.scriptUrl || a.scriptLinkUrl || '').trim()
  return !!url
}

function submitCountLabel(count) {
  const n = Math.max(1, Number(count || 0) || 1)
  return `第 ${n} 次提交`
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

function postOnce(path, body) {
  if (ecs.canDirectUpload()) {
    return ecs.postDirect(path, body).catch((directErr) => {
      const msg = String((directErr && directErr.message) || '')
      if (/domain|url not in|合法域名|cronet|reset|errcode:-101/i.test(msg)) {
        return api.post(path, body)
      }
      throw directErr
    })
  }
  if (ecs.hasBase() || api.hasApi()) {
    return api.post(path, body)
  }
  return api.post(path, body)
}

function bustRegistryCache() {
  try {
    const registryCache = require('./registryCache.js')
    registryCache.bust()
  } catch (_) {}
}

function saveScriptDraft(mpOrderId, applicantId, payload) {
  return postPaths(SCRIPT_SUBMIT_PATHS, {
    mpOrderId,
    applicantId,
    draft: true,
    ...payload,
  }).then((data) => {
    bustRegistryCache()
    return data
  })
}

function submitScript(mpOrderId, applicantId, payload) {
  return postPaths(SCRIPT_SUBMIT_PATHS, {
    mpOrderId,
    applicantId,
    ...payload,
  })
}

function submitScriptForReview(mpOrderId, applicantId, payload) {
  return submitScript(mpOrderId, applicantId, payload).then((data) => {
    bustRegistryCache()
    return data
  })
}

function reviewScript(mpOrderId, applicantId, action, rejectReason) {
  return postPaths(SCRIPT_REVIEW_PATHS, {
    mpOrderId,
    applicantId,
    action,
    rejectReason: action === 'reject' ? String(rejectReason || '').trim() : undefined,
  }).then((data) => {
    bustRegistryCache()
    return data
  })
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
        reject(err || new Error('读取文件失败'))
      },
    })
  })
}

function readFileUtf8(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success(res) {
        resolve(String(res.data || ''))
      },
      fail(err) {
        reject(err || new Error('读取文件失败'))
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

function putFileToOss(uploadUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          header: { 'Content-Type': contentType || 'text/plain' },
          data: res.data,
          timeout: 120000,
          success(r) {
            if (r.statusCode >= 200 && r.statusCode < 300) {
              resolve()
              return
            }
            reject(new Error(`上传失败 ${r.statusCode}`))
          },
          fail(err) {
            reject(new Error(String((err && err.errMsg) || '上传失败')))
          },
        })
      },
      fail(err) {
        reject(err || new Error('读取文件失败'))
      },
    })
  })
}

function initUpload(fileName, contentType, sizeBytes) {
  return postPaths(UPLOAD_INIT_PATHS, {
    fileName: fileName || 'recruit-script.txt',
    contentType: contentType || 'text/plain',
    sizeBytes,
  })
}

function uploadViaOss(mpOrderId, applicantId, tempPath, sizeBytes, fileName, contentType) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!sizeBytes) return Promise.reject(new Error('无法获取文件大小，请换一个文件重试'))
  return initUpload(fileName, contentType, sizeBytes).then((plan) => {
    const uploadUrl = String(plan.uploadUrl || '').trim()
    const mediaUrl = String(plan.mediaUrl || '').trim()
    const ct = plan.contentType || contentType || 'text/plain'
    if (!uploadUrl || !mediaUrl) throw new Error('上传凭证无效')
    return putFileToOss(uploadUrl, tempPath, ct).then(() =>
      saveScriptDraft(orderId, aid, { scriptUrl: mediaUrl, scriptFileName: fileName }),
    )
  })
}

function resolveContentType(fileName) {
  const name = String(fileName || '').toLowerCase()
  if (name.endsWith('.doc')) return 'application/msword'
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'text/plain'
}

function chooseScriptFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'doc', 'docx'],
      success(res) {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.path) {
          reject(new Error('未选择文件'))
          return
        }
        const fileName = String(f.name || f.path.split('/').pop() || 'script.txt').trim()
        resolve({
          tempPath: f.path,
          sizeBytes: Number(f.size) || 0,
          fileName,
        })
      },
      fail(err) {
        const msg = String((err && err.errMsg) || err || '')
        if (/cancel/i.test(msg)) {
          resolve(null)
          return
        }
        if (/chooseMessageFile:fail|privacy|隐私|authorize/i.test(msg)) {
          reject(new Error('请先同意隐私协议后再选文件，或改用「粘贴链接」'))
          return
        }
        reject(new Error(msg || '未选择文件'))
      },
    })
  })
}

function chooseAndUploadScript(mpOrderId, applicantId, opts) {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) return Promise.reject(new Error('缺少报名信息'))
  const onUploadStart = opts && typeof opts.onUploadStart === 'function' ? opts.onUploadStart : null
  return chooseScriptFile().then((picked) => {
    if (!picked) return false
    const { tempPath, sizeBytes: reportedSize, fileName } = picked
    return resolveFileSize(tempPath, reportedSize).then((sizeBytes) => {
      if (!sizeBytes) throw new Error('无法获取文件大小，请换一个文件重试')
      if (sizeBytes > MAX_OSS_BODY_MB * 1024 * 1024) {
        throw new Error(`文件超过 ${MAX_OSS_BODY_MB}MB，请压缩后重试`)
      }
      if (onUploadStart) {
        try {
          onUploadStart()
        } catch (_) {}
      }
      wx.showLoading({ title: '上传中…', mask: true })
      const contentType = resolveContentType(fileName)
      return uploadViaOss(orderId, aid, tempPath, sizeBytes, fileName, contentType)
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
}

function saveScriptLinkDraft(mpOrderId, applicantId, scriptLinkUrl) {
  const raw = String(scriptLinkUrl || '').trim()
  const link = extractHttpUrl(raw) || raw
  if (!link) return Promise.reject(new Error('请填写文档链接'))
  return saveScriptDraft(mpOrderId, applicantId, { scriptLinkUrl: link })
}

function extractHttpUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s.split(/\s/)[0]
  const m = s.match(/https?:\/\/[^\s<>"'\u4e00-\u9fa5）)]+/i)
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : ''
}

function openScriptUrl(scriptUrl, scriptLinkUrl) {
  const fileUrl = String(scriptUrl || '').trim()
  const linkHttp = extractHttpUrl(scriptLinkUrl)
  const fileHttp = extractHttpUrl(fileUrl) || (/^https?:\/\//i.test(fileUrl) ? fileUrl : '')
  const url = linkHttp || fileHttp
  if (!url) {
    wx.showToast({ title: '暂无有效链接', icon: 'none' })
    return
  }
  if (linkHttp) {
    wx.navigateTo({
      url: '/pages/web-link/web-link?url=' + encodeURIComponent(url),
      fail() {
        wx.setClipboardData({
          data: url,
          success() {
            wx.showToast({ title: '链接已复制', icon: 'none' })
          },
        })
      },
    })
    return
  }
  wx.downloadFile({
    url: fileUrl,
    success(res) {
      if (res.statusCode !== 200 || !res.tempFilePath) {
        wx.setClipboardData({
          data: fileUrl,
          success() {
            wx.showToast({ title: '已复制文件链接', icon: 'none' })
          },
        })
        return
      }
      wx.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        fail() {
          wx.setClipboardData({
            data: fileUrl,
            success() {
              wx.showToast({ title: '已复制文件链接', icon: 'none' })
            },
          })
        },
      })
    },
    fail() {
      wx.setClipboardData({
        data: fileUrl,
        success() {
          wx.showToast({ title: '已复制文件链接', icon: 'none' })
        },
      })
    },
  })
}

async function readScriptTextForAi(scriptUrl, scriptLinkUrl) {
  const link = String(scriptLinkUrl || '').trim()
  if (link) return ''
  const url = String(scriptUrl || '').trim()
  if (!url) return ''
  try {
    const res = await new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success(r) {
          if (r.statusCode === 200 && r.tempFilePath) resolve(r.tempFilePath)
          else reject(new Error('download_failed'))
        },
        fail: reject,
      })
    })
    const text = await readFileUtf8(res)
    return text.slice(0, 12000)
  } catch (_) {
    return ''
  }
}

module.exports = {
  scriptStatusLabel,
  isApplicantScriptVisibleOnPrReview,
  submitCountLabel,
  chooseScriptFile,
  chooseAndUploadScript,
  saveScriptDraft,
  saveScriptLinkDraft,
  submitScript,
  submitScriptForReview,
  reviewScript,
  formatErrorMessage,
  openScriptUrl,
  readScriptTextForAi,
}

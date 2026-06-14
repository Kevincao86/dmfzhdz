const api = require('./api.js')
const ecs = require('./ecs.js')
const mpApiErrors = require('./mpApiErrors.js')

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
  return api.post(path, body)
}

function formatErrorMessage(err, fallback) {
  const fb = fallback || '提交失败，请稍后重试'
  if (!err) return fb
  if (typeof err === 'string') return err.trim() || fb
  if (err instanceof Error) {
    const msg = String(err.message || '').trim()
    return msg || fb
  }
  if (typeof err === 'object') {
    const msg = String(err.message || err.detail || err.hint || err.errMsg || err.error || '').trim()
    if (msg) {
      if (/[\u4e00-\u9fa5]/.test(msg)) return msg
      return mpApiErrors.formatMpApiErr(new Error(msg), fb)
    }
  }
  return fb
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

function submitVisitPublishLink(mpOrderId, applicantId, publishUrl) {
  return postPaths(
    ['/api/meoo-ops-mp-recruitment-publish-link-submit'],
    { mpOrderId, applicantId, publishUrl, douyinPublishUrl: publishUrl },
  ).then((data) => {
    try {
      const registryCache = require('./registryCache.js')
      registryCache.bust()
    } catch (_) {}
    return data
  })
}

function publishLinkPlaceholder(platform) {
  const p = String(platform || '抖音').trim()
  if (p.includes('红')) return '粘贴小红书「分享」复制的整段文案或作品链接'
  if (p.includes('抖')) return '粘贴抖音分享口令或作品链接'
  return '粘贴平台作品分享链接'
}

module.exports = {
  submitVisitPublishLink,
  publishLinkPlaceholder,
  formatErrorMessage,
}

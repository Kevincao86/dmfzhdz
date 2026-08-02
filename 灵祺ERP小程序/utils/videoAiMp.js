const merchantApi = require('./merchantApi.js')
const config = require('./config.js')

async function merchantVideoGet(relPath) {
  return merchantApi.merchantRequest('GET', relPath)
}

async function merchantVideoPost(relPath, data) {
  return merchantApi.merchantRequest('POST', relPath, data)
}

async function fetchVideoAiConfig() {
  const tries = ['/api/meoo-merchant-ai-video-config', '/api/merchant/ai/video/config']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoGet(p)
      if (data && typeof data.klingConfigured === 'boolean') return { ok: true, config: data }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not found/i.test(lastErr)) break
    }
  }
  return { ok: false, message: lastErr || '无法读取视频 AI 配置' }
}

async function postKlingStart(body) {
  const tries = ['/api/meoo-merchant-ai-video-kling-start', '/api/merchant/ai/video/kling/start']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && data.taskId) {
        const pollKind = data.pollKind === 'image2video' ? 'image2video' : 'text2video'
        return { ok: true, taskId: String(data.taskId), pollKind }
      }
      lastErr = data.message || '可灵发起失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

async function fetchKlingStatus(taskId, kind) {
  const q = `?taskId=${encodeURIComponent(taskId)}&kind=${encodeURIComponent(kind)}`
  const tries = [`/api/meoo-merchant-ai-video-kling-status${q}`, `/api/merchant/ai/video/kling/status${q}`]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoGet(p)
      if (data && data.ok) {
        const phase =
          data.phase === 'queued' ||
          data.phase === 'running' ||
          data.phase === 'succeeded' ||
          data.phase === 'failed'
            ? data.phase
            : 'running'
        return {
          ok: true,
          phase,
          videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : null,
          taskStatus: typeof data.taskStatus === 'string' ? data.taskStatus : null,
        }
      }
      lastErr = data.message || '查询失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * @param {(s: string) => void} [onTick]
 */
async function pollKlingTaskUntilDone(taskId, kind, onTick, maxTries = 120, intervalMs = 4500) {
  let n = 0
  /** @type {{ ok: boolean; phase?: string; videoUrl?: string | null; message?: string }} */
  let last = { ok: false, message: '超时' }
  while (n++ < maxTries) {
    // eslint-disable-next-line no-await-in-loop
    const st = await fetchKlingStatus(taskId, kind)
    last = st
    if (!st.ok) return st
    if (typeof onTick === 'function')
      onTick(`状态：${st.taskStatus || st.phase || '处理中'}（${n}/${maxTries}）`)
    if (st.phase === 'succeeded' && st.videoUrl) return { ok: true, phase: st.phase, videoUrl: st.videoUrl }
    if (st.phase === 'failed') return { ok: false, message: '生成失败' }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { ok: false, message: typeof last.message === 'string' ? last.message : '生成超时，请稍后到电脑端队列查看' }
}

const ICE_UPLOAD_INIT_PATHS = [
  '/api/meoo-merchant-ai-video-ice-upload-init',
  '/api/merchant/ai/video/ice/upload-init',
]

async function postIceUploadInit(body) {
  let lastErr = ''
  for (const p of ICE_UPLOAD_INIT_PATHS) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && typeof data.uploadUrl === 'string' && typeof data.mediaUrl === 'string')
        return {
          ok: true,
          uploadUrl: String(data.uploadUrl),
          contentType: String(data.contentType || body.contentType || 'application/octet-stream'),
          mediaUrl: String(data.mediaUrl),
          objectKey: typeof data.objectKey === 'string' ? data.objectKey : '',
        }
      lastErr = (data && data.message) || '初始化失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '云端上传初始化失败' }
}

function putPresignedTempFile(uploadUrl, filePath, contentType) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(readRes) {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          data: readRes.data,
          header: {
            'Content-Type': contentType || 'video/mp4',
          },
          success(res) {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true })
            else resolve({ ok: false, message: `上传失败 HTTP ${res.statusCode}` })
          },
          fail(err) {
            resolve({ ok: false, message: (err && err.errMsg) || '上传中断' })
          },
        })
      },
      fail(err) {
        resolve({ ok: false, message: (err && err.errMsg) || '读取文件失败' })
      },
    })
  })
}

/**
 * 本地临时素材 → OSS → 返回 https mediaUrl，供 ICE pipeline。
 */
async function uploadLocalMediaToIceOss(opts) {
  const filePath = String(opts.filePath || '').trim()
  const fileName = String(opts.fileName || 'material.mp4').trim() || 'material.mp4'
  const contentType = String(opts.contentType || 'video/mp4').trim() || 'video/mp4'
  if (!filePath) return { ok: false, message: '无效文件路径' }

  let sizeBytes = opts.sizeBytes
  if (!Number.isFinite(Number(sizeBytes)) || Number(sizeBytes) <= 0) {
    const info = await new Promise((resolve) => {
      wx.getFileInfo({ filePath, success: resolve, fail: resolve })
    })
    sizeBytes =
      info && typeof info.size === 'number'
        ? info.size
        : 0
  }
  if (!sizeBytes || sizeBytes <= 0) return { ok: false, message: '无法读取文件大小' }

  const init = await postIceUploadInit({
    fileName,
    contentType,
    sizeBytes,
  })
  if (!init.ok) return init

  const up = await putPresignedTempFile(init.uploadUrl, filePath, init.contentType || contentType)
  if (!up.ok) return up
  return { ok: true, mediaUrl: init.mediaUrl }
}

async function postIcePipeline(body) {
  const tries = ['/api/meoo-merchant-ai-video-ice-pipeline', '/api/merchant/ai/video/ice/pipeline']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && data.jobId)
        return { ok: true, jobId: String(data.jobId), exportId: String(data.exportId || '') }
      lastErr = data.message || '云剪提交失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

async function fetchIceJob(jobId) {
  const tries = [
    `/api/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(jobId)}`,
    `/api/merchant/ai/video/ice/job?id=${encodeURIComponent(jobId)}`,
  ]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoGet(p)
      if (data && data.ok) return { ok: true, raw: data }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * @param {(s:string)=>void} [onTick]
 */
async function pollIceJob(jobId, onTick, maxTries = 80, intervalMs = 5000) {
  let n = 0
  while (n++ < maxTries) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchIceJob(jobId)
    if (!r.ok) return r
    const st = r.raw || {}
    const status = String(st.status || '')
    const done = Boolean(st.done)
    const failed = Boolean(st.failed)
    const downloadUrl = typeof st.downloadUrl === 'string' ? st.downloadUrl : ''
    const previewUrl = typeof st.previewUrl === 'string' ? st.previewUrl : ''
    const outputPending = Boolean(st.outputPending)
    if (typeof onTick === 'function') onTick(`${status || '处理中'} · ${n}/${maxTries}`)
    if (failed) return { ok: false, message: st.message || '云剪失败' }
    if (done && !failed && !outputPending && (downloadUrl || previewUrl))
      return { ok: true, downloadUrl, previewUrl, raw: st }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, intervalMs))
  }
  return { ok: false, message: '云剪等待超时' }
}

function merchantBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function iceJobDownloadUrl(jobId, inline) {
  const b = merchantBase()
  const meoo = inline
    ? `/api/meoo-merchant-ai-video-ice-job-download?id=${encodeURIComponent(jobId)}&inline=1`
    : `/api/meoo-merchant-ai-video-ice-job-download?id=${encodeURIComponent(jobId)}`
  if (!b) return meoo
  const q = inline ? `?id=${encodeURIComponent(jobId)}&inline=1` : `?id=${encodeURIComponent(jobId)}`
  return `${b}/api/merchant/ai/video/ice/job-download${q}`
}

async function postSeedanceStart(body) {
  const tries = ['/api/meoo-merchant-ai-video-seedance-start', '/api/merchant/ai/video/seedance/start']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && data.taskId) return { ok: true, taskId: String(data.taskId) }
      lastErr = data.message || '方舟发起失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

async function fetchSeedanceStatus(taskId) {
  const q = `?taskId=${encodeURIComponent(taskId)}`
  const tries = [`/api/meoo-merchant-ai-video-seedance-status${q}`, `/api/merchant/ai/video/seedance/status${q}`]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoGet(p)
      if (data && data.ok) {
        const phase =
          data.phase === 'queued' ||
          data.phase === 'running' ||
          data.phase === 'succeeded' ||
          data.phase === 'failed'
            ? data.phase
            : 'running'
        return {
          ok: true,
          phase,
          statusLabel: typeof data.statusLabel === 'string' ? data.statusLabel : phase,
          videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : undefined,
          failReason: typeof data.failReason === 'string' ? data.failReason : undefined,
        }
      }
      lastErr = data.message || '查询失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * @param {() => boolean} [shouldCancel]
 */
async function pollSeedanceUntilDone(taskId, onTick, shouldCancel, maxTries = 120, intervalMs = 5000) {
  let n = 0
  while (n++ < maxTries) {
    if (shouldCancel && shouldCancel()) return { ok: false, message: '已取消等待' }
    // eslint-disable-next-line no-await-in-loop
    const st = await fetchSeedanceStatus(taskId)
    if (!st.ok) return st
    if (typeof onTick === 'function') onTick(`生成中：${st.statusLabel || '处理中'}`)
    if (st.phase === 'succeeded' && st.videoUrl) return { ok: true, videoUrl: st.videoUrl }
    if (st.phase === 'failed') return { ok: false, message: st.failReason || '生成失败' }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { ok: false, message: '等待超时，任务可能仍在生成，请稍后重试。' }
}

/**
 * @param {() => boolean} [shouldCancel]
 */
async function pollKlingTaskUntilDoneCancel(taskId, kind, onTick, shouldCancel, maxTries = 120, intervalMs = 4500) {
  let n = 0
  let last = { ok: false, message: '超时' }
  while (n++ < maxTries) {
    if (shouldCancel && shouldCancel()) return { ok: false, message: '已取消等待' }
    // eslint-disable-next-line no-await-in-loop
    const st = await fetchKlingStatus(taskId, kind)
    last = st
    if (!st.ok) return st
    if (typeof onTick === 'function')
      onTick(st.taskStatus ? `生成中：${st.taskStatus}` : `生成中（${n}/${maxTries}）`)
    if (st.phase === 'succeeded' && st.videoUrl) return { ok: true, videoUrl: st.videoUrl }
    if (st.phase === 'failed') return { ok: false, message: '生成失败，请稍后重试。' }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { ok: false, message: typeof last.message === 'string' ? last.message : '等待超时' }
}

async function postLongformVideoPlan(body) {
  const tries = ['/api/merchant/ai/video/longform/plan', '/api/meoo-merchant-ai-video-longform-plan']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && Array.isArray(data.prompts)) {
        const prompts = data.prompts.map((x) => String(x).trim()).filter(Boolean)
        if (prompts.length) return { ok: true, prompts }
        return { ok: false, message: '分段提示词为空' }
      }
      lastErr = data.message || '长片策划失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '长片策划接口未部署' }
}

const ICE_CONFIG_PATHS = [
  '/api/meoo-merchant-ai-video-ice-config',
  '/api/merchant/ai/video/ice/config',
]

async function fetchAliyunIceCloudConfig() {
  for (const p of ICE_CONFIG_PATHS) {
    try {
      const data = await merchantVideoGet(p)
      if (data && typeof data.configured === 'boolean') return data
    } catch (_) {
      /* next */
    }
  }
  return null
}

/** 与 Web fetchIceJobStatus 字段对齐 */
async function fetchIceJobStatus(jobId) {
  const r = await fetchIceJob(jobId)
  if (!r.ok) return r
  const st = r.raw || {}
  return {
    ok: true,
    status: typeof st.status === 'string' ? st.status : '',
    progress: st.progress,
    done: Boolean(st.done),
    failed: Boolean(st.failed),
    outputPending: Boolean(st.outputPending),
    outputBytes: st.outputBytes,
    downloadUrl: typeof st.downloadUrl === 'string' ? st.downloadUrl : undefined,
    previewUrl: typeof st.previewUrl === 'string' ? st.previewUrl : undefined,
    message: typeof st.message === 'string' ? st.message : undefined,
  }
}

async function postLastFrame(body) {
  const tries = ['/api/meoo-merchant-ai-video-last-frame', '/api/merchant/ai/video/last-frame']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && (data.imageUrl || data.frameUrl || data.dataUrl)) {
        return {
          ok: true,
          imageUrl: String(data.imageUrl || data.frameUrl || data.dataUrl),
        }
      }
      lastErr = (data && data.message) || '抽帧失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '尾帧接口未部署' }
}

async function postConcatUrls(body) {
  const tries = ['/api/meoo-merchant-ai-video-concat-urls', '/api/merchant/ai/video/concat-urls']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && (data.videoUrl || data.downloadUrl || data.url)) {
        return {
          ok: true,
          videoUrl: String(data.videoUrl || data.downloadUrl || data.url),
        }
      }
      lastErr = (data && data.message) || '拼接失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '拼接接口未部署' }
}

async function postMuxAudio(body) {
  const tries = ['/api/meoo-merchant-ai-video-mux-audio', '/api/merchant/ai/video/mux-audio']
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && (data.videoUrl || data.downloadUrl || data.url)) {
        return {
          ok: true,
          videoUrl: String(data.videoUrl || data.downloadUrl || data.url),
        }
      }
      lastErr = (data && data.message) || '混音失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '混音接口未部署' }
}

async function postVideoPostProcess(body) {
  const tries = [
    '/api/meoo-merchant-ai-video-post-process',
    '/api/merchant/ai/video/post-process',
  ]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && (data.videoUrl || data.downloadUrl || data.url)) {
        return {
          ok: true,
          videoUrl: String(data.videoUrl || data.downloadUrl || data.url),
        }
      }
      lastErr = (data && data.message) || '后处理失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '后处理接口未部署' }
}

async function postIceSmartBatch(body) {
  const tries = [
    '/api/meoo-merchant-ai-video-ice-smart-batch',
    '/api/merchant/ai/video/ice/smart-batch',
  ]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoPost(p, body)
      if (data && data.ok && (data.batchJobId || data.jobId)) {
        return {
          ok: true,
          batchJobId: String(data.batchJobId || data.jobId),
          raw: data,
        }
      }
      lastErr = (data && data.message) || '智能混剪提交失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr || '智能混剪接口未部署' }
}

async function fetchIceSmartBatchJob(batchJobId) {
  const q = `?id=${encodeURIComponent(batchJobId)}`
  const tries = [
    `/api/meoo-merchant-ai-video-ice-smart-batch-job${q}`,
    `/api/merchant/ai/video/ice/smart-batch-job${q}`,
  ]
  let lastErr = ''
  for (const p of tries) {
    try {
      const data = await merchantVideoGet(p)
      if (data && data.ok) return { ok: true, raw: data }
      lastErr = (data && data.message) || '查询失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

async function pollIceSmartBatch(batchJobId, onTick, maxTries = 100, intervalMs = 5000) {
  let n = 0
  while (n++ < maxTries) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetchIceSmartBatchJob(batchJobId)
    if (!r.ok) return r
    const st = r.raw || {}
    if (typeof onTick === 'function') onTick(`${st.status || '处理中'} · ${n}/${maxTries}`)
    if (st.failed) return { ok: false, message: st.message || '智能混剪失败' }
    const url = st.downloadUrl || st.previewUrl || st.videoUrl
    if (st.done && url) return { ok: true, downloadUrl: String(url), previewUrl: String(url), raw: st }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, intervalMs))
  }
  return { ok: false, message: '智能混剪等待超时' }
}

function saveVideoToAlbum(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, message: '无视频地址' })
      return
    }
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          resolve({ ok: false, message: `下载失败 ${res.statusCode || ''}` })
          return
        }
        wx.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => resolve({ ok: true }),
          fail: (err) =>
            resolve({ ok: false, message: (err && err.errMsg) || '保存到相册失败，请检查权限' }),
        })
      },
      fail: (err) => resolve({ ok: false, message: (err && err.errMsg) || '下载失败' }),
    })
  })
}

module.exports = {
  fetchVideoAiConfig,
  postKlingStart,
  fetchKlingStatus,
  pollKlingTaskUntilDone,
  pollKlingTaskUntilDoneCancel,
  postSeedanceStart,
  fetchSeedanceStatus,
  pollSeedanceUntilDone,
  postLongformVideoPlan,
  postLastFrame,
  postConcatUrls,
  postMuxAudio,
  postVideoPostProcess,
  postIcePipeline,
  postIceSmartBatch,
  fetchIceSmartBatchJob,
  pollIceSmartBatch,
  fetchIceJob,
  fetchIceJobStatus,
  pollIceJob,
  postIceUploadInit,
  uploadLocalMediaToIceOss,
  fetchAliyunIceCloudConfig,
  iceJobDownloadUrl,
  saveVideoToAlbum,
  merchantBase,
}

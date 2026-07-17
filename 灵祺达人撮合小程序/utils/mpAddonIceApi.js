const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const media = require('./mpAddonMedia.js')
const briefCompose = require('./mpIceBriefCompose.js')
const addonApi = require('./mpAddonMerchantApi.js')
const ossTransport = require('./mpOssUploadTransport.js')

const ICE_ASPECT_PRESETS = [
  { id: '9:16', label: '9:16 竖屏', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9 横屏', width: 1920, height: 1080 },
  { id: '1:1', label: '1:1', width: 1080, height: 1080 },
]

const ICE_BATCH_COUNTS = [10, 20, 50, 100]
/** 与星选 ShortVideoIceBatchPanel / iceMixPlan.MIX_TARGET_TOTAL_OPTIONS 对齐 */
const MIX_TARGET_TOTAL_OPTIONS = [10, 20, 30, 45, 60]
/** 短视频生成：短片单段（星选关闭长视频时） */
const SHORT_VIDEO_DURATION_OPTIONS = ['5', '10', '15']
/** 与星选 ShortVideoOptimizationPage 长视频目标总时长对齐 */
const LONGFORM_TARGET_TOTAL_OPTIONS = ['15', '30', '45', '60']
/** 与星选 iceEffectPresets / GET ice/config effectOptions 对齐（接口失败时本地兜底） */
const ICE_EFFECT_PRESET_LABELS = [
  '无附加特效',
  '淡入淡出',
  '叠化转场',
  '向右擦除',
  '向左擦除',
  '向上擦除',
  '向下擦除',
  '放大切换',
  '蔓延溶解',
  '方向推移',
  '中心旋转',
  '开幕转场',
  '波纹转场',
  '燃烧转场',
  '故障转场',
  '像素溶解',
  '向上弹动',
  '轻微摇摆',
  '爱心遮罩',
  '万花筒',
  '随机转场',
  '淡入淡出+叠化',
]

function mpAuthHeaders() {
  const token = sessionStore.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

async function postPaths(paths, body, headers) {
  let lastErr = 'request_failed'
  if (ossTransport.isOssUploadRequest(paths[0], body)) {
    try {
      const data = await ossTransport.postOssUploadPaths(paths, body, headers)
      if (data && data.ok === false) {
        return { ok: false, message: String(data.message || data.error || '请求失败'), data }
      }
      return { ok: true, data }
    } catch (e) {
      throw e
    }
  }
  for (const p of paths) {
    try {
      const data = await ecs.post(p, body, headers)
      if (data && data.ok === false) {
        const msg = String(data.message || data.error || '请求失败')
        lastErr = msg
        if (/404|not_found/i.test(msg)) continue
        return { ok: false, message: msg, data }
      }
      return { ok: true, data }
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e)
      if (/404|not_found/i.test(lastErr)) continue
      throw e
    }
  }
  return { ok: false, message: lastErr }
}

async function getPaths(paths, headers) {
  let lastErr = 'request_failed'
  for (const p of paths) {
    try {
      const data = await ecs.get(p, headers)
      if (data && data.ok === false) {
        const msg = String(data.message || data.error || '请求失败')
        lastErr = msg
        if (/404|not_found/i.test(msg)) continue
        return { ok: false, message: msg, data }
      }
      return { ok: true, data }
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e)
      if (/404|not_found/i.test(lastErr)) continue
      throw e
    }
  }
  return { ok: false, message: lastErr }
}

async function fetchIceConfig() {
  try {
    const r = await getPaths(
      [
        '/api/meoo-merchant-ai-video-ice-config',
        '/api/merchant/ai/video/ice/config',
      ],
      mpAuthHeaders(),
    )
    if (r.ok && r.data) {
      const d = r.data
      const fromOpts =
        Array.isArray(d.effectOptions) && d.effectOptions.length
          ? d.effectOptions.map((o) => (o && o.label ? String(o.label) : '')).filter(Boolean)
          : []
      const fromPresets = Array.isArray(d.presets) ? d.presets.map(String).filter(Boolean) : []
      const presets = fromOpts.length ? fromOpts : fromPresets.length ? fromPresets : ICE_EFFECT_PRESET_LABELS
      return {
        ...d,
        configured: !!d.configured,
        presets,
        effectOptions:
          d.effectOptions && d.effectOptions.length
            ? d.effectOptions
            : ICE_EFFECT_PRESET_LABELS.map((label, i) => ({ id: `local_${i}`, label })),
      }
    }
  } catch (_) {
    /* fall through */
  }
  return {
    configured: false,
    presets: ICE_EFFECT_PRESET_LABELS,
    effectOptions: ICE_EFFECT_PRESET_LABELS.map((label, i) => ({ id: `local_${i}`, label })),
  }
}

async function uploadIceLocalFile(filePath, fileName, contentType) {
  const pure = await media.readFileBase64(filePath)
  const r = await postPaths(
    ['/api/meoo-merchant-ai-video-ice-upload', '/api/merchant/ai/video/ice/upload'],
    { fileName, contentType, contentBase64: pure },
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  const mediaUrl = String(d.mediaUrl || '').trim()
  if (!mediaUrl) return { ok: false, message: '上传未返回素材地址' }
  return { ok: true, mediaUrl, timelineUrl: d.timelineUrl, label: d.label || fileName }
}

async function postIcePipeline(body) {
  const r = await postPaths(
    [
      '/api/meoo-merchant-ai-video-ice-pipeline',
      '/api/merchant/ai/video/ice/pipeline',
    ],
    body,
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  const jobId = String(d.jobId || d.exportId || '').trim()
  if (!jobId) return { ok: false, message: '云剪未返回任务 ID' }
  return { ok: true, jobId, exportId: jobId, projectId: d.projectId }
}

async function fetchIceJobStatus(jobId) {
  const qs = `?id=${encodeURIComponent(jobId)}`
  const r = await getPaths(
    [
      `/api/meoo-merchant-ai-video-ice-job${qs}`,
      `/api/merchant/ai/video/ice/job${qs}`,
    ],
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  const status = String(d.status || '').toLowerCase()
  const done = !!d.done || status === 'success' || status === 'succeeded'
  const failed = !!d.failed || status === 'failed'
  return {
    ok: true,
    status,
    progress: d.progress,
    done,
    failed,
    downloadUrl: d.downloadUrl ? String(d.downloadUrl) : '',
    previewUrl: d.previewUrl ? String(d.previewUrl) : '',
    message: d.message ? String(d.message) : '',
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollIceJob(jobId, onProgress, maxTries) {
  const limit = maxTries || 120
  for (let i = 0; i < limit; i += 1) {
    const st = await fetchIceJobStatus(jobId)
    if (!st.ok) return st
    if (onProgress) {
      const pct = st.progress != null ? ` ${Math.round(st.progress <= 1 ? st.progress * 100 : st.progress)}%` : ''
      onProgress((st.message || st.status || '云端剪辑中') + pct, i + 1)
    }
    if (st.done && (st.downloadUrl || st.previewUrl)) {
      return { ok: true, videoUrl: st.downloadUrl || st.previewUrl }
    }
    if (st.failed) return { ok: false, message: st.message || '云剪失败' }
    await sleep(5000)
  }
  return { ok: false, message: '云剪超时，请稍后在星选平台查看' }
}

function parseUrlLines(text) {
  return String(text || '')
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

async function generateIceEditBriefAi(ctx) {
  const hasMedia = (ctx.imageUrls && ctx.imageUrls.length) || (ctx.videoUrls && ctx.videoUrls.length)
  if (!hasMedia) return { ok: false, message: '请先上传至少一张图片或一条视频素材' }
  const titleDraft = [
    '请根据下列素材推断发布意图，并分别输出「上屏字幕文案」与「剪辑操作指令」。',
    '必须严格按以下两行标题分段输出：',
    '【剪辑指令】',
    '（BGM、节奏、转场、色调等，不上屏）',
    '【字幕文案】',
    '（4-20字短句，与镜头对应）',
    `全片约 ${ctx.clipEndSec} 秒；画幅 ${ctx.aspectLabel}；特效 ${ctx.preset}。`,
    '',
    `图片 ${(ctx.imageUrls || []).length} 张，视频 ${(ctx.videoUrls || []).length} 条。`,
    ctx.userHint ? `补充：${ctx.userHint}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const r = await addonApi.postDouyinAiAssist({
    model: ctx.model || 'qwen',
    action: 'operation_article',
    product_name: '门店短视频',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return { ok: false, message: r.message || 'AI 未返回有效文案' }
  const brief = briefCompose.sanitize(r.description.trim())
  const split = briefCompose.splitIceEditBrief(brief)
  return {
    ok: true,
    brief,
    copy: briefCompose.sanitize(split.copy),
    instruction: briefCompose.sanitize(split.instruction),
  }
}

function iceDownloadPath(jobId) {
  return `/api/meoo-merchant-ai-video-ice-job-download?id=${encodeURIComponent(jobId)}`
}

module.exports = {
  ICE_ASPECT_PRESETS,
  ICE_BATCH_COUNTS,
  MIX_TARGET_TOTAL_OPTIONS,
  SHORT_VIDEO_DURATION_OPTIONS,
  LONGFORM_TARGET_TOTAL_OPTIONS,
  ICE_EFFECT_PRESET_LABELS,
  fetchIceConfig,
  uploadIceLocalFile,
  postIcePipeline,
  fetchIceJobStatus,
  pollIceJob,
  parseUrlLines,
  generateIceEditBriefAi,
  iceDownloadPath,
  composeIceEditBrief: briefCompose.composeIceEditBrief,
  splitIceEditBrief: briefCompose.splitIceEditBrief,
}
